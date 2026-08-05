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
            return { success: false, error: "Layer tidak valid." };
        }

        if (!isTextLayer(layer)) {
            Logger.error("presetIO", "exportTemplateAsPreset: not a text layer");
            return { success: false, error: "Layer bukan text layer — hanya text layer yang bisa diekspor sebagai template." };
        }

        if (!filePath || filePath.length === 0) {
            Logger.error("presetIO", "exportTemplateAsPreset: filePath empty");
            return { success: false, error: "Path file tidak boleh kosong." };
        }

        try {
            var presetFile = new File(filePath);

            // Pastikan folder tujuan ada
            var parentFolder = presetFile.parent;
            if (parentFolder && !parentFolder.exists) {
                parentFolder.create();
            }

            layer.saveAsAnimationPreset(presetFile);

            if (!presetFile.exists) {
                Logger.error("presetIO", "saveAsAnimationPreset executed but file does not exist", { path: filePath });
                return { success: false, error: "File .ffx gagal dibuat (saveAsAnimationPreset tidak menghasilkan file)." };
            }

            Logger.info("presetIO", "Export preset succeeded", { path: filePath });
            return { success: true };
        } catch (e) {
            Logger.error("presetIO", "Export preset exception", e);
            return { success: false, error: "Export preset gagal: " + e.toString() };
        }
    }

    function importTemplateFromPreset(filePath, targetComp) {
        if (!filePath || filePath.length === 0) {
            Logger.error("presetIO", "importTemplateFromPreset: filePath empty");
            return { success: false, layer: null, error: "Path file .ffx tidak boleh kosong." };
        }

        if (!targetComp) {
            Logger.error("presetIO", "importTemplateFromPreset: targetComp null");
            return { success: false, layer: null, error: "Composition tujuan tidak valid." };
        }

        var presetFile = new File(filePath);
        if (!presetFile.exists) {
            Logger.error("presetIO", "Preset file not found", { path: filePath });
            return { success: false, layer: null, error: "File .ffx tidak ditemukan: " + filePath };
        }

        try {
            // Buat text layer baru — jadi layer teks placeholder
            var newLayer = targetComp.layers.addText("Template");

            // Nama layer menunjukkan ini hasil load dari preset
            try {
                var fileName = presetFile.name;
                var displayName = fileName.replace(/\.ffx$/i, "");
                newLayer.name = "[Template] " + displayName;
            } catch (ignore) {}

            // Apply preset ke layer baru
            try {
                newLayer.applyPreset(presetFile);
            } catch (e) {
                try { newLayer.remove(); } catch (ignore) {}
                Logger.error("presetIO", "applyPreset failed", { path: filePath, error: e.toString() });
                return {
                    success: false,
                    layer: null,
                    error: "Gagal menerapkan preset ke layer baru: " + e.toString() +
                           "\nPastikan file .ffx valid dan kompatibel dengan versi AE ini."
                };
            }

            Logger.info("presetIO", "Import preset succeeded", { layerName: newLayer.name, path: filePath });
            return { success: true, layer: newLayer };
        } catch (e) {
            Logger.error("presetIO", "Import preset exception", e);
            return { success: false, layer: null, error: "Import template gagal: " + e.toString() };
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        exportTemplateAsPreset:   exportTemplateAsPreset,
        importTemplateFromPreset: importTemplateFromPreset
    };

})();
