// Selects a deterministic shard of Cypress spec files for a CI matrix.
// Usage: node scripts/shard-specs.mjs <shard 1-based> <total shards>
import fs from 'node:fs';
import path from 'node:path';

const shard = Number(process.argv[2] ?? '1');
const total = Number(process.argv[3] ?? '2');

if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) {
  console.error('Usage: node scripts/shard-specs.mjs <shard> <total>');
  process.exit(1);
}

const specDirectory = path.join(process.cwd(), 'cypress', 'e2e');
const specs = fs
  .readdirSync(specDirectory)
  .filter((file) => file.endsWith('.cy.ts'))
  .sort()
  .map((file) => `cypress/e2e/${file}`);

const selected = specs.filter((_, index) => index % total === shard - 1);
if (selected.length === 0) {
  console.error(`No specs selected for shard ${shard}/${total}`);
  process.exit(1);
}
console.log(selected.join(','));
