// @ts-check
const { makeHeadlessVersion } = require('./utils');
const FirefoxBrowserWsl2Linux = require('./browser-wsl2-linux');

const FirefoxHeadlessBrowserWsl2Linux = makeHeadlessVersion(FirefoxBrowserWsl2Linux);

module.exports = FirefoxHeadlessBrowserWsl2Linux;
