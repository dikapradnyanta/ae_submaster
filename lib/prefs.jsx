/**
 * AESubMaster — prefs.jsx
 * 
 * Simpan dan baca preferensi plugin ke/dari file JSON di Folder.userData.
 * Path: <userData>/AESubMaster/prefs.json
 * 
 * Kompatibel dengan ExtendScript (ES3) — termasuk polyfill JSON minimal
 * untuk versi AE lama yang tidak punya JSON global.
 */

var Prefs = (function () {

    // ─── Konstanta ────────────────────────────────────────────────────────────

    var PREFS_FOLDER_NAME = "AESubMaster";
    var PREFS_FILE_NAME   = "prefs.json";

    // ─── JSON Polyfill (minimal, untuk flat object + string/number/boolean) ──
    // Digunakan hanya jika JSON global tidak tersedia (AE versi sangat lama).

    var _json = (function () {
        // Cek ketersediaan JSON bawaan
        if (typeof JSON !== "undefined" && typeof JSON.stringify === "function") {
            return JSON;
        }

        // Polyfill minimal: hanya mendukung flat object (satu level, tipe primitif)
        // Cukup untuk kebutuhan prefs AESubMaster.
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
                                valStr = "null"; // skip nested objects di polyfill
                            }
                            parts.push('"' + key + '": ' + valStr);
                        }
                    }
                    return "{" + parts.join(", ") + "}";
                }

                return "null";
            },

            parse: function (str) {
                // Gunakan eval yang di-sandboxed dengan Function constructor
                // untuk parse JSON sederhana. Lebih aman dari eval langsung.
                try {
                    return (new Function("return " + str))();
                } catch (e) {
                    return null;
                }
            }
        };
    })();

    // ─── Helper Internal ──────────────────────────────────────────────────────

    /**
     * Dapatkan path folder penyimpanan prefs.
     * Membuat folder jika belum ada.
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
     * Dapatkan objek File untuk prefs.json.
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

    // ─── Fungsi Utama ─────────────────────────────────────────────────────────

    /**
     * Simpan data preferensi ke file JSON.
     * 
     * Data yang bisa disimpan (flat object, nilai primitif):
     *   {
     *     lastFfxPath: String   // path .ffx template terakhir dipakai
     *   }
     * 
     * @param  {Object}  data   Object preferensi yang akan disimpan
     * @return {Object}  { success: Boolean, error: String }
     */
    function savePrefs(data) {
        if (!data || typeof data !== "object") {
            Logger.error("prefs", "savePrefs: invalid data object");
            return { success: false, error: "Data prefs tidak valid." };
        }

        var prefsFile = getPrefsFile();
        if (!prefsFile) {
            Logger.error("prefs", "savePrefs: cannot access prefs file");
            return { success: false, error: "Tidak bisa mengakses folder penyimpanan preferensi (" + Folder.userData.fsName + "/" + PREFS_FOLDER_NAME + ")." };
        }

        try {
            var jsonStr = _json.stringify(data);

            prefsFile.encoding = "UTF-8";
            if (!prefsFile.open("w")) {
                Logger.error("prefs", "savePrefs: failed opening file for write", { path: prefsFile.fsName });
                return { success: false, error: "Tidak bisa membuka file prefs untuk ditulis." };
            }

            prefsFile.write(jsonStr);
            prefsFile.close();

            Logger.debug("prefs", "Prefs saved successfully", data);
            return { success: true };
        } catch (e) {
            try { prefsFile.close(); } catch (ignore) {}
            Logger.error("prefs", "savePrefs exception", e);
            return { success: false, error: "Gagal menyimpan prefs: " + e.toString() };
        }
    }

    function loadPrefs() {
        var prefsFile = getPrefsFile();
        if (!prefsFile || !prefsFile.exists) { return {}; }

        try {
            prefsFile.encoding = "UTF-8";
            if (!prefsFile.open("r")) {
                Logger.warn("prefs", "loadPrefs: failed opening file for read");
                return {};
            }

            var content = prefsFile.read();
            prefsFile.close();

            if (!content || content.length === 0) { return {}; }

            // Hapus BOM jika ada
            if (content.charAt(0) === "\uFEFF") {
                content = content.substring(1);
            }

            var parsed = _json.parse(content);
            if (!parsed || typeof parsed !== "object") {
                Logger.warn("prefs", "loadPrefs: JSON parse result not an object");
                return {};
            }

            Logger.debug("prefs", "Prefs loaded", parsed);
            return parsed;
        } catch (e) {
            try { prefsFile.close(); } catch (ignore) {}
            Logger.error("prefs", "loadPrefs exception", e);
            return {};
        }
    }

    /**
     * Baca satu nilai dari prefs berdasarkan key.
     * 
     * @param  {String}  key            Nama preferensi
     * @param  {*}       defaultValue   Nilai default jika key tidak ada
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
     * Set satu nilai di prefs (merge dengan nilai yang sudah ada).
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
