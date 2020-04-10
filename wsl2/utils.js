// @ts-check
const { join } = require('path');
const { existsSync } = require('fs');
const { execSync } = require('child_process');
const { HEADLESS } = require('./prefs');

// Get all possible Program Files folders even on other drives
// inspect the user's path to find other drives that may contain Program Files folders
const getAllPrefixes = function () {
    const drives = [];
    const paden = process.env.Path.split(';');
    const re = /^[A-Z]:\\/i;
    let pad;
    for (let p = 0; p < paden.length; p++) {
        pad = paden[p];
        if (re.test(pad) && drives.indexOf(pad[0]) === -1) {
            drives.push(pad[0]);
        }
    }

    const result = [];
    const prefixes = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']];
    let prefix;
    for (let i = 0; i < prefixes.length; i++) {
        if (typeof prefixes[i] !== 'undefined') {
            for (let d = 0; d < drives.length; d += 1) {
                prefix = drives[d] + prefixes[i].substr(1);
                if (result.indexOf(prefix) === -1) {
                    result.push(prefix);
                }
            }
        }
    }
    return result;
}

exports.getFirefoxWithFallbackOnOSX = function () {
    if (process.platform !== 'darwin') {
        return null;
    }

    const firefoxDirNames = Array.prototype.slice.call(arguments);
    const prefix = '/Applications/';
    const suffix = '.app/Contents/MacOS/firefox-bin';

    let bin;
    let homeBin;
    for (let i = 0; i < firefoxDirNames.length; i++) {
        bin = prefix + firefoxDirNames[i] + suffix

        if ('HOME' in process.env) {
            homeBin = join(process.env.HOME, bin);

            if (existsSync(homeBin)) {
                return homeBin;
            }
        }

        if (existsSync(bin)) {
            return bin;
        }
    }
};

// Return location of firefox.exe file for a given Firefox directory
// (available: "Mozilla Firefox", "Aurora", "Nightly").
exports.getFirefoxExe = function (firefoxDirName) {
    // @ts-ignore
    if (process.platform !== 'win32' && process.platform !== 'win64') {
        return null;
    }

    const firefoxDirNames = Array.prototype.slice.call(arguments);

    for (const prefix of getAllPrefixes()) {
        for (const dir of firefoxDirNames) {
            const candidate = join(prefix, dir, 'firefox.exe');
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return join('C:\\Program Files', firefoxDirNames[0], 'firefox.exe');
};

exports.makeHeadlessVersion = function (Browser) {
    const HeadlessBrowser = function () {
        Browser.apply(this, arguments);
        const execCommand = this._execCommand;
        this._execCommand = function (command, args) {
            // --start-debugger-server ws:6000 can also be used, since remote debugging protocol also speaks WebSockets
            // https://hacks.mozilla.org/2017/12/using-headless-mode-in-firefox/
            execCommand.call(this, command, args.concat(HEADLESS))
        };
    }

    HeadlessBrowser.prototype = Object.create(Browser.prototype, {
        name: { value: Browser.prototype.name + 'Headless' }
    });
    HeadlessBrowser.$inject = Browser.$inject;
    return HeadlessBrowser;
};

const getAllPrefixesWsl = function () {
    const drives = [];
    // Some folks configure their wsl.conf to mount Windows drives without the
    // /mnt prefix (e.g. see https://nickjanetakis.com/blog/setting-up-docker-for-windows-and-wsl-to-work-flawlessly)
    //
    // In fact, they could configure this to be any number of things. So we
    // take each path, convert it to a Windows path, check if it looks like
    // it starts with a drive and then record that.
    const re = /^([A-Z]):\\/i;
    for (const pathElem of process.env.PATH.split(':')) {
        if (existsSync(pathElem)) {
            const windowsPath = execSync('wslpath -w "' + pathElem + '"').toString();
            const matches = windowsPath.match(re);
            if (matches !== null && drives.indexOf(matches[1]) === -1) {
                drives.push(matches[1]);
            }
        }
    }

    const result = [];
    // We don't have the PROGRAMFILES or PROGRAMFILES(X86) environment variables
    // in WSL so we just hard code them.
    const prefixes = ['Program Files', 'Program Files (x86)'];
    for (const prefix of prefixes) {
        for (const drive of drives) {
            // We only have the drive, and only wslpath knows exactly what they map to
            // in Linux, so we convert it back here.
            const wslPath = execSync('wslpath "' + drive + ':\\' + prefix + '"').toString().trim();
            result.push(wslPath);
        }
    }

    return result;
}

exports.getFirefoxExeWsl = function (firefoxDirName) {
    const firefoxDirNames = Array.prototype.slice.call(arguments);

    for (const prefix of getAllPrefixesWsl()) {
        for (const dir of firefoxDirNames) {
            const candidate = join(prefix, dir, 'firefox.exe');
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return join('/mnt/c/Program Files/', firefoxDirNames[0], 'firefox.exe');
}
