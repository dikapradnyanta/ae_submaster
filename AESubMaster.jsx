/**
 * AESubMaster.jsx
 * 
 * Entry point utama plugin AESubMaster.
 * File ini yang diletakkan di folder Scripts/ScriptUI Panels After Effects
 * (beserta seluruh folder lib/ dan ui/ di subfolder yang sama).
 * 
 * Setelah diletakkan di sana, plugin muncul di menu Window After Effects
 * sebagai dockable panel — tanpa perlu ZXP/signing.
 * 
 * ─── Cara Install ──────────────────────────────────────────────────────────
 * Salin seluruh folder AESubMaster/ ke:
 *   Windows: C:\Program Files\Adobe\Adobe After Effects <versi>\Support Files\Scripts\ScriptUI Panels\
 *   macOS:   /Applications/Adobe After Effects <versi>/Scripts/ScriptUI Panels/
 * 
 * Atau letakkan di folder Scripts/ScriptUI Panels versi user:
 *   Windows: C:\Users\<user>\AppData\Roaming\Adobe\After Effects\<versi>\Scripts\ScriptUI Panels\
 *   macOS:   ~/Library/Application Support/Adobe/After Effects/<versi>/Scripts/ScriptUI Panels/
 * 
 * Restart After Effects, lalu buka dari menu Window > AESubMaster.
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * PENTING: #include menggunakan path relatif dari lokasi file ini.
 * Seluruh folder lib/ dan ui/ harus berada di dalam folder AESubMaster/
 * (satu level di bawah file ini).
 */

// ─── Load semua modul (urutan penting karena ada dependensi) ─────────────────
// Logger harus di-#include PERTAMA agar tersedia untuk semua modul lain.

#include "AESubMaster/lib/logger.jsx"
#include "AESubMaster/lib/timeUtils.jsx"
#include "AESubMaster/lib/srtParser.jsx"
#include "AESubMaster/lib/srtWriter.jsx"
#include "AESubMaster/lib/layerDuplicator.jsx"
#include "AESubMaster/lib/markerSync.jsx"
#include "AESubMaster/lib/presetIO.jsx"
#include "AESubMaster/lib/prefs.jsx"
#include "AESubMaster/ui/srtEditorWindow.jsx"
#include "AESubMaster/ui/panel.jsx"

// ─── Entry Point ─────────────────────────────────────────────────────────────

(function (thisObj) {
    /**
     * thisObj:
     *   - Jika dijalankan dari menu Window (docked panel): thisObj = Panel object
     *   - Jika dijalankan via File > Scripts > Run Script: thisObj = global object
     * 
     * buildPanel() mendeteksi ini dan membuat Panel atau Window sesuai konteks.
     */
    buildPanel(thisObj);

})(this);
