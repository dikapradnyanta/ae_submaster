/**
 * AESubMaster — timeUtils.jsx
 *
 * Timecode conversion utilities: SRT format <-> seconds (float) <-> AE frame-based time.
 * ExtendScript (ES3) compatible — no let/const/arrow functions.
 *
 * Exported as the TimeUtils singleton object for use by other modules.
 */

var TimeUtils = (function () {

    /**
     * Parse a single SRT timecode string into seconds (float).
     *
     * Supported formats:
     *   "HH:MM:SS,MIL"  — comma separator (SRT standard)
     *   "HH:MM:SS.MIL"  — dot separator (used by some encoders)
     *
     * @param  {String} str   e.g. "00:01:02,500" or "00:01:02.500"
     * @return {Number}       Seconds as float, e.g. 62.5. Returns -1 on invalid input.
     */
    function srtTimeToSeconds(str) {
        if (typeof str !== "string") { return -1; }

        // Normalize dot separator to comma so only one regex pattern is needed
        var normalized = str.replace(".", ",");

        // Pattern: HH:MM:SS,MIL
        var pattern = /^(\d{1,2}):(\d{2}):(\d{2}),(\d{1,3})$/;
        var match = pattern.exec(normalized.replace(/\s/g, ""));

        if (!match) { return -1; }

        var hours   = parseInt(match[1], 10);
        var minutes = parseInt(match[2], 10);
        var seconds = parseInt(match[3], 10);

        // Pad milliseconds to 3 digits: "5" → "500", "50" → "500", "500" → "500"
        var milStr = match[4];
        while (milStr.length < 3) { milStr = milStr + "0"; }
        var milliseconds = parseInt(milStr, 10);

        // Range validation
        if (minutes > 59 || seconds > 59 || milliseconds > 999) { return -1; }

        return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
    }

    /**
     * Convert seconds (float) to SRT timecode format "HH:MM:SS,MIL".
     *
     * @param  {Number} totalSeconds   e.g. 62.5
     * @return {String}                e.g. "00:01:02,500". Returns "00:00:00,000" for invalid input.
     */
    function secondsToSrtTime(totalSeconds) {
        if (typeof totalSeconds !== "number" || isNaN(totalSeconds) || totalSeconds < 0) {
            return "00:00:00,000";
        }

        var totalMs  = Math.round(totalSeconds * 1000);
        var ms       = totalMs % 1000;
        var totalSec = Math.floor(totalMs / 1000);
        var sec      = totalSec % 60;
        var totalMin = Math.floor(totalSec / 60);
        var min      = totalMin % 60;
        var hrs      = Math.floor(totalMin / 60);

        function pad2(n) { return (n < 10) ? "0" + n : "" + n; }
        function pad3(n) {
            if (n < 10)  { return "00" + n; }
            if (n < 100) { return "0" + n; }
            return "" + n;
        }

        return pad2(hrs) + ":" + pad2(min) + ":" + pad2(sec) + "," + pad3(ms);
    }

    // ─── Self-test (run manually in ESTK, disabled during normal #include) ────
    // Uncomment TimeUtils.runTests() at the bottom to execute.
    function runTests() {
        var tests = [
            // [input, expected_seconds]
            ["00:01:02,500",  62.5],
            ["00:00:00,000",  0],
            ["01:00:00,000",  3600],
            ["00:00:00,001",  0.001],
            ["00:00:01,001",  1.001],
            ["99:59:59,999",  359999.999],
            ["00:00:00.500",  0.5],    // edge case: dot separator
            ["invalid",       -1],     // should return -1
            ["00:60:00,000",  -1],     // minutes > 59 — invalid
            ["",              -1]      // empty string
        ];

        var passed = 0;
        var failed = 0;

        $.writeln("=== TimeUtils.srtTimeToSeconds Tests ===");
        for (var i = 0; i < tests.length; i++) {
            var input    = tests[i][0];
            var expected = tests[i][1];
            var result   = srtTimeToSeconds(input);
            var ok = (Math.abs(result - expected) < 0.0001);
            if (ok) {
                $.writeln("  PASS: \"" + input + "\" → " + result);
                passed++;
            } else {
                $.writeln("  FAIL: \"" + input + "\" → got " + result + ", expected " + expected);
                failed++;
            }
        }

        var rtTests = [
            [62.5,       "00:01:02,500"],
            [0,          "00:00:00,000"],
            [3600,       "01:00:00,000"],
            [0.001,      "00:00:00,001"],
            [359999.999, "99:59:59,999"]
        ];

        $.writeln("=== TimeUtils.secondsToSrtTime Tests ===");
        for (var j = 0; j < rtTests.length; j++) {
            var sec      = rtTests[j][0];
            var expected = rtTests[j][1];
            var result   = secondsToSrtTime(sec);
            var ok = (result === expected);
            if (ok) {
                $.writeln("  PASS: " + sec + " → \"" + result + "\"");
                passed++;
            } else {
                $.writeln("  FAIL: " + sec + " → got \"" + result + "\", expected \"" + expected + "\"");
                failed++;
            }
        }

        $.writeln("=== Results: " + passed + " passed, " + failed + " failed ===");
    }

    /**
     * Convert seconds (float) to AE frame-based timecode "HH:MM:SS:FF".
     *
     * @param  {Number} totalSeconds   e.g. 62.5
     * @param  {Number} fps            Composition frame rate, e.g. 24, 25, 29.97, 30
     * @return {String}                e.g. "00:01:02:12" (at 24 fps). Returns "00:00:00:00" on invalid input.
     */
    function secondsToAETime(totalSeconds, fps) {
        if (typeof totalSeconds !== "number" || isNaN(totalSeconds) || totalSeconds < 0) {
            return "00:00:00:00";
        }
        if (typeof fps !== "number" || isNaN(fps) || fps <= 0) { fps = 25; }

        var totalFrames = Math.round(totalSeconds * fps);
        var frame    = totalFrames % Math.round(fps);
        var totalSec = Math.floor(totalFrames / Math.round(fps));
        var sec      = totalSec % 60;
        var totalMin = Math.floor(totalSec / 60);
        var min      = totalMin % 60;
        var hrs      = Math.floor(totalMin / 60);

        function pad2(n) { return (n < 10) ? "0" + n : "" + n; }

        return pad2(hrs) + ":" + pad2(min) + ":" + pad2(sec) + ":" + pad2(frame);
    }

    /**
     * Convert AE frame-based timecode "HH:MM:SS:FF" to seconds (float).
     *
     * @param  {String} str   e.g. "00:01:02:12"
     * @param  {Number} fps   Composition frame rate
     * @return {Number}       Seconds as float. Returns -1 on invalid input.
     */
    function aeTimeToSeconds(str, fps) {
        if (typeof str !== "string") { return -1; }
        if (typeof fps !== "number" || isNaN(fps) || fps <= 0) { fps = 25; }

        var pattern = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{1,2})$/;
        var match = pattern.exec(str.replace(/\s/g, ""));
        if (!match) { return -1; }

        var hours   = parseInt(match[1], 10);
        var minutes = parseInt(match[2], 10);
        var seconds = parseInt(match[3], 10);
        var frame   = parseInt(match[4], 10);

        var fpsRound = Math.round(fps);
        if (minutes > 59 || seconds > 59 || frame >= fpsRound) { return -1; }

        return (hours * 3600) + (minutes * 60) + seconds + (frame / fps);
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        srtTimeToSeconds:  srtTimeToSeconds,
        secondsToSrtTime:  secondsToSrtTime,
        secondsToAETime:   secondsToAETime,
        aeTimeToSeconds:   aeTimeToSeconds,
        runTests:          runTests
    };

})();

// Uncomment to run self-tests when this file is executed directly:
// TimeUtils.runTests();
