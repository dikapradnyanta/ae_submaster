/**
 * AESubMaster — logger.jsx
 * 
 * Sistem logging diagnostik untuk AESubMaster.
 * 
 * Output ganda:
 *   1. File log di disk: <userData>/AESubMaster/debug.log
 *      → Persisten, bisa dibuka di text editor setelah AE ditutup.
 *   2. $.writeln ke konsol ESTK / ExtendScript Debugger
 *      → Real-time saat debugging aktif.
 * 
 * Level: DEBUG < INFO < WARN < ERROR
 *   - Set Logger.level = Logger.LEVELS.WARN untuk hanya lihat warning ke atas.
 *   - Set Logger.enabled = false untuk matikan semua output.
 * 
 * Cara pakai:
 *   Logger.debug("myModule", "Masuk fungsi foo", { arg: value });
 *   Logger.info("myModule", "Berhasil generate " + n + " layer");
 *   Logger.warn("myModule", "Timecode rusak di entry #5");
 *   Logger.error("myModule", "Gagal duplicate layer", e);
 * 
 * Kompatibel dengan ExtendScript (ES3).
 */

var Logger = (function () {

    // ─── Konstanta ────────────────────────────────────────────────────────────

    var LEVELS = {
        DEBUG: 0,
        INFO:  1,
        WARN:  2,
        ERROR: 3,
        NONE:  99  // matikan semua output file/console tanpa disable UI log
    };

    var LEVEL_NAMES = ["DEBUG", "INFO ", "WARN ", "ERROR"];

    var LOG_FOLDER_NAME = "AESubMaster";
    var LOG_FILE_NAME   = "debug.log";
    var MAX_LOG_SIZE_KB = 512;  // Rotasi jika file > 512KB

    // ─── State ────────────────────────────────────────────────────────────────

    var _enabled      = true;    // Master switch
    var _level        = LEVELS.DEBUG;
    var _logFile      = null;    // File object (lazy init)
    var _sessionStart = false;   // Apakah header sesi sudah ditulis
    var _writeToFile  = true;    // Tulis ke file disk
    var _writeToEstk  = true;    // Tulis ke $.writeln (ESTK console)

    // ─── Helper ───────────────────────────────────────────────────────────────

    /**
     * Dapatkan timestamp sekarang sebagai string.
     * Format: "YYYY-MM-DD HH:MM:SS.mmm"
     */
    function getTimestamp() {
        try {
            var d   = new Date();
            var pad = function (n, len) {
                var s = String(n);
                while (s.length < (len || 2)) { s = "0" + s; }
                return s;
            };
            return pad(d.getFullYear(), 4) + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
                   " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
                   "." + pad(d.getMilliseconds(), 3);
        } catch (e) {
            return "0000-00-00 00:00:00.000";
        }
    }

    /**
     * Inisialisasi file log (lazy — hanya dibuat saat pertama kali tulis).
     * Return File object atau null jika gagal.
     */
    function getLogFile() {
        if (_logFile) { return _logFile; }

        try {
            var baseFolder = Folder.userData;
            if (!baseFolder || !baseFolder.exists) { return null; }

            var logFolder = new Folder(baseFolder.fsName + "/" + LOG_FOLDER_NAME);
            if (!logFolder.exists) {
                if (!logFolder.create()) { return null; }
            }

            _logFile = new File(logFolder.fsName + "/" + LOG_FILE_NAME);

            // Rotasi: jika file terlalu besar, rename jadi debug.log.bak lalu buat baru
            if (_logFile.exists) {
                var sizeKB = Math.floor(_logFile.length / 1024);
                if (sizeKB > MAX_LOG_SIZE_KB) {
                    var bakFile = new File(logFolder.fsName + "/debug.log.bak");
                    if (bakFile.exists) { bakFile.remove(); }
                    _logFile.rename("debug.log.bak");
                    _logFile = new File(logFolder.fsName + "/" + LOG_FILE_NAME);
                }
            }

            return _logFile;
        } catch (e) {
            return null;
        }
    }

    /**
     * Tulis string ke file log.
     * @param {String} line
     */
    function writeToFile(line) {
        try {
            var f = getLogFile();
            if (!f) { return; }

            f.encoding = "UTF-8";
            if (!f.open("a")) { return; }  // append mode
            f.writeln(line);
            f.close();
        } catch (e) {
            // Gagal tulis ke file — tidak ada yang bisa dilakukan, abaikan
            try { _logFile.close(); } catch (ignore) {}
        }
    }

    /**
     * Tulis header sesi baru ke file log.
     */
    function writeSessionHeader() {
        if (_sessionStart) { return; }
        _sessionStart = true;

        var header = "\n" +
            "════════════════════════════════════════════════════\n" +
            "  AESubMaster — Sesi Baru: " + getTimestamp() + "\n" +
            "════════════════════════════════════════════════════";

        writeToFile(header);
    }

    /**
     * Serialize nilai untuk log — menangani object/array/null secara sederhana.
     * @param  {*}      val
     * @return {String}
     */
    function serialize(val) {
        if (val === null || val === undefined) { return String(val); }
        if (val instanceof Error) { return "Error: " + val.message + (val.fileName ? " (" + val.fileName + ":" + val.line + ")" : ""); }
        if (typeof val === "object") {
            // Coba buat representasi flat
            var parts = [];
            try {
                for (var key in val) {
                    if (val.hasOwnProperty(key)) {
                        var v = val[key];
                        if (typeof v !== "function" && typeof v !== "object") {
                            parts.push(key + "=" + v);
                        }
                    }
                }
                return "{" + parts.join(", ") + "}";
            } catch (e) {
                return "[Object]";
            }
        }
        return String(val);
    }

    // ─── Fungsi Logging Inti ──────────────────────────────────────────────────

    /**
     * Tulis satu baris log.
     * 
     * @param {Number} level     LEVELS.DEBUG/INFO/WARN/ERROR
     * @param {String} module    Nama modul/fungsi (misal "srtParser", "layerDuplicator")
     * @param {String} message   Pesan utama
     * @param {*}      [extra]   Data tambahan opsional (object, Error, string, dll)
     */
    function write(level, module, message, extra) {
        if (!_enabled) { return; }
        if (level < _level) { return; }

        var levelName = LEVEL_NAMES[level] || "?????";
        var ts        = getTimestamp();
        var modPad    = (module || "").substring(0, 20);

        var line = "[" + ts + "] [" + levelName + "] [" + modPad + "] " + message;
        if (extra !== undefined && extra !== null) {
            line = line + " | " + serialize(extra);
        }

        // Tulis ke file disk
        if (_writeToFile) {
            writeSessionHeader();
            writeToFile(line);
        }

        // Tulis ke ESTK console
        if (_writeToEstk) {
            try { $.writeln(line); } catch (ignore) {}
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Dapatkan path file log untuk ditampilkan di UI.
     * @return {String}
     */
    function getLogFilePath() {
        try {
            var f = getLogFile();
            return f ? f.fsName : "(tidak tersedia)";
        } catch (e) {
            return "(error)";
        }
    }

    /**
     * Hapus file log (untuk tombol "Clear Log" jika ada).
     * @return {Boolean} true jika berhasil
     */
    function clearLogFile() {
        try {
            var f = getLogFile();
            if (!f || !f.exists) { return true; }
            f.encoding = "UTF-8";
            if (!f.open("w")) { return false; }
            f.close();
            _sessionStart = false;
            return true;
        } catch (e) {
            return false;
        }
    }

    return {
        // Level constants
        LEVELS: LEVELS,

        // Konfigurasi (bisa diubah dari luar via fungsi)
        getEnabled:     function () { return _enabled; },
        setEnabled:     function (v) { _enabled = !!v; },
        getLevel:       function () { return _level; },
        setLevel:       function (v) { _level = v; },
        getWriteToFile: function () { return _writeToFile; },
        setWriteToFile: function (v) { _writeToFile = !!v; },
        getWriteToEstk: function () { return _writeToEstk; },
        setWriteToEstk: function (v) { _writeToEstk = !!v; },

        // Shortcut methods
        debug: function (module, msg, extra) { write(LEVELS.DEBUG, module, msg, extra); },
        info:  function (module, msg, extra) { write(LEVELS.INFO,  module, msg, extra); },
        warn:  function (module, msg, extra) { write(LEVELS.WARN,  module, msg, extra); },
        error: function (module, msg, extra) { write(LEVELS.ERROR, module, msg, extra); },

        // Utilitas
        getLogFilePath: getLogFilePath,
        clearLogFile:   clearLogFile
    };

})();
