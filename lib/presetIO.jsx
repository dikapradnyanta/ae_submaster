/**
 * AESubMaster — presetIO.jsx
 * 
 * Export/import Animation Preset (.ffx) untuk persistensi template layer
 * lintas sesi dan lintas project.
 * 
 * Kompatibel dengan ExtendScript (ES3).
 */

var PresetIO = (function () {

    // ─── Helper Internal ──────────────────────────────────────────────────────

    /**
     * Validasi bahwa sebuah layer adalah text layer.
     * 
     * @param  {Layer}   layer
     * @return {Boolean}
     */
    function isTextLayer(layer) {
        try {
            // TextLayer memiliki properti "Source Text"
            return (layer && layer.property("Source Text") !== null);
        } catch (e) {
            return false;
        }
    }

    // ─── Fungsi Utama ─────────────────────────────────────────────────────────

    /**
     * Export template layer sebagai Animation Preset (.ffx).
     * 
     * Menyimpan seluruh properti, efek, expression, dan marker ke file .ffx
     * yang portable — bisa dipakai di project atau mesin AE lain.
     * 
     * @param  {Layer}   layer     Template layer yang akan diekspor
     * @param  {String}  filePath  Path tujuan file .ffx (termasuk ekstensi)
     * @return {Object}  { success: Boolean, error: String }
     */
    function exportTemplateAsPreset(layer, filePath) {
        if (!layer) {
            Logger.error("presetIO", "exportTemplateAsPreset: layer null");
            return { success: false, error: "Invalid layer." };
        }

        if (!isTextLayer(layer)) {
            Logger.error("presetIO", "exportTemplateAsPreset: not a text layer");
            return { success: false, error: "Layer is not a text layer — only text layers can be exported as templates." };
        }

        if (!filePath || filePath.length === 0) {
            Logger.error("presetIO", "exportTemplateAsPreset: filePath empty");
            return { success: false, error: "File path cannot be empty." };
        }

        try {
            var presetFile = new File(filePath);

            var parentFolder = presetFile.parent;
            if (parentFolder && !parentFolder.exists) {
                parentFolder.create();
            }

            layer.saveAsAnimationPreset(presetFile);

            if (!presetFile.exists) {
                Logger.error("presetIO", "saveAsAnimationPreset executed but file does not exist", { path: filePath });
                return { success: false, error: ".ffx file creation failed (saveAsAnimationPreset produced no file)." };
            }

            Logger.info("presetIO", "Export preset succeeded", { path: filePath });
            return { success: true };
        } catch (e) {
            Logger.error("presetIO", "Export preset exception", e);
            return { success: false, error: "Export preset failed: " + e.toString() };
        }
    }

    function importTemplateFromPreset(filePath, targetComp) {
        if (!filePath || filePath.length === 0) {
            Logger.error("presetIO", "importTemplateFromPreset: filePath empty");
            return { success: false, layer: null, error: ".ffx file path cannot be empty." };
        }

        if (!targetComp) {
            Logger.error("presetIO", "importTemplateFromPreset: targetComp null");
            return { success: false, layer: null, error: "Target composition is invalid." };
        }

        var presetFile = new File(filePath);
        if (!presetFile.exists) {
            Logger.error("presetIO", "Preset file not found", { path: filePath });
            return { success: false, layer: null, error: ".ffx file not found: " + filePath };
        }

        try {
            var newLayer = targetComp.layers.addText("Template");

            try {
                var fileName = presetFile.name;
                var displayName = fileName.replace(/\.ffx$/i, "");
                newLayer.name = "[Template] " + displayName;
            } catch (ignore) {}

            try {
                newLayer.applyPreset(presetFile);
            } catch (e) {
                try { newLayer.remove(); } catch (ignore) {}
                Logger.error("presetIO", "applyPreset failed", { path: filePath, error: e.toString() });
                return {
                    success: false,
                    layer: null,
                    error: "Failed to apply preset to new layer: " + e.toString() +
                           "\nEnsure .ffx file is valid and compatible with this After Effects version."
                };
            }

            Logger.info("presetIO", "Import preset succeeded", { layerName: newLayer.name, path: filePath });
            return { success: true, layer: newLayer };
        } catch (e) {
            Logger.error("presetIO", "Import preset exception", e);
            return { success: false, layer: null, error: "Import template failed: " + e.toString() };
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        exportTemplateAsPreset:   exportTemplateAsPreset,
        importTemplateFromPreset: importTemplateFromPreset
    };

})();
