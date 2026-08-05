/**
 * AESubMaster — markerSync.jsx
 * 
 * Mendeteksi dan menggeser marker animasi Out di layer hasil duplikasi
 * secara proporsional terhadap durasi subtitle baru.
 * 
 * Kompatibel dengan ExtendScript (ES3).
 */

var MarkerSync = (function () {

    // ─── Konstanta ────────────────────────────────────────────────────────────

    /**
     * Daftar nama marker yang dikenali sebagai penanda animasi Out.
     * Nama ini dicek terhadap properti MarkerValue.comment dari setiap marker.
     * 
     * DEVELOPER NOTE: Tambahkan nama marker baru di sini jika ada preset lain
     * yang perlu didukung. Casing sensitif — sesuaikan dengan nama persis di preset.
     * 
     * Nama yang diketahui:
     *   - "trOut"    → Motion Bro / Mr. Horse preset (paling umum)
     *   - "outAnim"  → beberapa preset manual
     *   - "OUT"      → preset custom uppercase
     *   - "out"      → preset custom lowercase
     *   - "animOut"  → variasi penulisan lain
     */
    var KNOWN_OUT_MARKERS = ["trOut", "outAnim", "OUT", "out", "animOut"];

    // ─── Helper Internal ──────────────────────────────────────────────────────

    /**
     * Cek apakah sebuah string ada di dalam array (ES3 — tidak ada Array.indexOf).
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
     * Ambil semua marker dari sebuah layer sebagai array of { time, value }.
     * 
     * @param  {Layer}  layer
     * @return {Array}  Array of { time: Number, value: MarkerValue }
     *                  Return [] jika layer tidak punya marker atau terjadi error.
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
                    // Marker tertentu gagal dibaca — lewati
                }
            }
        } catch (e) {
            // Layer tidak punya properti Marker — normal, return []
        }
        return markers;
    }

    // ─── Fungsi Utama ─────────────────────────────────────────────────────────

    /**
     * Sinkronisasi marker animasi Out pada layer hasil duplikasi.
     * 
     * Logika:
     *   1. Cari marker yang namanya ada di knownMarkerNames.
     *   2. Hitung offset marker dari outPoint template (posisi dari akhir).
     *   3. Geser marker ke posisi yang sama secara proporsional di outPoint baru.
     * 
     * Jika durasi subtitle baru lebih pendek dari jarak In+Out animasi di template:
     *   → return { synced: false, conflict: true } — TIDAK ada perubahan otomatis.
     * 
     * @param  {Layer}   dupLayer          Layer hasil duplikasi yang akan dimodifikasi
     * @param  {Number}  templateStartTime startTime template asli (detik)
     * @param  {Number}  templateOutPoint  outPoint template asli (detik)
     * @param  {Number}  newStartTime      startTime baru (= entry.startSeconds)
     * @param  {Number}  newOutPoint       outPoint baru (= entry.endSeconds)
     * @param  {Array}   knownMarkerNames  Array nama marker — gunakan KNOWN_OUT_MARKERS
     * @return {Object}  {
     *                     synced:   Boolean,   // true jika marker ditemukan & berhasil digeser
     *                     conflict: Boolean,   // true jika durasi subtitle < jarak animasi
     *                     markerName: String,  // nama marker yang ditemukan (jika synced)
     *                     error:    String     // pesan error jika gagal
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

        // ── Kumpulkan semua marker di layer ─────────────────────────────────
        var allMarkers = getAllMarkers(dupLayer);
        if (allMarkers.length === 0) {
            // Tidak ada marker sama sekali — tidak ada yang perlu disinkronkan
            return result;
        }

        // ── Cari marker Out yang dikenali ────────────────────────────────────
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
                outMarker     = allMarkers[i];
                outMarkerTime = allMarkers[i].time;
                result.markerName = markerComment;
                break;
            }
        }

        if (outMarker === null) {
            // Tidak ada marker yang dikenali — bukan error, cukup return unsynced
            Logger.debug("markerSync", "No recognized out marker found on layer", { markersFound: allMarkers.length });
            return result;
        }

        // ── Hitung durasi animasi ─────────────────────────────────────────────
        var outDuration = templateOutPoint - outMarkerTime;
        var templateDuration = templateOutPoint - templateStartTime;
        var newDuration = newOutPoint - newStartTime;

        // ── Deteksi konflik durasi ───────────────────────────────────────────
        if (newDuration < outDuration - 0.001) {
            result.conflict = true;
            Logger.warn("markerSync", "Duration conflict for marker '" + result.markerName + "'", {
                newDuration: newDuration,
                requiredOutAnimDuration: outDuration
            });
            // TIDAK mengubah marker — kembalikan tanpa modifikasi
            return result;
        }

        // ── Hitung posisi marker baru ────────────────────────────────────────
        var newMarkerTime = newOutPoint - outDuration;
        if (newMarkerTime < newStartTime) {
            newMarkerTime = newStartTime;
        }

        // ── Geser marker ke posisi baru ──────────────────────────────────────
        try {
            var markerProp = dupLayer.property("Marker");

            // Tambah marker baru di posisi baru dengan value yang sama
            markerProp.setValueAtTime(newMarkerTime, outMarker.value);

            // Hapus marker lama di posisi lama (jika posisinya berbeda)
            if (Math.abs(outMarkerTime - newMarkerTime) > 0.0001) {
                markerProp.removeKey(markerProp.nearestKeyIndex(outMarkerTime));
            }

            result.synced = true;
            Logger.debug("markerSync", "Marker '" + result.markerName + "' moved successfully", {
                oldTime: outMarkerTime,
                newTime: newMarkerTime
            });
        } catch (e) {
            result.error = "Gagal menggeser marker \"" + result.markerName + "\": " + e.toString();
            Logger.error("markerSync", "Failed moving marker '" + result.markerName + "'", e);
        }

        return result;
    }

    /**
     * Deteksi overlap waktu antar entry subtitle.
     * Dipakai oleh panel.jsx untuk mengisi log area setelah generate.
     * 
     * @param  {Array}  entries   Array of { index, startSeconds, endSeconds, text }
     * @return {Array}            Array of { indexA, indexB, description }
     *                            (pasangan entry yang saling overlap)
     */
    function detectOverlaps(entries) {
        var overlaps = [];
        if (!entries || entries.length < 2) { return overlaps; }

        for (var i = 0; i < entries.length - 1; i++) {
            var a = entries[i];
            var b = entries[i + 1];

            // Overlap: b.startSeconds < a.endSeconds
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
