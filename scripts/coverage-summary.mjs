import fs from 'node:fs';

const file = 'app/coverage/coverage-summary.json';
if (!fs.existsSync(file)) {
  console.log(`Coverage summary not found at ${file}`);
  process.exit(0);
}

const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
const metrics = ['statements', 'branches', 'functions', 'lines'];
const total = summary.total;

const lines = [
  '## Domain unit test coverage',
  '',
  '| Metric | Covered | Total | Percent |',
  '| --- | ---: | ---: | ---: |',
];

for (const metric of metrics) {
  const entry = total[metric];
  lines.push(
    `| ${metric[0].toUpperCase()}${metric.slice(1)} | ${entry.covered} | ${entry.total} | ${entry.pct}% |`,
  );
}

for (const [filePath, entry] of Object.entries(summary)) {
  if (filePath === 'total') {
    continue;
  }
  lines.push('', `**${filePath}**`);
  lines.push('', '| Metric | Percent |', '| --- | ---: |');
  for (const metric of metrics) {
    lines.push(`| ${metric} | ${entry[metric].pct}% |`);
  }
}

const markdown = lines.join('\n');
console.log(markdown);
if (process.env['GITHUB_STEP_SUMMARY']) {
  fs.appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `${markdown}\n`, 'utf8');
}
