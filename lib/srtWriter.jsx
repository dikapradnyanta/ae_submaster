/**
 * AESubMaster — srtWriter.jsx
 * 
 * Export / save array of subtitle entries back to a .srt file format.
 * Format per block:
 *   [Index]
 *   [HH:MM:SS,MIL] --> [HH:MM:SS,MIL]
 *   [Subtitle Text]
 * 
 * Membutuhkan TimeUtils (timeUtils.jsx) sudah di-#include sebelum file ini.
 * Kompatibel dengan ExtendScript (ES3).
 */

var SrtWriter = (function () {

    /**
     * Convert array of entries back to SRT text string.
     * @param  {Array} entries  Array of { index, startSeconds, endSeconds, text }
     * @return {String}         Formatted SRT content
     */
    function stringifySRT(entries) {
        var lines = [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var idx = i + 1; // Penomoran ulang bersih 1..N
            var startTime = TimeUtils.secondsToSrtTime(entry.startSeconds);
            var endTime   = TimeUtils.secondsToSrtTime(entry.endSeconds);
            
            lines.push(idx.toString());
            lines.push(startTime + " --> " + endTime);
            lines.push(entry.text);
            lines.push(""); // Spasi pemisah antar entry
        }
        return lines.join("\r\n");
    }

    /**
     * Write entries array to a .srt file on disk with UTF-8 encoding.
     * @param  {File|String} fileTarget   File object or string path
     * @param  {Array}       entries      Array of { index, startSeconds, endSeconds, text }
     * @return {Object}                   { success: Boolean, error: String }
     */
    function writeSRT(fileTarget, entries) {
        var result = { success: false, error: "" };
        try {
            var fileObj = (fileTarget instanceof File) ? fileTarget : new File(fileTarget);
            fileObj.encoding = "UTF-8";
            if (!fileObj.open("w")) {
                result.error = "Gagal membuka file untuk penulisan: " + fileObj.fsName;
                return result;
            }

            var content = stringifySRT(entries);
            fileObj.write(content);
            fileObj.close();
            result.success = true;
        } catch (e) {
            result.error = "Error saat menyimpan SRT: " + e.toString();
        }
        return result;
    }

    return {
        stringifySRT: stringifySRT,
        writeSRT:     writeSRT
    };

})();
