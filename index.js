/* eslint-disable space-before-function-paren */
'use strict'

var fs = require('fs')
var path = require('path')
var isWsl = require('is-wsl')
var which = require('which')
var { execSync, spawn } = require('child_process')
var { StringDecoder } = require('string_decoder')
const rimraf = require('rimraf')

var PREFS = [
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.bookmarks.restore_default_bookmarks", false);',
  'user_pref("dom.disable_open_during_load", false);',
  'user_pref("dom.max_script_run_time", 0);',
  'user_pref("dom.min_background_timeout_value", 10);',
  'user_pref("extensions.autoDisableScopes", 0);',
  'user_pref("browser.tabs.remote.autostart", false);',
  'user_pref("browser.tabs.remote.autostart.2", false);',
  'user_pref("extensions.enabledScopes", 15);'
].join('\n')

function escapePath(path) {
  return path
    .replace(/(\r\n|\r|\n)/gm, '')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/\s/g, '\\ ')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function getBin(commands) {
  // Don't run these checks on win32
  if (process.platform !== 'linux') {
    return null
  }
  var bin, i
  for (i = 0; i < commands.length; i++) {
    try {
      if (which.sync(commands[i])) {
        bin = commands[i]
        break
      }
    } catch (e) { }
  }
  return bin
}

// Get all possible Program Files folders even on other drives
// inspect the user's path to find other drives that may contain Program Files folders
var getAllPrefixes = function () {
  var drives = []
  var paden = process.env.Path.split(';')
  var re = /^[A-Z]:\\/i
  var pad
  for (var p = 0; p < paden.length; p++) {
    pad = paden[p]
    if (re.test(pad) && drives.indexOf(pad[0]) === -1) {
      drives.push(pad[0])
    }
  }

  var result = []
  var prefixes = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]
  var prefix
  for (var i = 0; i < prefixes.length; i++) {
    if (typeof prefixes[i] !== 'undefined') {
      for (var d = 0; d < drives.length; d += 1) {
        prefix = drives[d] + prefixes[i].substr(1)
        if (result.indexOf(prefix) === -1) {
          result.push(prefix)
        }
      }
    }
  }
  return result
}

// Return location of firefox.exe file for a given Firefox directory
// (available: "Mozilla Firefox", "Aurora", "Nightly").
var getFirefoxExe = function (firefoxDirName) {
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

var getAllPrefixesWsl = function () {
  var drives = []
  // Some folks configure their wsl.conf to mount Windows drives without the
  // /mnt prefix (e.g. see https://nickjanetakis.com/blog/setting-up-docker-for-windows-and-wsl-to-work-flawlessly)
  //
  // In fact, they could configure this to be any number of things. So we
  // take each path, convert it to a Windows path, check if it looks like
  // it starts with a drive and then record that.
  var re = /^([A-Z]):\\/i
  for (var pathElem of process.env.PATH.split(':')) {
    if (fs.existsSync(pathElem)) {
      var windowsPath = execSync('wslpath -w "' + pathElem + '"').toString()
      var matches = windowsPath.match(re)
      if (matches !== null && drives.indexOf(matches[1]) === -1) {
        drives.push(matches[1])
      }
    }
  }

  var result = []
  // We don't have the PROGRAMFILES or PROGRAMFILES(X86) environment variables
  // in WSL so we just hard code them.
  var prefixes = ['Program Files', 'Program Files (x86)']
  for (var prefix of prefixes) {
    for (var drive of drives) {
      // We only have the drive, and only wslpath knows exactly what they map to
      // in Linux, so we convert it back here.
      var wslPath =
        execSync('wslpath "' + drive + ':\\' + prefix + '"').toString().trim()
      result.push(wslPath)
    }
  }

  return result
}

var getFirefoxExeWsl = function (firefoxDirName) {
  if (!isWsl) {
    return null
  }

  var firefoxDirNames = Array.prototype.slice.call(arguments)

  for (var prefix of getAllPrefixesWsl()) {
    for (var dir of firefoxDirNames) {
      var candidate = path.join(prefix, dir, 'firefox.exe')
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return path.join('/mnt/c/Program Files/', firefoxDirNames[0], 'firefox.exe')
}

var getFirefoxWithFallbackOnOSX = function () {
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

var makeHeadlessVersion = function (Browser) {
  const headlessParams = ['-headless', '--start-debugger-server 6000']

  var HeadlessBrowser = function () {
    Browser.apply(this, arguments)

    if (isWsl) {
      arguments[2].headless = headlessParams
    } else {
      var execCommand = this._execCommand
      this._execCommand = function (command, args) {
        // --start-debugger-server ws:6000 can also be used, since remote debugging protocol also speaks WebSockets
        // https://hacks.mozilla.org/2017/12/using-headless-mode-in-firefox/
        execCommand.call(this, command, args.concat(headlessParams))
      }
    }
  }

  HeadlessBrowser.prototype = Object.create(Browser.prototype, {
    name: { value: Browser.prototype.name + 'Headless' }
  })
  HeadlessBrowser.$inject = Browser.$inject
  return HeadlessBrowser
}

// https://developer.mozilla.org/en-US/docs/Command_Line_Options
var FirefoxBrowser = function (id, baseBrowserDecorator, args) {
  baseBrowserDecorator(this)
  var profilePath = args.profile || this._tempDir
  let runningProcess
  let windowsUsed = false
  let browserProcessPid

  this._getPrefs = function (prefs) {
    if (typeof prefs !== 'object') {
      return PREFS
    }
    var result = PREFS
    for (var key in prefs) {
      result += 'user_pref("' + key + '", ' + JSON.stringify(prefs[key]) + ');\n'
    }
    return result
  }

  this._start = (url) => {
    var command = this._getCommand()
    var flags = args.flags || []
    var extensionsDir

    // If we are using the launcher process, make it print the child process ID
    // to stderr so we can capture it.
    //
    // https://wiki.mozilla.org/Platform/Integration/InjectEject/Launcher_Process/
    process.env.MOZ_DEBUG_BROWSER_PAUSE = 0
    browserProcessPid = undefined

    function setExtensions() {
      if (Array.isArray(args.extensions)) {
        extensionsDir = path.resolve(profilePath, 'extensions')
        fs.mkdirSync(extensionsDir)
        fs.writeFileSync(extensionsDir + '/' + 'user.js', this._getPrefs(args.prefs))
        args.extensions.forEach(function (ext) {
          var extBuffer = fs.readFileSync(ext)
          var copyDestination = path.resolve(extensionsDir, path.basename(ext))
          fs.writeFileSync(copyDestination, extBuffer)
        })
      }
    }

    const useWindowsWSL = () => {
      console.log('WSL: using Windows')
      command = this.DEFAULT_CMD.win32
      windowsUsed = true

      /*
      Translate temp path for profile to be able to write to the path on Linux
      while Firefox itself gets the windows path.
      */
      const getWindowsTempPath = execSync('cmd.exe /u /q /c ECHO %Temp%', { encoding: 'utf16le' })
        .replace(/(\r\n|\r|\n)/gm, '')
        .trim()
      const windowsProfilePath = `${getWindowsTempPath}\\karma-${this.id.toString()}`
      profilePath = execSync('wslpath -a ' + escapePath(windowsProfilePath)).toString().trim()

      // Create temp dir
      try {
        fs.mkdirSync(profilePath)
        fs.writeFileSync(profilePath + '/' + 'user.js', this._getPrefs(args.prefs))
      } catch (e) {
        console.warn(`Failed to create a temp dir at ${profilePath}`)
      }

      setExtensions()

      // Translate the command path to a windows path to make it possible to get the pid.
      const commandPreparePathArray = this.DEFAULT_CMD.win32.split('/')
      const executable = commandPreparePathArray.pop()
      const commandPreparePath = escapePath(commandPreparePathArray.join('/'))
      const commandTranslatePath = execSync('wslpath -w ' + commandPreparePath).toString().trim()
      const commandTranslated = commandTranslatePath + '\\' + executable

      /*
      Custom launch implementation that mimics firefox docs via WSL interop:
      Start firefox on windows and send process id back via stderr,
      to keep inline with the mozilla strategy.
      */
      this._execCommand = spawn('/bin/bash', ['-c',
        `
        processString=$(wmic.exe process call create "${commandTranslated}\
          ${url}\
          -profile ${windowsProfilePath}\
          -no-remote\
          -wait-for-browser\
          ${args.headless ? args.headless.join(' ') + '\\' : ''}
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
        `]
      )

      runningProcess = this._execCommand
    }

    const useNormal = () => {
      fs.writeFileSync(path.join(profilePath, 'prefs.js'), this._getPrefs(args.prefs))

      setExtensions()

      this._execCommand(
        command,
        [url, '-profile', profilePath, '-no-remote', '-wait-for-browser']
          .concat(flags, args.headless || [])
      )

      runningProcess = this._process
    }

    if (isWsl) {
      if (!this.DEFAULT_CMD.linux || !which.sync(this.DEFAULT_CMD.linux, { nothrow: true })) {
        // If Firefox is not installed on Linux side then always use windows.
        useWindowsWSL()
      } else {
        if (!args.headless && !process.env.DISPLAY) {
          // Firefox checks for the DISPLAY env variable to see if there is a gui.
          // If not in headless mode it will fail so use windows in that case.
          useWindowsWSL()
        } else {
          // Revert back to Linux command.
          command = this.DEFAULT_CMD.linux
          useNormal()
        }
      }
    } else {
      useNormal()
    }

    runningProcess.stderr.on('data', errBuff => {
      var errString
      if (typeof errBuff === 'string') {
        errString = errBuff
      } else {
        var decoder = new StringDecoder('utf8')
        errString = decoder.write(errBuff)
      }
      var matches = errString.match(/BROWSERBROWSERBROWSERBROWSER\s+debug me @ (\d+)/)
      if (matches) {
        browserProcessPid = parseInt(matches[1], 10)
      }
    })
  }

  this.on('kill', function (done) {
    // If we have a separate browser process PID, try killing it.
    if (browserProcessPid) {
      try {
        if (windowsUsed) {
          // Clean up
          execSync(`Taskkill.exe /PID ${browserProcessPid} /F /FI "STATUS eq RUNNING"`)
          rimraf.sync(profilePath)
          rimraf.sync(this._tempDir)
        } else {
          // Kill the normal process, Karma should pick up the cleanup
          process.kill(browserProcessPid)
        }
      } catch (e) {
        // Ignore failure -- the browser process might have already been
        // terminated.
      }
    }

    // If process is still running, kill it.
    try {
      runningProcess.kill()
    } catch (_) { }

    return process.nextTick(done)
  })
}

FirefoxBrowser.prototype = {
  name: 'Firefox',

  DEFAULT_CMD: {
    linux: getBin(['firefox']),
    freebsd: 'firefox',
    darwin: getFirefoxWithFallbackOnOSX('Firefox'),
    win32: isWsl ? getFirefoxExeWsl('Mozilla Firefox') : getFirefoxExe('Mozilla Firefox')
  },
  ENV_CMD: 'FIREFOX_BIN'
}

FirefoxBrowser.$inject = ['id', 'baseBrowserDecorator', 'args']

var FirefoxHeadlessBrowser = makeHeadlessVersion(FirefoxBrowser)

var FirefoxDeveloperBrowser = function () {
  FirefoxBrowser.apply(this, arguments)
}

FirefoxDeveloperBrowser.prototype = {
  name: 'FirefoxDeveloper',
  DEFAULT_CMD: {
    linux: getBin(['firefox']),
    darwin: getFirefoxWithFallbackOnOSX('FirefoxDeveloperEdition', 'FirefoxAurora'),
    win32: isWsl ? getFirefoxExeWsl('Firefox Developer Edition') : getFirefoxExe('Firefox Developer Edition')
  },
  ENV_CMD: 'FIREFOX_DEVELOPER_BIN'
}

FirefoxDeveloperBrowser.$inject = ['id', 'baseBrowserDecorator', 'args']

var FirefoxDeveloperHeadlessBrowser = makeHeadlessVersion(FirefoxDeveloperBrowser)

var FirefoxAuroraBrowser = function () {
  FirefoxBrowser.apply(this, arguments)
}

FirefoxAuroraBrowser.prototype = {
  name: 'FirefoxAurora',
  DEFAULT_CMD: {
    linux: getBin(['firefox']),
    darwin: getFirefoxWithFallbackOnOSX('FirefoxAurora'),
    win32: isWsl ? getFirefoxExeWsl('Aurora') : getFirefoxExe('Aurora')
  },
  ENV_CMD: 'FIREFOX_AURORA_BIN'
}

FirefoxAuroraBrowser.$inject = ['id', 'baseBrowserDecorator', 'args']

var FirefoxAuroraHeadlessBrowser = makeHeadlessVersion(FirefoxAuroraBrowser)

var FirefoxNightlyBrowser = function () {
  FirefoxBrowser.apply(this, arguments)
}

FirefoxNightlyBrowser.prototype = {
  name: 'FirefoxNightly',

  DEFAULT_CMD: {
    linux: getBin(['firefox']),
    darwin: getFirefoxWithFallbackOnOSX('FirefoxNightly', 'Firefox Nightly'),
    win32: isWsl ? getFirefoxExeWsl('Nightly', 'Firefox Nightly') : getFirefoxExe('Nightly', 'Firefox Nightly')
  },
  ENV_CMD: 'FIREFOX_NIGHTLY_BIN'
}

FirefoxNightlyBrowser.$inject = ['id', 'baseBrowserDecorator', 'args']

var FirefoxNightlyHeadlessBrowser = makeHeadlessVersion(FirefoxNightlyBrowser)

// PUBLISH DI MODULE
module.exports = {
  'launcher:Firefox': ['type', FirefoxBrowser],
  'launcher:FirefoxHeadless': ['type', FirefoxHeadlessBrowser],
  'launcher:FirefoxDeveloper': ['type', FirefoxDeveloperBrowser],
  'launcher:FirefoxDeveloperHeadless': ['type', FirefoxDeveloperHeadlessBrowser],
  'launcher:FirefoxAurora': ['type', FirefoxAuroraBrowser],
  'launcher:FirefoxAuroraHeadless': ['type', FirefoxAuroraHeadlessBrowser],
  'launcher:FirefoxNightly': ['type', FirefoxNightlyBrowser],
  'launcher:FirefoxNightlyHeadless': ['type', FirefoxNightlyHeadlessBrowser]
}
