# AESubMaster — SRT Subtitle Importer untuk After Effects

Plugin ScriptUI (.jsx) untuk After Effects yang mengimpor file subtitle `.srt` sebagai text layer, menggunakan **duplikasi template layer** agar animasi preset pihak ketiga (Mr. Horse, Motion Bro, dll) terbawa otomatis.

---

## Cara Install

1. **Salin seluruh folder `AESubMaster/`** (beserta subfolder `lib/`, `ui/`, dan `docs/`) ke salah satu lokasi berikut:

   **Windows:**
   ```
   C:\Program Files\Adobe\Adobe After Effects <versi>\Support Files\Scripts\ScriptUI Panels\AESubMaster\
   ```
   *Atau versi per-user (tidak perlu admin):*
   ```
   C:\Users\<nama_user>\AppData\Roaming\Adobe\After Effects\<versi>\Scripts\ScriptUI Panels\AESubMaster\
   ```

   **macOS:**
   ```
   /Applications/Adobe After Effects <versi>/Scripts/ScriptUI Panels/AESubMaster/
   ```

   > ⚠️ **Penting:** Yang perlu dikopi adalah **seluruh folder `AESubMaster/`**, bukan hanya file `AESubMaster.jsx`-nya saja. Modul `lib/` dan `ui/` harus ada di dalam folder yang sama.

2. **Restart After Effects.**

3. Buka dari menu **Window > AESubMaster**. Panel bisa di-dock seperti panel bawaan AE.

---

## Cara Pakai

### Alur Kerja Normal

1. **Siapkan Template Layer**
   - Buka composition yang ingin diberi subtitle.
   - Buat/desain **satu text layer** sebagai template: isi teks contoh, tambahkan animasi In/Out dari preset (misal Mr. Horse), atur posisi, ukuran, font sesuai keinginan.

2. **Buka Panel**
   - Menu **Window > AESubMaster**.
   - Pilih composition dari dropdown **Comp** (default: comp yang aktif).

3. **Pilih Template Layer**
   - Pilih layer template dari dropdown **Layer**.
   - Klik **↻** di sebelah dropdown jika layer baru tidak muncul.

4. **Pilih File SRT**
   - Klik **Browse...** → pilih file `.srt`.

5. **Atur Opsi**
   - ✅ **Sync Marker Out** — geser marker animasi Out (misal `trOut`) agar sinkron dengan timing setiap subtitle. *Direkomendasikan aktif jika pakai preset seperti Mr. Horse.*
   - ✅ **Auto-Adjust Comp Length** — panjangkan durasi comp otomatis jika subtitle terakhir melebihi durasi comp saat ini.

6. **Generate**
   - Klik **▶ Generate Subtitles**.
   - Plugin akan menduplikasi template untuk setiap entry SRT, menyesuaikan teks dan timing.
   - Layer template asli otomatis disembunyikan (visibility off).
   - Hasil dan peringatan tampil di area log.

7. **Cek Log**
   - `✔ N layer berhasil dibuat` — sukses.
   - `⚠ Overlap waktu: #X, #Y` — subtitle yang waktunya tumpang tindih, perlu disesuaikan manual di timeline.
   - `⚠ Durasi subtitle < animasi Out: #Z` — subtitle terlalu pendek untuk animasi Out selesai — perlu dicek manual.

8. **Undo**
   - Satu kali **Ctrl+Z** membatalkan seluruh proses generate (satu undo group).

---

### Re-import / Update SRT

Jika file SRT direvisi dan perlu diperbarui:

1. Pastikan template layer & file SRT sudah dipilih.
2. Klik **↺ Re-import / Replace**.
3. Plugin akan **menghapus semua layer hasil generate sebelumnya** (dikenali dari tag internal), lalu generate ulang dari file SRT baru.
4. Layer lain milik user yang tidak terkait tidak akan tersentuh.

---

### Simpan / Load Template (.ffx)

Untuk menggunakan template yang sama di project atau mesin AE lain:

- **Save as .ffx** — export style + animasi template layer ke file `.ffx` portable.
- **Load .ffx** — import file `.ffx` tersimpan sebagai template baru di comp aktif.
- **Quick Load** — muat ulang file `.ffx` terakhir yang dipakai (jalan bahkan setelah AE restart).

---

## Marker yang Dikenali untuk "Sync Marker Out"

Plugin mendeteksi marker animasi Out berdasarkan **nama/comment marker** berikut:

| Nama Marker | Preset / Sumber |
|-------------|----------------|
| `trOut`     | Mr. Horse / Motion Bro (paling umum) |
| `outAnim`   | Preset manual |
| `OUT`       | Preset custom uppercase |
| `out`       | Preset custom lowercase |
| `animOut`   | Variasi lain |

Jika preset yang kamu pakai menggunakan nama marker lain, buka file `lib/markerSync.jsx` dan tambahkan nama marker ke array `KNOWN_OUT_MARKERS`.

---

## Limitasi (yang Tidak Bisa Ditangani Otomatis)

1. **Rich text (multi-style dalam satu layer):** Jika template punya 2 warna/ukuran berbeda dalam satu text layer, hanya gaya karakter pertama yang terbawa ke semua subtitle. Variasi gaya dalam satu baris tidak bisa dipertahankan otomatis.

2. **Data internal preset di luar marker/expression standar:** Jika preset menyimpan parameter di luar marker atau expression AE standar (data binari khusus), plugin tidak bisa membaca/mengubahnya.

3. **Auto-wrap teks panjang (Point Text):** Jika template adalah *Point Text* (bukan *Paragraph/Box Text*), teks SRT yang panjang bisa meluber keluar frame. **Solusi: gunakan Paragraph Text (Box Text) untuk template.**

4. **Skala besar (ratusan–ribuan baris):** Jumlah layer yang sangat banyak bisa membuat AE berjalan lambat atau tidak responsif. Tidak ada auto-precompose di versi ini — ini catatan risiko yang perlu dipantau.

5. **Overlap & konflik durasi:** Plugin tidak mengubah timing secara otomatis — hanya mencatat di log. Penyesuaian manual di timeline tetap diperlukan untuk kasus ini.

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Panel tidak muncul di menu Window | Pastikan folder `AESubMaster/` (bukan hanya `AESubMaster.jsx`) ada di folder `ScriptUI Panels`. Restart AE. |
| Dropdown layer kosong | Pastikan comp terpilih sudah punya text layer. Klik ↻ untuk refresh. |
| Tombol Generate tidak aktif | Pilih template layer DAN file SRT dulu. |
| Marker Out tidak tergeser | Cek nama marker di preset kamu, tambahkan ke `KNOWN_OUT_MARKERS` di `lib/markerSync.jsx` jika belum ada. |
| Error "saveAsAnimationPreset is not a function" | Fitur ini butuh versi AE yang mendukung `layer.saveAsAnimationPreset()`. Coba update AE ke versi lebih baru. |
| Teks SRT tidak muncul/terpotong | Gunakan Paragraph Text (Box Text) untuk template layer, bukan Point Text. |
| Error tidak diketahui / terjadi crash | Klik tombol **Debug Log 📄** di panel untuk membuka file `debug.log` di text editor, atau cek konsol ExtendScript. |

---

## Log & Diagnostik Error

Plugin dilengkapi dengan sistem logging diagnostik otomatis:
- **UI Log:** Menampilkan pesan status & peringatan ringkas secara real-time di bagian bawah panel.
- **Debug Log File:** Menyimpan log terperinci di `<userData>/AESubMaster/debug.log` (termasuk timestamp, nama modul, level error, dan stack trace exception jika ada).
- Klik tombol **Debug Log 📄** di samping label *Status:* untuk langsung membuka file log tersebut di text editor OS.

---

## Struktur File

```
AESubMaster/
├── AESubMaster.jsx      ← Entry point (ini yang dikopi ke ScriptUI Panels)
├── lib/
│   ├── logger.jsx       ← Sistem logging diagnostik & penulisan file debug.log
│   ├── timeUtils.jsx    ← Konversi timecode SRT ↔ detik
│   ├── srtParser.jsx    ← Parser file .srt
│   ├── layerDuplicator.jsx  ← Duplikasi layer + injeksi teks
│   ├── markerSync.jsx   ← Sync marker animasi Out
│   ├── presetIO.jsx     ← Export/import .ffx
│   └── prefs.jsx        ← Preferensi plugin
├── ui/
│   └── panel.jsx        ← UI ScriptUI panel
└── docs/
    ├── Brief_Plugin_SRT_Importer_AE.md
    └── design.md
```
