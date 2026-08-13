/**
 * AESubMaster — srtWriter.jsx
 *
 * Serializes an array of subtitle entries back to .srt file format.
 *
 * Block format:
 *   [Index]
 *   [HH:MM:SS,MIL] --> [HH:MM:SS,MIL]
 *   [Subtitle Text]
 *   [blank line]
 *
 * Requires TimeUtils (timeUtils.jsx) to be #included before this file.
 * ExtendScript (ES3) compatible.
 */

var SrtWriter = (function () {

    /**
     * Serialize an entries array to an SRT-formatted string.
     *
     * Entries are re-indexed cleanly from 1..N regardless of original indices.
     *
     * @param  {Array} entries   Array of { index, startSeconds, endSeconds, text }
     * @return {String}          Formatted SRT content
     */
    function stringifySRT(entries) {
        var lines = [];
        for (var i = 0; i < entries.length; i++) {
            var entry     = entries[i];
            var idx       = i + 1; // Renumber cleanly from 1
            var startTime = TimeUtils.secondsToSrtTime(entry.startSeconds);
            var endTime   = TimeUtils.secondsToSrtTime(entry.endSeconds);

            lines.push(idx.toString());
            lines.push(startTime + " --> " + endTime);
            lines.push(entry.text);
            lines.push(""); // Blank separator between blocks
        }
        return lines.join("\r\n");
    }

    /**
     * Write an entries array to a .srt file on disk with UTF-8 encoding.
     *
     * Includes a safety guard that refuses to write if the entries list is empty
     * or all entries have blank text / invalid timing — preventing accidental
     * data loss on an existing SRT file.
     *
     * @param  {File|String} fileTarget   File object or string path
     * @param  {Array}       entries      Array of { index, startSeconds, endSeconds, text }
     * @return {Object}                   { success: Boolean, error: String }
     */
    function writeSRT(fileTarget, entries) {
        var result = { success: false, error: "" };
        try {
            // Safety guard: refuse to overwrite with empty data
            if (!entries || entries.length === 0) {
                result.error = "No entries to write — subtitle list is empty.";
                return result;
            }

            // Count entries that have non-blank text and valid timing
            var validCount = 0;
            for (var vi = 0; vi < entries.length; vi++) {
                var e = entries[vi];
                if (e.text && e.text.replace(/\s/g, "").length > 0 &&
                    typeof e.startSeconds === "number" && typeof e.endSeconds === "number" &&
                    e.endSeconds > e.startSeconds) {
                    validCount++;
                }
            }
            if (validCount === 0) {
                result.error = "All entries have empty text or invalid timing. Write aborted.";
                return result;
            }

            var fileObj = (fileTarget instanceof File) ? fileTarget : new File(fileTarget);
            fileObj.encoding = "UTF-8";
            if (!fileObj.open("w")) {
                result.error = "Failed to open file for writing: " + fileObj.fsName;
                return result;
            }

            fileObj.write(stringifySRT(entries));
            fileObj.close();
            result.success = true;
        } catch (e) {
            result.error = "Error saving SRT: " + e.toString();
        }
        return result;
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        stringifySRT: stringifySRT,
        writeSRT:     writeSRT
    };

})();
