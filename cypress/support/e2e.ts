import './commands';

// @cypress/grep ships no typed default export for its support subpath.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const registerCypressGrep = require('@cypress/grep');
registerCypressGrep();
