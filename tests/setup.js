/**
 * Jest setup file.
 * Defines the globals that content_script.js and popup.js get from init.js.
 */
Object.assign(global, require('../init'));
