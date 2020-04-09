// @ts-check
const { mkdirSync, readFileSync, writeFileSync } = require('fs');
const { basename, join, resolve } = require('path');
const { StringDecoder } = require('string_decoder');
const { PREFS } = require('./prefs');
const { getFirefoxWithFallbackOnOSX, getFirefoxExe } = require('./utils');

const FirefoxBrowserWsl2Linux = function (_id, baseBrowserDecorator, args) {
    baseBrowserDecorator(this);
    let browserProcessPid;

    this._getPrefs = function (prefs) {
        if (typeof prefs !== 'object' && prefs !== null) {
            return PREFS;
        }
        let result = PREFS;
        for (const key in prefs) {
            result += 'user_pref("' + key + '", ' + JSON.stringify(prefs[key]) + ');\n';
        }
        return result;
    }

    this._start = function (url) {
        const command = this._getCommand();
        const profilePath = args.profile || this._tempDir;
        const flags = args.flags || [];
        let extensionsDir;

        if (Array.isArray(args.extensions)) {
            extensionsDir = resolve(profilePath, 'extensions');
            mkdirSync(extensionsDir);
            args.extensions.forEach(function (ext) {
                const extBuffer = readFileSync(ext);
                const copyDestination = resolve(extensionsDir, basename(ext));
                writeFileSync(copyDestination, extBuffer);
            });
        }

        writeFileSync(join(profilePath, 'prefs.js'), this._getPrefs(args.prefs));

        // If we are using the launcher process, make it print the child process ID
        // to stderr so we can capture it.
        //
        // https://wiki.mozilla.org/Platform/Integration/InjectEject/Launcher_Process/
        // @ts-ignore
        process.env.MOZ_DEBUG_BROWSER_PAUSE = 0;
        browserProcessPid = undefined;
        this._execCommand(
            command,
            [url, '-profile', profilePath, '-no-remote', '-wait-for-browser'].concat(flags)
        );

        this._process.stderr.on('data', errBuff => {
            let errString;
            if (typeof errBuff === 'string') {
                errString = errBuff;
            } else {
                const decoder = new StringDecoder('utf8');
                errString = decoder.write(errBuff);
            }
            const matches = errString.match(/BROWSERBROWSERBROWSERBROWSER\s+debug me @ (\d+)/);
            if (matches) {
                browserProcessPid = parseInt(matches[1], 10);
            }
        })
    }

    this.on('kill', function (done) {
        // If we have a separate browser process PID, try killing it.
        if (browserProcessPid) {
            try {
                process.kill(browserProcessPid);
            } catch (e) {
                // Ignore failure -- the browser process might have already been
                // terminated.
            }
        }

        return process.nextTick(done);
    })
}

FirefoxBrowserWsl2Linux.prototype = {
    name: 'Firefox',

    DEFAULT_CMD: {
        linux: 'firefox',
        freebsd: 'firefox',
        darwin: getFirefoxWithFallbackOnOSX('Firefox'),
        win32: getFirefoxExe('Mozilla Firefox')
    },
    ENV_CMD: 'FIREFOX_BIN'
}

exports.FirefoxBrowserWsl2Linux = FirefoxBrowserWsl2Linux;
module.exports = FirefoxBrowserWsl2Linux;
