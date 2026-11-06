import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

interface FailureMessage {
  title: string;
  message: string;
}

interface SpecResult {
  spec: string;
  tests: number;
  passes: number;
  failures: number;
  pending: number;
  durationMs: number;
  failureMessages: FailureMessage[];
}

const reportDirectory = path.resolve(process.argv[2] ?? 'cypress/reports');
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function walk(directory: string, extension: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

function numberAttribute(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface MergedTest {
  title: string;
  state: 'passed' | 'failed' | 'pending';
  error: string | null;
  durationMs: number;
}

function parseJsonResults(): SpecResult[] {
  // Smoke and regression runs produce one report per spec. Merge by test title
  // across reports so a test that is pending in one tagged run and executed in
  // another is counted exactly once.
  const specs = new Map<
    string,
    { durationMs: number; tests: Map<string, MergedTest> }
  >();

  for (const file of walk(reportDirectory, '.json')) {
    try {
      const parsed = asRecord(JSON.parse(fs.readFileSync(file, 'utf8')));
      const spec = typeof parsed['spec'] === 'string' ? parsed['spec'] : '';
      const stats = asRecord(parsed['stats']);
      if (!spec || typeof stats['tests'] !== 'number') {
        continue;
      }

      const entry = specs.get(spec) ?? { durationMs: 0, tests: new Map<string, MergedTest>() };
      entry.durationMs = Math.max(entry.durationMs, numberAttribute(stats['duration']));

      for (const rawTest of asArray(parsed['tests'])) {
        const test = asRecord(rawTest);
        if (typeof test['title'] !== 'string') {
          continue;
        }
        const rawState = test['state'];
        const state: MergedTest['state'] =
          rawState === 'failed' ? 'failed' : rawState === 'passed' ? 'passed' : 'pending';
        const candidate: MergedTest = {
          title: test['title'],
          state,
          error:
            state === 'failed' && typeof test['error'] === 'string'
              ? test['error']
              : null,
          durationMs: numberAttribute(test['duration']),
        };

        const existing = entry.tests.get(candidate.title);
        if (!existing) {
          entry.tests.set(candidate.title, candidate);
        } else if (existing.state === 'pending' && candidate.state !== 'pending') {
          entry.tests.set(candidate.title, candidate);
        } else if (existing.state !== 'failed' && candidate.state === 'failed') {
          entry.tests.set(candidate.title, candidate);
        } else if (
          existing.state === candidate.state &&
          candidate.durationMs > existing.durationMs
        ) {
          entry.tests.set(candidate.title, candidate);
        }
      }
      specs.set(spec, entry);
    } catch (error) {
      console.warn(`triage: could not read JSON report ${file}: ${String(error)}`);
    }
  }

  return [...specs.entries()].map(([spec, entry]) => {
    const tests = [...entry.tests.values()];
    const failures = tests.filter((test) => test.state === 'failed');
    return {
      spec,
      tests: tests.length,
      passes: tests.filter((test) => test.state === 'passed').length,
      failures: failures.length,
      pending: tests.filter((test) => test.state === 'pending').length,
      durationMs: entry.durationMs,
      failureMessages: failures.map((test) => ({
        title: test.title,
        message: test.error ?? 'Test failed without a message',
      })),
    };
  });
}

function parseJunitResults(): SpecResult[] {
  const results: SpecResult[] = [];

  for (const file of walk(reportDirectory, '.xml')) {
    try {
      const parsed = asRecord(xmlParser.parse(fs.readFileSync(file, 'utf8')));
      const testsuites = asRecord(parsed['testsuites']);
      const suites = asArray(testsuites['testsuite']);
      let spec = '';
      let tests = 0;
      let failures = 0;
      let pending = 0;
      let durationMs = 0;
      const failureMessages: FailureMessage[] = [];

      for (const rawSuite of suites) {
        const suite = asRecord(rawSuite);
        if (!spec && typeof suite['@_file'] === 'string') {
          spec = suite['@_file'];
        }
        tests += numberAttribute(suite['@_tests']);
        failures += numberAttribute(suite['@_failures']);
        pending += numberAttribute(suite['@_skipped']);
        durationMs += numberAttribute(suite['@_time']) * 1000;

        for (const rawCase of asArray(suite['testcase'])) {
          const testCase = asRecord(rawCase);
          const failure = asRecord(testCase['failure']);
          if (Object.keys(failure).length > 0) {
            failureMessages.push({
              title: typeof testCase['@_name'] === 'string' ? testCase['@_name'] : 'unnamed test',
              message:
                typeof failure['@_message'] === 'string'
                  ? failure['@_message']
                  : typeof failure['#text'] === 'string'
                    ? failure['#text']
                    : 'Test failed without a message',
            });
          }
        }
      }

      if (!spec) {
        spec = path.basename(file).replace(/^results-/, '').replace(/\.xml$/, '');
      }
      results.push({
        spec,
        tests,
        passes: Math.max(0, tests - failures - pending),
        failures,
        pending,
        durationMs,
        failureMessages,
      });
    } catch (error) {
      console.warn(`triage: could not read JUnit report ${file}: ${String(error)}`);
    }
  }

  return results;
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '0.00%' : `${((part / whole) * 100).toFixed(2)}%`;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}

function buildMarkdown(results: SpecResult[]): string {
  const totalTests = results.reduce((sum, result) => sum + result.tests, 0);
  const totalPasses = results.reduce((sum, result) => sum + result.passes, 0);
  const totalFailures = results.reduce((sum, result) => sum + result.failures, 0);
  const totalPending = results.reduce((sum, result) => sum + result.pending, 0);
  const totalDuration = results.reduce((sum, result) => sum + result.durationMs, 0);

  const lines: string[] = [
    '## Cypress test triage',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Total tests | ${totalTests} |`,
    `| Passed | ${totalPasses} |`,
    `| Failed | ${totalFailures} |`,
    `| Skipped / pending | ${totalPending} |`,
    `| Pass rate | ${percent(totalPasses, totalTests)} |`,
    `| Specs | ${results.length} |`,
    `| Total duration | ${formatSeconds(totalDuration)} |`,
    '',
    '### Slowest 5 specs',
    '',
    '| Spec | Tests | Duration | Pass rate |',
    '| --- | ---: | ---: | ---: |',
  ];

  const slowest = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  for (const result of slowest) {
    lines.push(
      `| ${escapeCell(result.spec)} | ${result.tests} | ${formatSeconds(
        result.durationMs,
      )} | ${percent(result.passes, result.tests)} |`,
    );
  }

  lines.push(
    '',
    '### Per-spec pass rate',
    '',
    '| Spec | Passed | Failed | Skipped | Pass rate |',
    '| --- | ---: | ---: | ---: | ---: |',
  );
  for (const result of [...results].sort((a, b) => a.spec.localeCompare(b.spec))) {
    lines.push(
      `| ${escapeCell(result.spec)} | ${result.passes} | ${result.failures} | ${
        result.pending
      } | ${percent(result.passes, result.tests)} |`,
    );
  }

  lines.push('', '### Failures by spec', '');
  const failing = results.filter((result) => result.failures > 0);
  if (failing.length === 0) {
    lines.push('_No failures in this run._');
  } else {
    for (const result of failing) {
      lines.push(`#### ${result.spec} (${result.failures} failed)`, '');
      for (const failure of result.failureMessages) {
        lines.push(`- **${failure.title}** — ${failure.message.replace(/\s+/g, ' ').trim()}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

const junitResults = parseJunitResults();
const jsonResults = parseJsonResults();
const merged = new Map<string, SpecResult>();

for (const result of junitResults) {
  merged.set(result.spec, result);
}
for (const result of jsonResults) {
  merged.set(result.spec, result);
}

const results = [...merged.values()];

if (results.length === 0) {
  console.log(`No Cypress JSON or JUnit reports found under ${reportDirectory}`);
  process.exit(0);
}

const markdown = buildMarkdown(results);
console.log(markdown);

const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
if (summaryPath) {
  fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
}
