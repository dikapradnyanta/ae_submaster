/**
 * AESubMaster — presetIO.jsx
 *
 * Exports and imports Animation Presets (.ffx) to persist a template layer's
 * style, animation, and expressions across sessions and projects.
 *
 * ExtendScript (ES3) compatible.
 */

var PresetIO = (function () {

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * Check whether a layer is a text layer.
     * Uses the presence of "Source Text" as the detection heuristic.
     *
     * @param  {Layer}   layer
     * @return {Boolean}
     */
    function isTextLayer(layer) {
        try {
            return (layer && layer.property("Source Text") !== null);
        } catch (e) {
            return false;
        }
    }

    // ─── Public Functions ─────────────────────────────────────────────────────

    /**
     * Export a template layer as an Animation Preset (.ffx).
     *
     * Saves all properties, effects, expressions, and markers to a portable
     * .ffx file that can be used in other projects or on other machines.
     *
     * @param  {Layer}   layer     Template layer to export
     * @param  {String}  filePath  Destination .ffx path (including extension)
     * @return {Object}            { success: Boolean, error: String }
     */
    function exportTemplateAsPreset(layer, filePath) {
        if (!layer) {
            Logger.error("presetIO", "exportTemplateAsPreset: layer is null");
            return { success: false, error: "Invalid layer." };
        }

        if (!isTextLayer(layer)) {
            Logger.error("presetIO", "exportTemplateAsPreset: layer is not a text layer");
            return { success: false, error: "Only text layers can be exported as templates." };
        }

        if (!filePath || filePath.length === 0) {
            Logger.error("presetIO", "exportTemplateAsPreset: filePath is empty");
            return { success: false, error: "File path cannot be empty." };
        }

        try {
            var presetFile   = new File(filePath);
            var parentFolder = presetFile.parent;

            // Create parent directory if it doesn't exist
            if (parentFolder && !parentFolder.exists) {
                parentFolder.create();
            }

            layer.saveAsAnimationPreset(presetFile);

            if (!presetFile.exists) {
                Logger.error("presetIO", "saveAsAnimationPreset ran but output file is missing", { path: filePath });
                return { success: false, error: ".ffx file was not created (saveAsAnimationPreset produced no output)." };
            }

            Logger.info("presetIO", "Preset exported successfully", { path: filePath });
            return { success: true };
        } catch (e) {
            Logger.error("presetIO", "Export preset exception", e);
            return { success: false, error: "Export failed: " + e.toString() };
        }
    }

    /**
     * Import an Animation Preset (.ffx) as a new template layer in a composition.
     *
     * Creates a new text layer, applies the preset, and returns the layer
     * so it can immediately be selected as the active template.
     *
     * @param  {String}   filePath    Path to the .ffx file
     * @param  {CompItem} targetComp  Composition to add the new layer to
     * @return {Object}               { success: Boolean, layer: Layer | null, error: String }
     */
    function importTemplateFromPreset(filePath, targetComp) {
        if (!filePath || filePath.length === 0) {
            Logger.error("presetIO", "importTemplateFromPreset: filePath is empty");
            return { success: false, layer: null, error: ".ffx file path cannot be empty." };
        }

        if (!targetComp) {
            Logger.error("presetIO", "importTemplateFromPreset: targetComp is null");
            return { success: false, layer: null, error: "Target composition is invalid." };
        }

        var presetFile = new File(filePath);
        if (!presetFile.exists) {
            Logger.error("presetIO", "Preset file not found", { path: filePath });
            return { success: false, layer: null, error: ".ffx file not found: " + filePath };
        }

        try {
            var newLayer = targetComp.layers.addText("Template");

            // Name the layer after the preset file (without extension)
            try {
                var displayName = presetFile.name.replace(/\.ffx$/i, "");
                newLayer.name = "[Template] " + displayName;
            } catch (ignore) {}

            // Apply the preset — remove the layer if this fails
            try {
                newLayer.applyPreset(presetFile);
            } catch (e) {
                try { newLayer.remove(); } catch (ignore) {}
                Logger.error("presetIO", "applyPreset failed", { path: filePath, error: e.toString() });
                return {
                    success: false,
                    layer:   null,
                    error:   "Failed to apply preset: " + e.toString() +
                             "\nEnsure the .ffx file is valid and compatible with this After Effects version."
                };
            }

            Logger.info("presetIO", "Preset imported successfully", { layerName: newLayer.name, path: filePath });
            return { success: true, layer: newLayer };
        } catch (e) {
            Logger.error("presetIO", "Import preset exception", e);
            return { success: false, layer: null, error: "Import failed: " + e.toString() };
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        exportTemplateAsPreset:   exportTemplateAsPreset,
        importTemplateFromPreset: importTemplateFromPreset
    };

})();
