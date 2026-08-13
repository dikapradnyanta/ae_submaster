/**
 * AESubMaster — prefs.jsx
 *
 * Reads and writes plugin preferences to a JSON file in Folder.userData.
 * Storage path: <userData>/AESubMaster/prefs.json
 *
 * Includes a minimal JSON polyfill for older AE versions that lack a global JSON object.
 * ExtendScript (ES3) compatible.
 */

var Prefs = (function () {

    // ─── Constants ────────────────────────────────────────────────────────────

    var PREFS_FOLDER_NAME = "AESubMaster";
    var PREFS_FILE_NAME   = "prefs.json";

    // ─── JSON Polyfill (minimal — flat objects with primitive values only) ────
    // Used only when the native JSON global is unavailable (very old AE versions).

    var _json = (function () {
        // Use native JSON if available
        if (typeof JSON !== "undefined" && typeof JSON.stringify === "function") {
            return JSON;
        }

        // Minimal polyfill: supports flat objects with string, number, and boolean values.
        // Sufficient for AESubMaster's preferences schema.
        return {
            stringify: function (obj) {
                if (obj === null || obj === undefined) { return "null"; }
                if (typeof obj === "string")  { return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
                if (typeof obj === "number")  { return isNaN(obj) ? "null" : String(obj); }
                if (typeof obj === "boolean") { return obj ? "true" : "false"; }

                if (typeof obj === "object") {
                    var parts = [];
                    for (var key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            var val = obj[key];
                            var valStr;
                            if (val === null || val === undefined) {
                                valStr = "null";
                            } else if (typeof val === "string") {
                                valStr = '"' + val.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
                            } else if (typeof val === "number") {
                                valStr = isNaN(val) ? "null" : String(val);
                            } else if (typeof val === "boolean") {
                                valStr = val ? "true" : "false";
                            } else {
                                valStr = "null"; // nested objects not supported in polyfill
                            }
                            parts.push('"' + key + '": ' + valStr);
                        }
                    }
                    return "{" + parts.join(", ") + "}";
                }

                return "null";
            },

            parse: function (str) {
                // Use Function constructor as a sandboxed eval for simple JSON strings
                try {
                    return (new Function("return " + str))();
                } catch (e) {
                    return null;
                }
            }
        };
    })();

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Resolve the preferences storage folder, creating it if it doesn't exist.
     *
     * @return {Folder | null}
     */
    function getPrefsFolder() {
        try {
            var baseFolder = Folder.userData;
            if (!baseFolder || !baseFolder.exists) { return null; }

            var prefsFolder = new Folder(baseFolder.fsName + "/" + PREFS_FOLDER_NAME);
            if (!prefsFolder.exists) {
                if (!prefsFolder.create()) { return null; }
            }
            return prefsFolder;
        } catch (e) {
            return null;
        }
    }

    /**
     * Resolve the preferences file object.
     *
     * @return {File | null}
     */
    function getPrefsFile() {
        var folder = getPrefsFolder();
        if (!folder) { return null; }

        try {
            return new File(folder.fsName + "/" + PREFS_FILE_NAME);
        } catch (e) {
            return null;
        }
    }

    // ─── Public Functions ─────────────────────────────────────────────────────

    /**
     * Save preferences data to disk as JSON.
     *
     * Supported schema (flat object, primitive values only):
     *   { lastFfxPath: String }
     *
     * @param  {Object}  data   Preferences object to persist
     * @return {Object}         { success: Boolean, error: String }
     */
    function savePrefs(data) {
        if (!data || typeof data !== "object") {
            Logger.error("prefs", "savePrefs: invalid data object");
            return { success: false, error: "Preferences data is not a valid object." };
        }

        var prefsFile = getPrefsFile();
        if (!prefsFile) {
            Logger.error("prefs", "savePrefs: cannot access prefs file");
            return { success: false, error: "Cannot access preferences folder (" + Folder.userData.fsName + "/" + PREFS_FOLDER_NAME + ")." };
        }

        try {
            var jsonStr = _json.stringify(data);

            prefsFile.encoding = "UTF-8";
            if (!prefsFile.open("w")) {
                Logger.error("prefs", "savePrefs: failed to open file for writing", { path: prefsFile.fsName });
                return { success: false, error: "Cannot open preferences file for writing." };
            }

            prefsFile.write(jsonStr);
            prefsFile.close();

            Logger.debug("prefs", "Preferences saved", data);
            return { success: true };
        } catch (e) {
            try { prefsFile.close(); } catch (ignore) {}
            Logger.error("prefs", "savePrefs exception", e);
            return { success: false, error: "Failed to save preferences: " + e.toString() };
        }
    }

    /**
     * Load preferences from disk.
     *
     * @return {Object}   Parsed preferences object, or {} if file doesn't exist or is unreadable.
     */
    function loadPrefs() {
        var prefsFile = getPrefsFile();
        if (!prefsFile || !prefsFile.exists) { return {}; }

        try {
            prefsFile.encoding = "UTF-8";
            if (!prefsFile.open("r")) {
                Logger.warn("prefs", "loadPrefs: failed to open file for reading");
                return {};
            }

            var content = prefsFile.read();
            prefsFile.close();

            if (!content || content.length === 0) { return {}; }

            // Strip BOM if present
            if (content.charAt(0) === "\uFEFF") {
                content = content.substring(1);
            }

            var parsed = _json.parse(content);
            if (!parsed || typeof parsed !== "object") {
                Logger.warn("prefs", "loadPrefs: JSON parse did not return an object");
                return {};
            }

            Logger.debug("prefs", "Preferences loaded", parsed);
            return parsed;
        } catch (e) {
            try { prefsFile.close(); } catch (ignore) {}
            Logger.error("prefs", "loadPrefs exception", e);
            return {};
        }
    }

    /**
     * Read a single preference value by key.
     *
     * @param  {String}  key            Preference key
     * @param  {*}       defaultValue   Returned if the key is missing
     * @return {*}
     */
    function getPref(key, defaultValue) {
        var prefs = loadPrefs();
        if (prefs.hasOwnProperty(key) && prefs[key] !== null && prefs[key] !== undefined) {
            return prefs[key];
        }
        return defaultValue !== undefined ? defaultValue : null;
    }

    /**
     * Set a single preference value (merges with existing data).
     *
     * @param  {String}  key
     * @param  {*}       value
     * @return {Object}  { success: Boolean, error: String }
     */
    function setPref(key, value) {
        var prefs = loadPrefs();
        prefs[key] = value;
        return savePrefs(prefs);
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        savePrefs: savePrefs,
        loadPrefs: loadPrefs,
        getPref:   getPref,
        setPref:   setPref
    };

})();
