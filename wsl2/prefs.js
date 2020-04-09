exports.PREFS = [
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
