/**
 * AESubMaster — layerDuplicator.jsx
 *
 * Duplicates a template layer for each subtitle entry:
 *   - Injects text via TextDocument (preserves font, size, color, tracking)
 *   - Sets startTime, inPoint, outPoint from SRT timing
 *   - Names the layer from the first 35 characters of the subtitle text
 *   - Tags the layer with comment "aesubmaster_generated" for Re-import detection
 *
 * Requires TimeUtils to be #included before this file.
 * ExtendScript (ES3) compatible.
 */

var LayerDuplicator = (function () {

    // ─── Constants ────────────────────────────────────────────────────────────

    /** Maximum characters in a generated layer name before truncation with "..." */
    var MAX_NAME_LENGTH = 35;

    /** Comment tag applied to every generated layer — used by Re-import to identify them */
    var GENERATED_COMMENT = "aesubmaster_generated";

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Build a clean layer name from subtitle text.
     * - Replaces \r and \n with spaces, collapses extra whitespace.
     * - Truncates to MAX_NAME_LENGTH and appends "..." if cut.
     *
     * @param  {String} text   Subtitle text (may be multi-line with \r)
     * @return {String}        Sanitized layer name
     */
    function makeLayerName(text) {
        var single = text.replace(/\r/g, " ").replace(/\n/g, " ");
        single = single.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

        if (single.length <= MAX_NAME_LENGTH) {
            return single;
        }
        return single.substring(0, MAX_NAME_LENGTH) + "...";
    }

    /**
     * Inject new text into a text layer via TextDocument.
     * Preserves the template's font, size, color, and tracking.
     *
     * @param  {Layer}  layer   Duplicated AE layer
     * @param  {String} text    New subtitle text
     * @return {Object}         { success: Boolean, error: String }
     */
    function injectText(layer, text) {
        try {
            var textProp = layer.property("Source Text");
            if (!textProp) {
                return { success: false, error: "Layer does not have 'Source Text' property." };
            }

            var td = textProp.value;
            td.text = text;
            textProp.setValue(td);

            return { success: true };
        } catch (e) {
            return { success: false, error: "Failed to inject text: " + e.toString() };
        }
    }

    /**
     * Duplicate the template layer and configure it as a subtitle layer.
     *
     * @param  {Layer}   templateLayer   Source template layer to duplicate
     * @param  {Object}  entry           { index, startSeconds, endSeconds, text }
     * @param  {Object}  options         { leadIn: Number, leadOut: Number } (seconds, both default 0)
     * @return {Object}                  {
     *                                     success: Boolean,
     *                                     layer: Layer | null,
     *                                     durationConflict: Boolean,
     *                                     actualStart: Number,
     *                                     actualEnd: Number,
     *                                     error: String
     *                                   }
     */
    function duplicateAsSubtitle(templateLayer, entry, options) {
        var result = {
            success:          false,
            layer:            null,
            durationConflict: false,
            error:            ""
        };

        if (!templateLayer) {
            result.error = "Invalid template layer (null/undefined).";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: templateLayer is null");
            return result;
        }

        if (!entry || typeof entry.startSeconds !== "number" || typeof entry.endSeconds !== "number") {
            result.error = "Invalid subtitle entry.";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: entry is invalid", entry);
            return result;
        }

        if (entry.endSeconds <= entry.startSeconds) {
            result.error = "Entry #" + entry.index + ": endSeconds <= startSeconds — invalid timing.";
            Logger.error("layerDuplicator", "Invalid timing for entry #" + entry.index, { start: entry.startSeconds, end: entry.endSeconds });
            return result;
        }

        // ── Apply Lead In / Lead Out adjustments ──────────────────────────────
        // Lead In:  shift inPoint earlier so the layer appears before the subtitle starts
        // Lead Out: shift outPoint later so the layer lingers after the subtitle ends
        var opts    = options || {};
        var leadIn  = (typeof opts.leadIn  === "number" && !isNaN(opts.leadIn))  ? opts.leadIn  : 0;
        var leadOut = (typeof opts.leadOut === "number" && !isNaN(opts.leadOut)) ? opts.leadOut : 0;

        var actualStart = entry.startSeconds - leadIn;
        if (actualStart < 0) { actualStart = 0; } // clamp to timeline start

        var actualEnd = entry.endSeconds + leadOut;

        // Ensure outPoint is always after inPoint after lead adjustments
        if (actualEnd <= actualStart) { actualEnd = actualStart + 0.04; } // minimum ~1 frame

        var dupLayer;
        try {
            dupLayer = templateLayer.duplicate();
            dupLayer.enabled = true;
        } catch (e) {
            result.error = "Failed to duplicate template layer: " + e.toString();
            Logger.error("layerDuplicator", "layer.duplicate() failed", e);
            return result;
        }

        var injectResult = injectText(dupLayer, entry.text);
        if (!injectResult.success) {
            try { dupLayer.remove(); } catch (ignore) {}
            result.error = injectResult.error;
            Logger.error("layerDuplicator", "Text injection failed for entry #" + entry.index, injectResult.error);
            return result;
        }

        try {
            dupLayer.startTime = actualStart;
            dupLayer.inPoint   = actualStart;
            dupLayer.outPoint  = actualEnd;
        } catch (e) {
            try { dupLayer.remove(); } catch (ignore) {}
            result.error = "Failed to set timing for entry #" + entry.index + ": " + e.toString();
            Logger.error("layerDuplicator", "Timing assignment failed for entry #" + entry.index, e);
            return result;
        }

        try {
            dupLayer.name = makeLayerName(entry.text);
        } catch (e) {
            Logger.warn("layerDuplicator", "Failed to set layer name for entry #" + entry.index, e);
        }

        try {
            dupLayer.comment = GENERATED_COMMENT;
        } catch (e) {
            Logger.warn("layerDuplicator", "Failed to set layer comment", e);
        }

        result.success     = true;
        result.layer       = dupLayer;
        result.actualStart = actualStart;
        result.actualEnd   = actualEnd;
        Logger.debug("layerDuplicator", "Layer created for entry #" + entry.index, { name: dupLayer.name, start: actualStart, end: actualEnd });
        return result;
    }

    /**
     * Hide the template layer by disabling its visibility.
     *
     * @param  {Layer}  templateLayer
     * @return {Object} { success: Boolean, error: String }
     */
    function hideTemplateLayer(templateLayer) {
        try {
            templateLayer.enabled = false;
            return { success: true };
        } catch (e) {
            return { success: false, error: "Failed to hide template layer: " + e.toString() };
        }
    }

    /**
     * Collect all generated layers in a composition.
     * Optionally skips a specific layer (used to preserve the active template).
     *
     * @param  {CompItem} comp
     * @param  {Layer}    [preserveLayer]   Layer to exclude from results
     * @return {Array}                      Array of matching Layer objects
     */
    function findGeneratedLayers(comp, preserveLayer) {
        var found = [];
        if (!comp || !comp.layers) { return found; }

        for (var i = 1; i <= comp.layers.length; i++) {
            try {
                var layer = comp.layers[i];
                if (layer.comment === GENERATED_COMMENT) {
                    if (preserveLayer && layer === preserveLayer) { continue; }
                    found.push(layer);
                }
            } catch (ignore) {}
        }

        return found;
    }

    /**
     * Remove all generated layers from a composition.
     *
     * @param  {CompItem} comp
     * @param  {Layer}    [preserveLayer]   Layer to skip during removal
     * @return {Object}   { success: Boolean, removedCount: Number, error: String }
     */
    function removeGeneratedLayers(comp, preserveLayer) {
        var result = { success: false, removedCount: 0, error: "" };

        try {
            var toRemove = findGeneratedLayers(comp, preserveLayer);
            Logger.info("layerDuplicator", "Removing " + toRemove.length + " generated layer(s)");

            for (var i = 0; i < toRemove.length; i++) {
                try {
                    toRemove[i].remove();
                    result.removedCount++;
                } catch (e) {
                    Logger.warn("layerDuplicator", "Failed to remove layer index " + i, e);
                }
            }

            result.success = true;
            Logger.info("layerDuplicator", "Removal complete", { removedCount: result.removedCount });
        } catch (e) {
            result.error = "Error removing generated layers: " + e.toString();
            Logger.error("layerDuplicator", "removeGeneratedLayers error", e);
        }

        return result;
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        duplicateAsSubtitle:   duplicateAsSubtitle,
        hideTemplateLayer:     hideTemplateLayer,
        findGeneratedLayers:   findGeneratedLayers,
        removeGeneratedLayers: removeGeneratedLayers,
        GENERATED_COMMENT:     GENERATED_COMMENT
    };

})();
