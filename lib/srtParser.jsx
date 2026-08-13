/**
 * AESubMaster — srtParser.jsx
 *
 * Parses a .srt file into a structured array of subtitle entries.
 * Requires TimeUtils (timeUtils.jsx) to be #included before this file.
 *
 * ExtendScript (ES3) compatible — no let/const/arrow functions.
 */

var SrtParser = (function () {

    // ─── Constants ────────────────────────────────────────────────────────────

    /** UTF-8 BOM character that may appear at the start of some SRT files */
    var BOM = "\uFEFF";

    /** Regex to match an SRT timecode line: "HH:MM:SS,MIL --> HH:MM:SS,MIL" */
    var TIMECODE_REGEX = /^(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})/;

    /** Regex to strip HTML tags from subtitle text (e.g. <b>, <i>, <font ...>) */
    var HTML_TAG_REGEX = /<[^>]+>/g;

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Strip basic HTML tags from a string.
     * Handles: <b>, </b>, <i>, </i>, <font color="...">, </font>, etc.
     *
     * @param  {String} text
     * @return {String}
     */
    function stripHtmlTags(text) {
        return text.replace(HTML_TAG_REGEX, "");
    }

    /**
     * Trim leading and trailing whitespace.
     * Polyfill for older ExtendScript runtimes that may lack String.prototype.trim().
     *
     * @param  {String} str
     * @return {String}
     */
    function trim(str) {
        return str.replace(/^\s+|\s+$/g, "");
    }

    /**
     * Check whether a string is a valid SRT sequence number line.
     * Must be a positive integer, optionally surrounded by whitespace.
     *
     * @param  {String} str
     * @return {Boolean}
     */
    function isIndexLine(str) {
        return /^\s*\d+\s*$/.test(str);
    }

    /**
     * Check whether a string is a valid SRT timecode line.
     *
     * @param  {String} str
     * @return {Boolean}
     */
    function isTimecodeLine(str) {
        return TIMECODE_REGEX.test(str);
    }

    // ─── Main Function ────────────────────────────────────────────────────────

    /**
     * Parse an SRT file into a structured array of subtitle entries.
     *
     * @param  {File} fileObj    AE File object (not a path string)
     * @return {Object}          {
     *                             success:  Boolean,
     *                             entries:  Array of { index, startSeconds, endSeconds, text },
     *                             warnings: Array of String,
     *                             error:    String  (only present when success: false)
     *                           }
     */
    function parseSRT(fileObj) {
        var result = {
            success:  false,
            entries:  [],
            warnings: [],
            error:    ""
        };

        // ── Input validation ─────────────────────────────────────────────────
        if (!fileObj || !(fileObj instanceof File)) {
            result.error = "Input is not a valid File object.";
            Logger.error("srtParser", "parseSRT failed: input is not a File object");
            return result;
        }

        Logger.debug("srtParser", "parseSRT started", { path: fileObj.fsName });

        if (!fileObj.exists) {
            result.error = "File not found: " + fileObj.fsName;
            Logger.error("srtParser", "SRT file not found", { path: fileObj.fsName });
            return result;
        }

        // ── Open and read file (multi-encoding fallback) ──────────────────────
        fileObj.encoding = "UTF-8";
        if (!fileObj.open("r")) {
            result.error = "Cannot open file (may be locked by another process): " + fileObj.fsName;
            Logger.error("srtParser", "Failed to open SRT file", { path: fileObj.fsName });
            return result;
        }

        var rawContent = fileObj.read();
        fileObj.close();

        // Fallback for UTF-16 encoded files (common from Premiere / Windows Notepad)
        if (!rawContent || rawContent.length === 0 || rawContent.indexOf("\u0000") !== -1) {
            fileObj.encoding = "UTF-16";
            if (fileObj.open("r")) {
                rawContent = fileObj.read();
                fileObj.close();
            }
        }

        // Fallback for BINARY / ANSI encoded files
        if (!rawContent || rawContent.length === 0 || rawContent.indexOf("\u0000") !== -1) {
            fileObj.encoding = "BINARY";
            if (fileObj.open("r")) {
                rawContent = fileObj.read();
                fileObj.close();
            }
        }

        // Strip any remaining null bytes from the content
        if (rawContent) {
            rawContent = rawContent.replace(/\u0000/g, "");
        }

        if (!rawContent || rawContent.length === 0) {
            result.error = "File is empty: " + fileObj.fsName;
            Logger.error("srtParser", "SRT file is empty", { path: fileObj.fsName });
            return result;
        }

        Logger.debug("srtParser", "File read successfully", { bytes: rawContent.length });

        // Strip BOM if present
        if (rawContent.charAt(0) === BOM) {
            rawContent = rawContent.substring(1);
        }

        // ── Split content into lines ─────────────────────────────────────────
        rawContent = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        var lines = rawContent.split("\n");

        var STATE_IDLE     = 0;
        var STATE_INDEX    = 1;
        var STATE_TIMECODE = 2;
        var STATE_TEXT     = 3;

        var state        = STATE_IDLE;
        var currentIndex = 0;
        var currentStart = 0;
        var currentEnd   = 0;
        var currentLines = [];

        // Finalize and push the current subtitle block into result.entries
        function flushEntry() {
            if (currentLines.length > 0) {
                var rawText   = currentLines.join("\r");
                var cleanText = trim(stripHtmlTags(rawText));

                if (cleanText.length > 0) {
                    result.entries.push({
                        index:        currentIndex,
                        startSeconds: currentStart,
                        endSeconds:   currentEnd,
                        text:         cleanText
                    });
                }
            }
            currentLines = [];
            currentIndex = 0;
            currentStart = 0;
            currentEnd   = 0;
        }

        for (var i = 0; i < lines.length; i++) {
            var line    = lines[i];
            var trimmed = trim(line);

            if (state === STATE_IDLE) {
                if (trimmed === "") { continue; }

                if (isIndexLine(trimmed)) {
                    currentIndex = parseInt(trimmed, 10);
                    state = STATE_INDEX;
                    continue;
                }

                // Handle files without sequence numbers — go straight to timecode
                if (isTimecodeLine(trimmed)) {
                    currentIndex = result.entries.length + 1;
                    var match    = TIMECODE_REGEX.exec(trimmed);
                    var startSec = TimeUtils.srtTimeToSeconds(match[1]);
                    var endSec   = TimeUtils.srtTimeToSeconds(match[2]);

                    if (startSec < 0 || endSec < 0) {
                        result.warnings.push("Line " + (i + 1) + ": corrupted timecode format, skipped.");
                        state = STATE_IDLE;
                        continue;
                    }

                    currentStart = startSec;
                    currentEnd   = endSec;
                    state = STATE_TEXT;
                    continue;
                }

                continue;
            }

            if (state === STATE_INDEX) {
                if (trimmed === "") { continue; }

                if (isTimecodeLine(trimmed)) {
                    var match    = TIMECODE_REGEX.exec(trimmed);
                    var startSec = TimeUtils.srtTimeToSeconds(match[1]);
                    var endSec   = TimeUtils.srtTimeToSeconds(match[2]);

                    if (startSec < 0 || endSec < 0) {
                        result.warnings.push("Entry #" + currentIndex + " (line " + (i + 1) + "): corrupted timecode format, skipped.");
                        state = STATE_IDLE;
                        continue;
                    }

                    currentStart = startSec;
                    currentEnd   = endSec;
                    state = STATE_TEXT;
                    continue;
                }

                result.warnings.push("Entry #" + currentIndex + " (line " + (i + 1) + "): timecode missing, skipped.");
                state = STATE_IDLE;
                continue;
            }

            if (state === STATE_TEXT) {
                if (trimmed === "") {
                    // Blank line signals end of current block
                    flushEntry();
                    state = STATE_IDLE;
                    continue;
                }

                currentLines.push(trimmed);
                continue;
            }
        }

        // Flush the last entry if the file doesn't end with a blank line
        if (state === STATE_TEXT && currentLines.length > 0) {
            flushEntry();
        }

        // ── Final validation ─────────────────────────────────────────────────
        if (result.entries.length === 0 && result.warnings.length === 0) {
            result.error = "No valid subtitle entries found in the file.";
            Logger.error("srtParser", "No valid entries in SRT file", { path: fileObj.fsName });
            return result;
        }

        result.success = true;
        Logger.info("srtParser", "Parse completed", {
            entries:  result.entries.length,
            warnings: result.warnings.length
        });
        for (var wi = 0; wi < result.warnings.length; wi++) {
            Logger.warn("srtParser", result.warnings[wi]);
        }
        return result;
    }

    // ─── Self-test ────────────────────────────────────────────────────────────
    /**
     * Run helper function tests in ESTK / AE console.
     * Full parseSRT testing requires a physical SRT file via the panel.
     *
     * Usage: uncomment SrtParser.runTests() below.
     */
    function runTests() {
        $.writeln("=== SrtParser Tests ===");

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
        $.writeln("For full parseSRT testing, use a real SRT file via the panel.");
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        parseSRT: parseSRT,
        runTests: runTests
    };

})();

// Uncomment to run helper self-tests:
// SrtParser.runTests();
