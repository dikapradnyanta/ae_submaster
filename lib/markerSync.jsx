/**
 * AESubMaster — markerSync.jsx
 *
 * Detects and repositions the Out animation marker on a duplicated layer
 * so it stays proportionally offset from the new outPoint.
 *
 * ExtendScript (ES3) compatible.
 */

var MarkerSync = (function () {

    // ─── Constants ────────────────────────────────────────────────────────────

    /**
     * Known marker names that signal the start of an Out animation.
     * Matched against MarkerValue.comment on each layer marker (case-sensitive).
     *
     * DEVELOPER NOTE: Add new names here to support additional preset libraries.
     * Verify the exact casing used by your preset (open the layer in AE to inspect).
     *
     * Known mappings:
     *   "trOut"   → Motion Bro / Mr. Horse (most common)
     *   "outAnim" → some manual presets
     *   "OUT"     → custom uppercase
     *   "out"     → custom lowercase
     *   "animOut" → alternative naming
     */
    var KNOWN_OUT_MARKERS = ["trOut", "outAnim", "OUT", "out", "animOut"];

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Check if a value exists in an array (ES3 — no Array.indexOf).
     *
     * @param  {Array}  arr
     * @param  {String} val
     * @return {Boolean}
     */
    function arrayContains(arr, val) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] === val) { return true; }
        }
        return false;
    }

    /**
     * Retrieve all markers from a layer as { time, value } pairs.
     *
     * @param  {Layer} layer
     * @return {Array} Array of { time: Number, value: MarkerValue }.
     *                 Returns [] if the layer has no markers or an error occurs.
     */
    function getAllMarkers(layer) {
        var markers = [];
        try {
            var markerProp = layer.property("Marker");
            if (!markerProp) { return markers; }

            var count = markerProp.numKeys;
            for (var i = 1; i <= count; i++) {
                try {
                    markers.push({
                        time:  markerProp.keyTime(i),
                        value: markerProp.keyValue(i)
                    });
                } catch (e) {
                    // Skip unreadable markers silently
                }
            }
        } catch (e) {
            // Layer has no Marker property — normal, return []
        }
        return markers;
    }

    // ─── Main Function ────────────────────────────────────────────────────────

    /**
     * Synchronize the Out animation marker on a duplicated layer to the new outPoint.
     *
     * Logic:
     *   1. Find the first marker whose comment matches a name in knownMarkerNames.
     *   2. Calculate its fixed offset from the template's outPoint.
     *   3. Apply the same offset from the new outPoint.
     *
     * If the new subtitle duration is shorter than the Out animation's duration:
     *   → returns { synced: false, conflict: true } with no changes made.
     *
     * @param  {Layer}   dupLayer          Duplicated layer to modify
     * @param  {Number}  templateStartTime Template's startTime (seconds)
     * @param  {Number}  templateOutPoint  Template's outPoint (seconds)
     * @param  {Number}  newStartTime      New layer's startTime (= entry.startSeconds)
     * @param  {Number}  newOutPoint       New layer's outPoint (= entry.endSeconds)
     * @param  {Array}   knownMarkerNames  Marker name list — use KNOWN_OUT_MARKERS
     * @return {Object}  {
     *                     synced:     Boolean,  // true if marker was found and repositioned
     *                     conflict:   Boolean,  // true if subtitle duration < Out animation duration
     *                     markerName: String,   // name of the matched marker
     *                     error:      String    // error message if the move failed
     *                   }
     */
    function syncOutMarker(dupLayer, templateStartTime, templateOutPoint, newStartTime, newOutPoint, knownMarkerNames) {
        var result = {
            synced:     false,
            conflict:   false,
            markerName: "",
            error:      ""
        };

        var names = knownMarkerNames || KNOWN_OUT_MARKERS;

        // ── Collect all markers on the layer ─────────────────────────────────
        var allMarkers = getAllMarkers(dupLayer);
        if (allMarkers.length === 0) {
            // No markers at all — nothing to sync
            return result;
        }

        // ── Find the first recognized Out marker ─────────────────────────────
        var outMarker     = null;
        var outMarkerTime = -1;

        for (var i = 0; i < allMarkers.length; i++) {
            var markerComment = "";
            try {
                markerComment = allMarkers[i].value.comment || "";
            } catch (e) {
                continue;
            }

            if (arrayContains(names, markerComment)) {
                outMarker         = allMarkers[i];
                outMarkerTime     = allMarkers[i].time;
                result.markerName = markerComment;
                break;
            }
        }

        if (outMarker === null) {
            // No recognized Out marker — not an error, just nothing to sync
            Logger.debug("markerSync", "No recognized Out marker found", { markersFound: allMarkers.length });
            return result;
        }

        // ── Calculate durations ───────────────────────────────────────────────
        var outDuration = templateOutPoint - outMarkerTime;  // length of Out animation
        var newDuration = newOutPoint - newStartTime;        // total length of new subtitle

        // ── Conflict check: subtitle too short for Out animation ──────────────
        if (newDuration < outDuration - 0.001) {
            result.conflict = true;
            Logger.warn("markerSync", "Duration conflict for marker '" + result.markerName + "'", {
                newDuration:             newDuration,
                requiredOutAnimDuration: outDuration
            });
            // Do NOT modify the marker — return as-is
            return result;
        }

        // ── Calculate new marker position ─────────────────────────────────────
        // Place the marker exactly 'outDuration' seconds before the new outPoint
        // so the Out animation finishes precisely at the subtitle's end.
        var newMarkerTime = newOutPoint - outDuration;

        // Guard: marker must not precede the layer's inPoint
        if (newMarkerTime < newStartTime) {
            newMarkerTime = newStartTime;
        }

        // Guard: marker must not land on or after outPoint
        if (newMarkerTime >= newOutPoint) {
            newMarkerTime = newOutPoint - (1.0 / 25.0); // at least 1 frame before outPoint
        }

        // ── Move the marker ───────────────────────────────────────────────────
        try {
            var markerProp = dupLayer.property("Marker");

            // Place the marker at its new position with the same value
            markerProp.setValueAtTime(newMarkerTime, outMarker.value);

            // Remove the old marker only if the position actually changed
            if (Math.abs(outMarkerTime - newMarkerTime) > 0.0001) {
                markerProp.removeKey(markerProp.nearestKeyIndex(outMarkerTime));
            }

            result.synced = true;
            Logger.debug("markerSync", "Marker '" + result.markerName + "' repositioned", {
                oldTime: outMarkerTime,
                newTime: newMarkerTime
            });
        } catch (e) {
            result.error = "Failed to move marker \"" + result.markerName + "\": " + e.toString();
            Logger.error("markerSync", "Failed to move marker '" + result.markerName + "'", e);
        }

        return result;
    }

    /**
     * Detect time overlaps between consecutive subtitle entries.
     * Used by panel.jsx to populate the log area after generation.
     *
     * @param  {Array}  entries   Array of { index, startSeconds, endSeconds, text }
     * @return {Array}            Array of { indexA, indexB, description }
     *                            (each item represents one overlapping pair)
     */
    function detectOverlaps(entries) {
        var overlaps = [];
        if (!entries || entries.length < 2) { return overlaps; }

        for (var i = 0; i < entries.length - 1; i++) {
            var a = entries[i];
            var b = entries[i + 1];

            // Overlap condition: next entry starts before current one ends
            if (b.startSeconds < a.endSeconds - 0.001) {
                overlaps.push({
                    indexA:      a.index,
                    indexB:      b.index,
                    description: "#" + a.index + " & #" + b.index +
                                 " (overlap " + (a.endSeconds - b.startSeconds).toFixed(3) + "s)"
                });
            }
        }

        return overlaps;
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        syncOutMarker:     syncOutMarker,
        detectOverlaps:    detectOverlaps,
        KNOWN_OUT_MARKERS: KNOWN_OUT_MARKERS
    };

})();
