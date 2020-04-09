exports.getFirefoxWithFallbackOnOSX = function () {
    if (process.platform !== 'darwin') {
        return null
    }

    var firefoxDirNames = Array.prototype.slice.call(arguments)
    var prefix = '/Applications/'
    var suffix = '.app/Contents/MacOS/firefox-bin'

    var bin
    var homeBin
    for (var i = 0; i < firefoxDirNames.length; i++) {
        bin = prefix + firefoxDirNames[i] + suffix

        if ('HOME' in process.env) {
            homeBin = path.join(process.env.HOME, bin)

            if (fs.existsSync(homeBin)) {
                return homeBin
            }
        }

        if (fs.existsSync(bin)) {
            return bin
        }
    }
}

// Return location of firefox.exe file for a given Firefox directory
// (available: "Mozilla Firefox", "Aurora", "Nightly").
exports.getFirefoxExe = function (firefoxDirName) {
    if (process.platform !== 'win32' && process.platform !== 'win64') {
        return null
    }

    var firefoxDirNames = Array.prototype.slice.call(arguments)

    for (var prefix of getAllPrefixes()) {
        for (var dir of firefoxDirNames) {
            var candidate = path.join(prefix, dir, 'firefox.exe')
            if (fs.existsSync(candidate)) {
                return candidate
            }
        }
    }

    return path.join('C:\\Program Files', firefoxDirNames[0], 'firefox.exe')
}
