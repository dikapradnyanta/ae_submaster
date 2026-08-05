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
                return { success: false, error: "Layer tidak punya properti 'Source Text'." };
            }

            var td = textProp.value;
            td.text = text;
            textProp.setValue(td);

            return { success: true };
        } catch (e) {
            return { success: false, error: "Gagal injeksi teks: " + e.toString() };
        }
    }

    // ─── Fungsi Utama ─────────────────────────────────────────────────────────

    /**
     * Duplikasi template layer dan sesuaikan untuk satu entry subtitle.
     * 
     * Catatan: Undo group TIDAK dibuat di sini — dibuat di level caller (panel.jsx)
     * agar seluruh batch generate = satu langkah undo.
     * 
     * @param  {TextLayer} templateLayer   Layer template yang akan diduplikasi
     * @param  {Object}    entry           { index, startSeconds, endSeconds, text }
     * @param  {Object}    options         {
     *                                       insertAboveTemplate: Boolean  (default: true)
     *                                                           kalau true, layer baru diletakkan
     *                                                           tepat di atas template di timeline
     *                                     }
     * @return {Object}    {
     *                       success:          Boolean,
     *                       layer:            Layer | null,
     *                       durationConflict: Boolean,  // diisi oleh markerSync nanti
     *                       error:            String
     *                     }
     */
    function duplicateAsSubtitle(templateLayer, entry, options) {
        var result = {
            success:          false,
            layer:            null,
            durationConflict: false,
            error:            ""
        };

        // ── Validasi input ───────────────────────────────────────────────────
        if (!templateLayer) {
            result.error = "Template layer tidak valid (null/undefined).";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: templateLayer null");
            return result;
        }

        if (!entry || typeof entry.startSeconds !== "number" || typeof entry.endSeconds !== "number") {
            result.error = "Entry subtitle tidak valid.";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: entry invalid", entry);
            return result;
        }

        if (entry.endSeconds <= entry.startSeconds) {
            result.error = "Entry #" + entry.index + ": endSeconds <= startSeconds — timing tidak valid.";
            Logger.error("layerDuplicator", "duplicateAsSubtitle: timing invalid", { index: entry.index, start: entry.startSeconds, end: entry.endSeconds });
            return result;
        }

        // ── Duplikasi layer ──────────────────────────────────────────────────
        var dupLayer;
        try {
            dupLayer = templateLayer.duplicate();
            // Pastikan layer hasil duplikasi selalu visible (enabled = true)
            // meskipun template layer asli dalam posisi hidden
            dupLayer.enabled = true;
        } catch (e) {
            result.error = "Gagal menduplikasi template layer: " + e.toString();
            Logger.error("layerDuplicator", "Failed to duplicate template layer", e);
            return result;
        }

        // ── Injeksi teks ─────────────────────────────────────────────────────
        var injectResult = injectText(dupLayer, entry.text);
        if (!injectResult.success) {
            // Hapus duplikat yang gagal supaya tidak meninggalkan layer orphan
            try { dupLayer.remove(); } catch (ignore) {}
            result.error = injectResult.error;
            Logger.error("layerDuplicator", "Text injection failed for entry #" + entry.index, injectResult.error);
            return result;
        }

        // ── Set timing layer ─────────────────────────────────────────────────
        // Urutan penting:
        //   1. startTime dulu — menggeser seluruh keyframe (animasi In)
        //   2. inPoint/outPoint — menentukan visibilitas di timeline
        try {
            dupLayer.startTime = entry.startSeconds;
            dupLayer.inPoint   = entry.startSeconds;
            dupLayer.outPoint  = entry.endSeconds;
        } catch (e) {
            try { dupLayer.remove(); } catch (ignore) {}
            result.error = "Gagal set timing layer untuk entry #" + entry.index + ": " + e.toString();
            Logger.error("layerDuplicator", "Failed setting timing for entry #" + entry.index, e);
            return result;
        }

        // ── Penamaan layer ───────────────────────────────────────────────────
        try {
            dupLayer.name = makeLayerName(entry.text);
        } catch (e) {
            Logger.warn("layerDuplicator", "Failed naming layer for entry #" + entry.index, e);
        }

        // ── Tandai sebagai layer hasil generate ──────────────────────────────
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

    /**
     * Sembunyikan layer template setelah proses generate selesai.
     * Dipanggil SATU KALI di akhir batch, bukan per-entry.
     * 
     * Keputusan desain [Q1]: template otomatis di-hide agar tidak dobel muncul
     * sebagai subtitle pertama di timeline.
     * 
     * @param  {Layer}  templateLayer
     * @return {Object} { success: Boolean, error: String }
     */
    function hideTemplateLayer(templateLayer) {
        try {
            templateLayer.enabled = false;
            return { success: true };
        } catch (e) {
            return { success: false, error: "Gagal menyembunyikan template layer: " + e.toString() };
        }
    }

    /**
     * Temukan semua layer yang ditandai sebagai hasil generate AESubMaster
     * di dalam sebuah composition. Dipakai oleh fitur Re-import/Replace.
     * 
     * @param  {CompItem} comp
     * @param  {Layer}    [preserveLayer]   Layer yang tidak boleh dihapus (template layer)
     * @return {Array}    Array of Layer
     */
    function findGeneratedLayers(comp, preserveLayer) {
        var found = [];
        if (!comp || !comp.layers) { return found; }

        for (var i = 1; i <= comp.layers.length; i++) {
            try {
                var layer = comp.layers[i];
                if (layer.comment === GENERATED_COMMENT) {
                    if (preserveLayer && layer === preserveLayer) {
                        continue; // Jangan hapus template layer walaupun bertanda generated
                    }
                    found.push(layer);
                }
            } catch (ignore) {}
        }

        return found;
    }

    /**
     * Hapus semua layer hasil generate dari sebuah composition.
     * Dipakai oleh fitur Re-import/Replace.
     * 
     * @param  {CompItem} comp
     * @param  {Layer}    [preserveLayer]   Layer yang tidak boleh dihapus (template layer)
     * @return {Object}   { success: Boolean, removedCount: Number, error: String }
     */
    function removeGeneratedLayers(comp, preserveLayer) {
        var result = { success: false, removedCount: 0, error: "" };

        try {
            // Kumpulkan dulu semua layer yang perlu dihapus
            // (jangan hapus saat iterasi karena index berubah)
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
            result.error = "Error saat menghapus layer lama: " + e.toString();
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
