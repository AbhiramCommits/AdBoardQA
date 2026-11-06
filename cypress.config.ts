import { defineConfig } from 'cypress';

// @cypress/grep's plugin has no published TypeScript declaration for its subpath.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cypressGrepPlugin = require('@cypress/grep/src/plugin') as (
  config: Cypress.PluginConfigOptions,
) => Cypress.PluginConfigOptions;

export default defineConfig({
  e2e: {
    baseUrl: process.env['CYPRESS_BASE_URL'] ?? 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures',
    video: true,
    screenshotOnRunFailure: true,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    viewportWidth: 1280,
    viewportHeight: 800,
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
      reporterEnabled:
        'mocha-junit-reporter, ./scripts/mocha-json-reporter.cjs',
      mochaJunitReporterReporterOptions: {
        mochaFile: 'cypress/reports/junit/results-[hash].xml',
        toConsole: false,
        includePending: true,
      },
    },
    setupNodeEvents(on, config) {
      cypressGrepPlugin(config);
      return config;
    },
  },
});
