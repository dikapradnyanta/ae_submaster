/**
 * AESubMaster — timeUtils.jsx
 * 
 * Utility functions untuk konversi timecode SRT <-> detik (float).
 * Kompatibel dengan ExtendScript (ES3) — tidak ada let/const/arrow function.
 * 
 * Fungsi diekspor sebagai objek TimeUtils untuk diakses dari modul lain.
 */

var TimeUtils = (function () {

    /**
     * Parsing satu segmen timecode SRT ke detik (float).
     * 
     * Format input yang didukung:
     *   "HH:MM:SS,MIL"  → separator koma (standar SRT)
     *   "HH:MM:SS.MIL"  → separator titik (beberapa encoder memakai ini)
     * 
     * @param  {String} str   Contoh: "00:01:02,500" atau "00:01:02.500"
     * @return {Number}       Detik dalam float. Contoh: 62.5
     *                        Return -1 jika format tidak valid.
     */
    function srtTimeToSeconds(str) {
        if (typeof str !== "string") { return -1; }

        // Normalisasi: ganti titik sebagai separator milidetik → koma
        // sehingga regex hanya perlu satu pola
        var normalized = str.replace(".", ",");

        // Pattern: HH:MM:SS,MIL
        var pattern = /^(\d{1,2}):(\d{2}):(\d{2}),(\d{1,3})$/;
        var match = pattern.exec(normalized.replace(/\s/g, ""));

        if (!match) { return -1; }

        var hours   = parseInt(match[1], 10);
        var minutes = parseInt(match[2], 10);
        var seconds = parseInt(match[3], 10);

        // Normalkan milidetik ke 3 digit: "5" → "500", "50" → "500", "500" → "500"
        var milStr = match[4];
        while (milStr.length < 3) { milStr = milStr + "0"; }
        var milliseconds = parseInt(milStr, 10);

        // Validasi range
        if (minutes > 59 || seconds > 59 || milliseconds > 999) { return -1; }

        return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
    }

    /**
     * Konversi detik (float) ke format timecode SRT "HH:MM:SS,MIL".
     * 
     * @param  {Number} totalSeconds   Contoh: 62.5
     * @return {String}                Contoh: "00:01:02,500"
     *                                 Return "00:00:00,000" jika input negatif/NaN.
     */
    function secondsToSrtTime(totalSeconds) {
        if (typeof totalSeconds !== "number" || isNaN(totalSeconds) || totalSeconds < 0) {
            return "00:00:00,000";
        }

        var totalMs = Math.round(totalSeconds * 1000);
        var ms      = totalMs % 1000;
        var totalSec = Math.floor(totalMs / 1000);
        var sec     = totalSec % 60;
        var totalMin = Math.floor(totalSec / 60);
        var min     = totalMin % 60;
        var hrs     = Math.floor(totalMin / 60);

        // Padding ke format yang benar
        function pad2(n) { return (n < 10) ? "0" + n : "" + n; }
        function pad3(n) {
            if (n < 10)  { return "00" + n; }
            if (n < 100) { return "0" + n; }
            return "" + n;
        }

        return pad2(hrs) + ":" + pad2(min) + ":" + pad2(sec) + "," + pad3(ms);
    }

    // ─── Test Manual (aktif saat di-run langsung, nonaktif saat #include) ────
    // Hapus atau beri komentar bagian ini setelah verifikasi berhasil.
    function runTests() {
        var tests = [
            // [input, expected_output]
            ["00:01:02,500",  62.5],
            ["00:00:00,000",  0],
            ["01:00:00,000",  3600],
            ["00:00:00,001",  0.001],
            ["00:00:01,001",  1.001],
            ["99:59:59,999",  359999.999],
            ["00:00:00.500",  0.5],    // edge case: titik sebagai separator
            ["invalid",       -1],     // harus return -1
            ["00:60:00,000",  -1],     // menit > 59, tidak valid
            ["",              -1]      // string kosong
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

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        srtTimeToSeconds: srtTimeToSeconds,
        secondsToSrtTime: secondsToSrtTime,
        runTests:         runTests
    };

})();

// Uncomment baris di bawah untuk menjalankan test saat file di-run langsung:
// TimeUtils.runTests();
