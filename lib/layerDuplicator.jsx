/**
 * AESubMaster — layerDuplicator.jsx
 * 
 * Duplikasi template layer untuk setiap entry subtitle:
 *   - Injeksi teks via TextDocument (bukan replace string)
 *   - Set startTime, inPoint, outPoint sesuai timing SRT
 *   - Penamaan layer dari cuplikan teks
 *   - Tandai layer dengan comment "aesubmaster_generated"
 * 
 * Membutuhkan TimeUtils sudah di-#include sebelum file ini.
 * Kompatibel dengan ExtendScript (ES3).
 */

var LayerDuplicator = (function () {

    // ─── Konstanta ────────────────────────────────────────────────────────────

    /** Panjang maksimum nama layer (karakter). Sisa dipotong + "..." */
    var MAX_NAME_LENGTH = 35;

    /** Comment yang ditempel di setiap layer hasil generate — dipakai Re-import untuk identifikasi */
    var GENERATED_COMMENT = "aesubmaster_generated";

    // ─── Helper Internal ──────────────────────────────────────────────────────

    /**
     * Buat nama layer dari cuplikan teks subtitle.
     * - Sanitasi: \r dan \n diganti spasi, whitespace berlebih di-trim.
     * - Potong di MAX_NAME_LENGTH karakter, tambah "..." jika terpotong.
     * 
     * @param  {String} text   Teks subtitle (boleh multi-baris dengan \r)
     * @return {String}        Nama layer yang sudah disanitasi
     */
    function makeLayerName(text) {
        // Sanitasi: ganti line break jadi spasi, trim
        var single = text.replace(/\r/g, " ").replace(/\n/g, " ");
        single = single.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");

        if (single.length <= MAX_NAME_LENGTH) {
            return single;
        }
        return single.substring(0, MAX_NAME_LENGTH) + "...";
    }

    /**
     * Inject teks baru ke text layer via TextDocument.
     * Mempertahankan font, ukuran, warna, tracking dari template.
     * 
     * @param  {Layer}  layer   Layer AE hasil duplikasi
     * @param  {String} text    Teks baru yang akan diisi
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

    function duplicateAsSubtitle(templateLayer, entry, options) {
        var result = {
            success:          false,
            layer:            null,
            durationConflict: false,
            error:            ""
        };

        if (!templateLayer) {
            result.error = "Invalid template layer (null/undefined).";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: templateLayer null");
            return result;
        }

        if (!entry || typeof entry.startSeconds !== "number" || typeof entry.endSeconds !== "number") {
            result.error = "Invalid subtitle entry.";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: entry invalid", entry);
            return result;
        }

        if (entry.endSeconds <= entry.startSeconds) {
            result.error = "Entry #" + entry.index + ": endSeconds <= startSeconds — invalid timing.";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: timing invalid", { index: entry.index, start: entry.startSeconds, end: entry.endSeconds });
            return result;
        }

        var dupLayer;
        try {
            dupLayer = templateLayer.duplicate();
            dupLayer.enabled = true;
        } catch (e) {
            result.error = "Failed to duplicate template layer: " + e.toString();
            Logger.error("layerDuplicator", "Failed to duplicate template layer", e);
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
            dupLayer.startTime = entry.startSeconds;
            dupLayer.inPoint   = entry.startSeconds;
            dupLayer.outPoint  = entry.endSeconds;
        } catch (e) {
            try { dupLayer.remove(); } catch (ignore) {}
            result.error = "Failed to set layer timing for entry #" + entry.index + ": " + e.toString();
            Logger.error("layerDuplicator", "Failed setting timing for entry #" + entry.index, e);
            return result;
        }

        try {
            dupLayer.name = makeLayerName(entry.text);
        } catch (e) {
            Logger.warn("layerDuplicator", "Failed naming layer for entry #" + entry.index, e);
        }

        try {
            dupLayer.comment = GENERATED_COMMENT;
        } catch (e) {
            Logger.warn("layerDuplicator", "Failed setting layer comment", e);
        }

        result.success = true;
        result.layer   = dupLayer;
        Logger.debug("layerDuplicator", "Layer duplicated for entry #" + entry.index, { name: dupLayer.name, start: entry.startSeconds, end: entry.endSeconds });
        return result;
    }

    function hideTemplateLayer(templateLayer) {
        try {
            templateLayer.enabled = false;
            return { success: true };
        } catch (e) {
            return { success: false, error: "Failed to hide template layer: " + e.toString() };
        }
    }

    function findGeneratedLayers(comp, preserveLayer) {
        var found = [];
        if (!comp || !comp.layers) { return found; }

        for (var i = 1; i <= comp.layers.length; i++) {
            try {
                var layer = comp.layers[i];
                if (layer.comment === GENERATED_COMMENT) {
                    if (preserveLayer && layer === preserveLayer) {
                        continue;
                    }
                    found.push(layer);
                }
            } catch (ignore) {}
        }

        return found;
    }

    function removeGeneratedLayers(comp, preserveLayer) {
        var result = { success: false, removedCount: 0, error: "" };

        try {
            var toRemove = findGeneratedLayers(comp, preserveLayer);
            Logger.info("layerDuplicator", "removeGeneratedLayers: found " + toRemove.length + " layers to remove");

            for (var i = 0; i < toRemove.length; i++) {
                try {
                    toRemove[i].remove();
                    result.removedCount++;
                } catch (e) {
                    Logger.warn("layerDuplicator", "Failed removing layer #" + i, e);
                }
            }

            result.success = true;
            Logger.info("layerDuplicator", "removeGeneratedLayers finished", { removedCount: result.removedCount });
        } catch (e) {
            result.error = "Error removing previous layers: " + e.toString();
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
