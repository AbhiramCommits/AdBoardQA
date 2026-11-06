'use strict';

/**
 * Minimal Mocha reporter that writes one machine-readable JSON result file per
 * Cypress spec. cypress-multi-reporters instantiates it alongside
 * mocha-junit-reporter, so CI gets both a JUnit file and JSON for triage.
 */

const fs = require('node:fs');
const path = require('node:path');
const Mocha = require('mocha');

const OUTPUT_DIR = path.join(process.cwd(), 'cypress', 'reports', 'json');

class JsonSummaryReporter extends Mocha.reporters.Base {
  constructor(runner) {
    super(runner);

    const tests = [];
    let passes = 0;
    let failures = 0;
    let pending = 0;
    const startedAt = Date.now();

    runner.on('pass', (test) => {
      passes += 1;
      tests.push({
        title: test.fullTitle(),
        state: 'passed',
        duration: test.duration ?? 0,
        error: null,
      });
    });

    runner.on('fail', (test, error) => {
      failures += 1;
      tests.push({
        title: test.fullTitle(),
        state: 'failed',
        duration: test.duration ?? 0,
        error: error && error.message ? error.message : String(error),
      });
    });

    runner.on('pending', (test) => {
      pending += 1;
      tests.push({
        title: test.fullTitle(),
        state: 'pending',
        duration: 0,
        error: null,
      });
    });

    runner.on('end', () => {
      const spec =
        (runner.suite && (runner.suite.file || runner.suite.title)) ||
        `spec-${Date.now()}`;
      const duration =
        (runner.stats && runner.stats.duration) || Date.now() - startedAt;
      const payload = {
        spec,
        stats: {
          tests: tests.length,
          passes,
          failures,
          pending,
          duration,
        },
        tests,
      };

      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const safeName = path
        .basename(spec)
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .replace(/\.ts$/, '');
      const outputPath = path.join(
        OUTPUT_DIR,
        `${safeName || 'spec'}-${Date.now()}.json`,
      );
      fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    });
  }
}

module.exports = JsonSummaryReporter;
