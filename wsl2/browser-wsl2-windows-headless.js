// @ts-check
const FirefoxBrowserWsl2Windows = require('./browser-wsl2-windows');

const makeHeadlessVersion = function (Browser) {
    const HeadlessBrowser = function () {
        arguments[2].headless = true;
        Browser.apply(this, arguments);
    }

    HeadlessBrowser.prototype = Object.create(Browser.prototype, {
        name: { value: Browser.prototype.name + 'Headless' }
    });
    HeadlessBrowser.$inject = Browser.$inject;
    return HeadlessBrowser;
};

const FirefoxHeadlessBrowserWsl2Windows = makeHeadlessVersion(FirefoxBrowserWsl2Windows)

module.exports = FirefoxHeadlessBrowserWsl2Windows;

