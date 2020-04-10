
// @ts-check
const { mkdirSync, readFileSync, writeFileSync } = require('fs');
const { basename, join, resolve } = require('path');
const { StringDecoder } = require('string_decoder');
const { PREFS, HEADLESS } = require('./prefs');
const { getFirefoxWithFallbackOnOSX, getFirefoxExe, getFirefoxExeWsl } = require('./utils');
const { execSync, exec, spawn } = require('child_process');

const FirefoxBrowserWsl2Windows = function (id, baseBrowserDecorator, args) {
    baseBrowserDecorator(this);
    let browserProcessPid;

    console.log('HEADLESS', args.headless);

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
        const translatedProfilePath = execSync('wslpath -w ' + profilePath).toString().trim();

        // Translate command to a windows path to make it possisible to get the pid.
        const commandPrepare = command.split('/').slice(0, -1).map(x => x.replace(' ', '\\ ')).join('/');
        const commandTranslatePath = execSync('wslpath -w ' + commandPrepare).toString().trim();
        const commandTranslated = commandTranslatePath + '\\firefox.exe'

        // If we are using the launcher process, make it print the child process ID
        // to stderr so we can capture it.
        //
        // https://wiki.mozilla.org/Platform/Integration/InjectEject/Launcher_Process/
        // @ts-ignore

        /*
        Custom launch implementation that mimics firefox docs:
        Start firefox on windows and send process id back via stderr,
        to keep inline with the mozilla strategy.
        */
        this._execCommand = spawn('/bin/bash', ['-c',
            `
            processString=$(wmic.exe process call create "${commandTranslated}\
                ${url}\
                -profile ${translatedProfilePath}\
                -no-remote\
                -wait-for-browser\
                ${ args.headless ? HEADLESS.join(' ') + '\\' : '' }
                ${flags.join(' ')}\
            ");

            while IFS= read -r line; do
                if [[ $line == *"ProcessId = "* ]]; then
            
                    removePrefix=\${line#*ProcessId = }
                    removeSuffix=\${removePrefix%;*}
                    pid=$removeSuffix
            
                    debugString="BROWSERBROWSERBROWSERBROWSER debug me @ $pid"
                    echo >&2 "$debugString"
                    exit 0
            
                fi
            done < <(printf '%s\n' "$processString")
            exit 0;
            `],
        );

        this._execCommand.stderr.on('data', errBuff => {
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
        });
    }

    this.on('kill', function (done) {
        // Kill child process if still running.
        if (this._execCommand) {
            this._execCommand.kill();

            // Kill browser on windows if still exists.
            if (browserProcessPid) {
                try {
                    exec(`Taskkill.exe /PID ${browserProcessPid} /F /FI "STATUS eq RUNNING"`)
                } catch (e) {
                    // Ignore failure -- the browser process might have already been
                    // terminated.
                }
            }
        }

        return process.nextTick(done);
    });
}

FirefoxBrowserWsl2Windows.$inject = ['id', 'baseBrowserDecorator', 'args'];

FirefoxBrowserWsl2Windows.prototype = {
    name: 'Firefox',

    DEFAULT_CMD: {
        linux: getFirefoxExeWsl('Mozilla Firefox'),
        freebsd: 'firefox',
        darwin: getFirefoxWithFallbackOnOSX('Firefox'),
        win32: getFirefoxExe('Mozilla Firefox')
    },
    ENV_CMD: 'FIREFOX_BIN'
};

module.exports = FirefoxBrowserWsl2Windows;
