/**
 * AESubMaster — srtParser.jsx
 * 
 * Parsing file .srt menjadi array of subtitle entries yang terstruktur.
 * Membutuhkan TimeUtils (timeUtils.jsx) sudah di-#include sebelum file ini.
 * 
 * Kompatibel dengan ExtendScript (ES3) — tidak ada let/const/arrow function.
 */

var SrtParser = (function () {

    // ─── Konstanta ────────────────────────────────────────────────────────────

    /** BOM UTF-8 yang kadang muncul di awal file */
    var BOM = "\uFEFF";

    /** Regex untuk baris timecode SRT: "HH:MM:SS,MIL --> HH:MM:SS,MIL" */
    var TIMECODE_REGEX = /^(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})/;

    /** Tag HTML yang perlu di-strip dari teks subtitle */
    var HTML_TAG_REGEX = /<[^>]+>/g;

    // ─── Helper Internal ──────────────────────────────────────────────────────

    /**
     * Strip tag HTML dasar dari string teks.
     * Menangani: <b>, </b>, <i>, </i>, <font color="...">, </font>, dll.
     * 
     * @param  {String} text
     * @return {String}
     */
    function stripHtmlTags(text) {
        return text.replace(HTML_TAG_REGEX, "");
    }

    /**
     * Trim whitespace dari kedua ujung string.
     * ExtendScript lama tidak selalu punya String.prototype.trim().
     * 
     * @param  {String} str
     * @return {String}
     */
    function trim(str) {
        return str.replace(/^\s+|\s+$/g, "");
    }

    /**
     * Cek apakah string merupakan baris nomor urut subtitle yang valid.
     * Harus berupa integer positif (boleh dengan whitespace di sekitarnya).
     * 
     * @param  {String} str
     * @return {Boolean}
     */
    function isIndexLine(str) {
        return /^\s*\d+\s*$/.test(str);
    }

    /**
     * Cek apakah string merupakan baris timecode SRT yang valid.
     * 
     * @param  {String} str
     * @return {Boolean}
     */
    function isTimecodeLine(str) {
        return TIMECODE_REGEX.test(str);
    }

    // ─── Fungsi Utama ─────────────────────────────────────────────────────────

    /**
     * Parse file SRT menjadi array entries terstruktur.
     * 
     * @param  {File} fileObj    Objek File dari After Effects (bukan path string)
     * @return {Object}          {
     *                             success:  Boolean,
     *                             entries:  Array of { index, startSeconds, endSeconds, text },
     *                             warnings: Array of String,
     *                             error:    String (hanya ada jika success: false)
     *                           }
     */
    function parseSRT(fileObj) {
        var result = {
            success:  false,
            entries:  [],
            warnings: [],
            error:    ""
        };

        // ── Validasi file ────────────────────────────────────────────────────
        if (!fileObj || !(fileObj instanceof File)) {
            result.error = "Input bukan objek File yang valid.";
            Logger.error("srtParser", "parseSRT gagal: input bukan File object");
            return result;
        }

        Logger.debug("srtParser", "parseSRT dimulai", { path: fileObj.fsName });

        if (!fileObj.exists) {
            result.error = "File tidak ditemukan: " + fileObj.fsName;
            Logger.error("srtParser", "File SRT tidak ditemukan", { path: fileObj.fsName });
            return result;
        }

        // ── Buka dan baca file ───────────────────────────────────────────────
        fileObj.encoding = "UTF-8";

        if (!fileObj.open("r")) {
            result.error = "Tidak bisa membuka file (mungkin sedang dipakai proses lain): " + fileObj.fsName;
            Logger.error("srtParser", "Gagal buka file SRT", { path: fileObj.fsName });
            return result;
        }

        var rawContent = fileObj.read();
        fileObj.close();

        if (!rawContent || rawContent.length === 0) {
            result.error = "File kosong: " + fileObj.fsName;
            Logger.error("srtParser", "File SRT kosong", { path: fileObj.fsName });
            return result;
        }

        Logger.debug("srtParser", "File terbaca", { bytes: rawContent.length });

        // Hapus BOM jika ada di awal
        if (rawContent.charAt(0) === BOM) {
            rawContent = rawContent.substring(1);
        }

        // ── Pisahkan ke baris-baris ──────────────────────────────────────────
        // Normalkan line ending: CRLF → LF, CR → LF
        rawContent = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        var lines = rawContent.split("\n");

        // ── State machine parser ─────────────────────────────────────────────
        // State: "IDLE" → "INDEX" → "TIMECODE" → "TEXT" → kembali ke "IDLE"
        var STATE_IDLE     = 0;
        var STATE_INDEX    = 1;
        var STATE_TIMECODE = 2;
        var STATE_TEXT     = 3;

        var state          = STATE_IDLE;
        var currentIndex   = 0;
        var currentStart   = 0;
        var currentEnd     = 0;
        var currentLines   = [];

        /**
         * Finalisasi entry saat ini dan simpan ke result.entries.
         */
        function flushEntry() {
            if (currentLines.length > 0) {
                // Gabungkan baris-baris teks dengan \r (sesuai TextDocument.text AE)
                var rawText = currentLines.join("\r");
                // Strip tag HTML
                var cleanText = stripHtmlTags(rawText);
                // Trim whitespace awal/akhir keseluruhan
                cleanText = trim(cleanText);

                if (cleanText.length > 0) {
                    result.entries.push({
                        index:        currentIndex,
                        startSeconds: currentStart,
                        endSeconds:   currentEnd,
                        text:         cleanText
                    });
                }
            }
            // Reset state
            currentLines = [];
            currentIndex = 0;
            currentStart = 0;
            currentEnd   = 0;
        }

        // ── Loop baris ───────────────────────────────────────────────────────
        for (var i = 0; i < lines.length; i++) {
            var line    = lines[i];
            var trimmed = trim(line);

            if (state === STATE_IDLE) {
                // Abaikan baris kosong antar entry
                if (trimmed === "") { continue; }

                // Baris nomor urut
                if (isIndexLine(trimmed)) {
                    currentIndex = parseInt(trimmed, 10);
                    state = STATE_INDEX;
                    continue;
                }

                // Kadang ada file SRT yang langsung mulai dengan timecode (tanpa nomor urut)
                if (isTimecodeLine(trimmed)) {
                    currentIndex = result.entries.length + 1;
                    var match = TIMECODE_REGEX.exec(trimmed);
                    var startSec = TimeUtils.srtTimeToSeconds(match[1]);
                    var endSec   = TimeUtils.srtTimeToSeconds(match[2]);

                    if (startSec < 0 || endSec < 0) {
                        result.warnings.push("Baris " + (i + 1) + ": format timecode rusak, dilewati.");
                        state = STATE_IDLE;
                        continue;
                    }

                    currentStart = startSec;
                    currentEnd   = endSec;
                    state = STATE_TEXT;
                    continue;
                }

                // Baris tidak dikenali di state IDLE — abaikan saja
                continue;
            }

            if (state === STATE_INDEX) {
                // Ekspektasi: baris timecode
                if (trimmed === "") { continue; } // toleransi baris kosong antara index & timecode

                if (isTimecodeLine(trimmed)) {
                    var match = TIMECODE_REGEX.exec(trimmed);
                    var startSec = TimeUtils.srtTimeToSeconds(match[1]);
                    var endSec   = TimeUtils.srtTimeToSeconds(match[2]);

                    if (startSec < 0 || endSec < 0) {
                        result.warnings.push("Entry #" + currentIndex + " (baris " + (i + 1) + "): format timecode rusak, dilewati.");
                        state = STATE_IDLE;
                        continue;
                    }

                    currentStart = startSec;
                    currentEnd   = endSec;
                    state = STATE_TEXT;
                    continue;
                }

                // Bukan timecode — entry mungkin rusak
                result.warnings.push("Entry #" + currentIndex + " (baris " + (i + 1) + "): timecode tidak ditemukan, dilewati.");
                state = STATE_IDLE;
                continue;
            }

            if (state === STATE_TEXT) {
                // Baris kosong = akhir entry saat ini
                if (trimmed === "") {
                    flushEntry();
                    state = STATE_IDLE;
                    continue;
                }

                // Baris ini adalah teks subtitle — tambahkan ke buffer
                currentLines.push(trimmed);
                continue;
            }
        }

        // Flush entry terakhir jika file tidak diakhiri baris kosong
        if (state === STATE_TEXT && currentLines.length > 0) {
            flushEntry();
        }

        // ── Validasi hasil ───────────────────────────────────────────────────
        if (result.entries.length === 0 && result.warnings.length === 0) {
            result.error = "Tidak ada entry subtitle yang valid ditemukan di file.";
            Logger.error("srtParser", "Tidak ada entry valid di file SRT", { path: fileObj.fsName });
            return result;
        }

        result.success = true;
        Logger.info("srtParser", "Parse selesai", {
            entries:  result.entries.length,
            warnings: result.warnings.length
        });
        if (result.warnings.length > 0) {
            for (var wi = 0; wi < result.warnings.length; wi++) {
                Logger.warn("srtParser", result.warnings[wi]);
            }
        }
        return result;
    }

    // ─── Test Manual ─────────────────────────────────────────────────────────
    /**
     * Jalankan test parser dengan konten SRT statis (tanpa file fisik).
     * Hanya untuk verifikasi di ESTK / Konsol AE.
     * 
     * Cara pakai: uncomment SrtParser.runTests() di bawah.
     */
    function runTests() {
        $.writeln("=== SrtParser Tests ===");

        // Simulasi file dengan membaca dari string (perlu file sementara)
        // Test ini memvalidasi fungsi-fungsi helper saja karena parseSRT butuh File object.

        $.writeln("  stripHtmlTags('<b>Hello</b> <i>World</i>'):");
        var stripped = stripHtmlTags("<b>Hello</b> <i>World</i>");
        $.writeln("    → \"" + stripped + "\"");
        $.writeln("    " + (stripped === "Hello World" ? "PASS" : "FAIL: expected 'Hello World'"));

        $.writeln("  stripHtmlTags('<font color=\"#ff0000\">Red text</font>'):");
        var stripped2 = stripHtmlTags('<font color="#ff0000">Red text</font>');
        $.writeln("    → \"" + stripped2 + "\"");
        $.writeln("    " + (stripped2 === "Red text" ? "PASS" : "FAIL: expected 'Red text'"));

        $.writeln("  isIndexLine('42'): " + (isIndexLine("42") ? "PASS (true)" : "FAIL"));
        $.writeln("  isIndexLine('abc'): " + (!isIndexLine("abc") ? "PASS (false)" : "FAIL"));
        $.writeln("  isTimecodeLine('00:01:02,500 --> 00:01:05,000'): " + (isTimecodeLine("00:01:02,500 --> 00:01:05,000") ? "PASS (true)" : "FAIL"));
        $.writeln("  isTimecodeLine('Hello world'): " + (!isTimecodeLine("Hello world") ? "PASS (false)" : "FAIL"));

        $.writeln("=== End SrtParser Tests ===");
        $.writeln("Untuk test parseSRT penuh, gunakan file SRT nyata lewat panel.");
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        parseSRT: parseSRT,
        runTests: runTests
    };

})();

// Uncomment untuk test helper internal:
// SrtParser.runTests();
