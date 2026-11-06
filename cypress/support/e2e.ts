import './commands';

// @cypress/grep ships no typed default export for its support subpath.
const registerCypressGrep = require('@cypress/grep');
registerCypressGrep();
