/**
 * AESubMaster — srtEditorWindow.jsx
 * 
 * Pop-up window khusus untuk mengedit subtitle SRT (teks & timing)
 * mirip dengan panel Captions di Premiere Pro, tanpa mengganggu panel utama.
 * 
 * Kompatibel dengan ExtendScript (ES3).
 */

function openSrtEditor(srtFilePath, onSavedCallback) {
    if (!srtFilePath || srtFilePath === "") {
        alert("Please select an SRT file in the main panel first.");
        return;
    }

    var srtFile = new File(srtFilePath);
    if (!srtFile.exists) {
        alert("SRT file not found: " + srtFilePath);
        return;
    }

    // Parse SRT
    var parseResult = SrtParser.parseSRT(srtFile);
    if (!parseResult.success) {
        alert("Failed to read SRT: " + parseResult.error);
        return;
    }

    var entries = parseResult.entries;

    // ── Build Window ─────────────────────────────────────────────────────────
    var win = new Window("palette", "Subtitle Editor — " + srtFile.name, undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = 10;
    win.preferredSize = [520, 540];

    // ── Header & Info ────────────────────────────────────────────────────────
    var grpHeader = win.add("group");
    grpHeader.orientation = "row";
    grpHeader.alignChildren = ["fill", "center"];
    grpHeader.spacing = 6;

    var lblTitle = grpHeader.add("statictext", undefined, "📝 SRT Subtitle Editor");
    try { lblTitle.graphics.font = ScriptUI.newFont("dialog", "BOLD", 13); } catch (ignore) {}

    var lblCount = grpHeader.add("statictext", undefined, "(" + entries.length + " lines)");
    lblCount.alignment = ["right", "center"];

    // ── Search Bar ───────────────────────────────────────────────────────────
    var grpSearch = win.add("group");
    grpSearch.orientation = "row";
    grpSearch.alignChildren = ["fill", "center"];
    grpSearch.spacing = 6;

    grpSearch.add("statictext", undefined, "Search:");
    var txtSearch = grpSearch.add("edittext", undefined, "");
    txtSearch.alignment = ["fill", "center"];
    txtSearch.helpTip = "Type text to filter subtitle list";

    // ── ListBox (Premiere Pro Captions Style) ────────────────────────────────
    var lstEntries = win.add("listbox", undefined, [], {
        numberOfColumns: 4,
        showHeaders: true,
        columnTitles: ["#", "In Point", "Out Point", "Subtitle Text"],
        columnWidths: [35, 95, 95, 260]
    });
    lstEntries.alignment = ["fill", "fill"];
    lstEntries.preferredSize.height = 200;

    /** Reload isi ListBox dari array entries */
    function populateList(filterText) {
        lstEntries.removeAll();
        var search = filterText ? filterText.toLowerCase() : "";

        for (var i = 0; i < entries.length; i++) {
            var item = entries[i];
            var txtSingle = item.text.replace(/\r/g, " ").replace(/\n/g, " ");

            if (search !== "" && txtSingle.toLowerCase().indexOf(search) === -1) {
                continue; // Skip yang tidak cocok dengan pencarian
            }

            var row = lstEntries.add("item", (i + 1).toString());
            row.subItems[0].text = TimeUtils.secondsToSrtTime(item.startSeconds);
            row.subItems[1].text = TimeUtils.secondsToSrtTime(item.endSeconds);
            row.subItems[2].text = txtSingle;
            row.entryIndex = i; // Simpan index asli
        }
        lblCount.text = "(" + entries.length + " lines)";
    }

    populateList("");

    txtSearch.onChanging = function () {
        populateList(txtSearch.text);
    };

    // ── Detail Editor Box (Bawah ListBox) ────────────────────────────────────
    var grpDetail = win.add("panel", undefined, "Edit Selected Line");
    grpDetail.alignment = ["fill", "top"];
    grpDetail.orientation = "column";
    grpDetail.alignChildren = ["fill", "top"];
    grpDetail.spacing = 6;
    grpDetail.margins = [8, 12, 8, 8];

    // Row Timecode Start & End
    var grpTimes = grpDetail.add("group");
    grpTimes.orientation = "row";
    grpTimes.alignChildren = ["left", "center"];
    grpTimes.spacing = 6;

    grpTimes.add("statictext", undefined, "In:");
    var txtStart = grpTimes.add("edittext", undefined, "00:00:00,000");
    txtStart.preferredSize.width = 100;

    grpTimes.add("statictext", undefined, "Out:");
    var txtEnd = grpTimes.add("edittext", undefined, "00:00:00,000");
    txtEnd.preferredSize.width = 100;

    var lblDuration = grpTimes.add("statictext", undefined, "Duration: 0.0s");
    lblDuration.alignment = ["fill", "center"];

    // Row Subtitle Text (Multiline)
    var grpText = grpDetail.add("group");
    grpText.orientation = "column";
    grpText.alignChildren = ["fill", "top"];
    grpText.spacing = 2;

    grpText.add("statictext", undefined, "Subtitle Text:");
    var txtContent = grpText.add("edittext", undefined, "", { multiline: true, scrolling: true });
    txtContent.alignment = ["fill", "top"];
    txtContent.preferredSize.height = 55;

    var btnUpdateLine = grpDetail.add("button", undefined, "✓ Update Line");
    btnUpdateLine.alignment = ["right", "top"];
    btnUpdateLine.preferredSize = [130, 22];

    var selectedEntryIndex = -1;

    /** Buka data entry ke form edit saat baris dipilih */
    lstEntries.onChange = function () {
        if (!lstEntries.selection) { return; }
        var row = lstEntries.selection;
        var idx = row.entryIndex;
        if (typeof idx !== "number" || idx < 0 || idx >= entries.length) { return; }

        selectedEntryIndex = idx;
        var entry = entries[idx];

        txtStart.text   = TimeUtils.secondsToSrtTime(entry.startSeconds);
        txtEnd.text     = TimeUtils.secondsToSrtTime(entry.endSeconds);
        txtContent.text = entry.text;

        var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
        lblDuration.text = "Duration: " + dur + "s";
    };

    /** Update entry terpilih dari input form */
    btnUpdateLine.onClick = function () {
        if (selectedEntryIndex < 0 || selectedEntryIndex >= entries.length) {
            alert("Please select a subtitle line in the table first.");
            return;
        }

        var newStart = TimeUtils.srtTimeToSeconds(txtStart.text);
        var newEnd   = TimeUtils.srtTimeToSeconds(txtEnd.text);

        if (newEnd <= newStart) {
            alert("Out time must be greater than In time.");
            return;
        }

        var entry = entries[selectedEntryIndex];
        entry.startSeconds = newStart;
        entry.endSeconds   = newEnd;
        entry.text         = txtContent.text;

        populateList(txtSearch.text);

        // Pertahankan seleksi
        for (var k = 0; k < lstEntries.items.length; k++) {
            if (lstEntries.items[k].entryIndex === selectedEntryIndex) {
                lstEntries.selection = k;
                break;
            }
        }
    };

    // ── Tombol Aksi Tambah / Hapus / Simpan ──────────────────────────────────
    var grpActions = win.add("group");
    grpActions.orientation = "row";
    grpActions.alignChildren = ["fill", "center"];
    grpActions.spacing = 6;
    grpActions.margins = [0, 4, 0, 0];

    var btnAdd = grpActions.add("button", undefined, "+ Add Line");
    btnAdd.preferredSize = [110, 24];

    var btnDelete = grpActions.add("button", undefined, "- Delete Line");
    btnDelete.preferredSize = [110, 24];

    var btnSave = grpActions.add("button", undefined, "💾 Save to File");
    btnSave.alignment = ["fill", "center"];
    btnSave.preferredSize.height = 24;

    var btnApply = grpActions.add("button", undefined, "✔ Save & Apply");
    btnApply.alignment = ["fill", "center"];
    btnApply.preferredSize.height = 24;

    // Tambah baris subtitle baru
    btnAdd.onClick = function () {
        var lastEnd = 0;
        if (entries.length > 0) {
            lastEnd = entries[entries.length - 1].endSeconds + 0.5;
        }

        var newEntry = {
            index:        entries.length + 1,
            startSeconds: lastEnd,
            endSeconds:   lastEnd + 2.5,
            text:         "New Subtitle"
        };

        entries.push(newEntry);
        populateList(txtSearch.text);
        lstEntries.selection = lstEntries.items.length - 1;
    };

    // Hapus baris subtitle
    btnDelete.onClick = function () {
        if (selectedEntryIndex < 0 || selectedEntryIndex >= entries.length) {
            alert("Please select a subtitle line to delete.");
            return;
        }

        entries.splice(selectedEntryIndex, 1);
        selectedEntryIndex = -1;
        txtContent.text = "";
        populateList(txtSearch.text);
    };

    // Simpan ke file disk
    btnSave.onClick = function () {
        var res = SrtWriter.writeSRT(srtFile, entries);
        if (res.success) {
            alert("SRT file saved successfully!");
        } else {
            alert("Failed to save SRT: " + res.error);
        }
    };

    // Simpan ke file disk dan kabari panel utama
    btnApply.onClick = function () {
        var res = SrtWriter.writeSRT(srtFile, entries);
        if (res.success) {
            if (typeof onSavedCallback === "function") {
                onSavedCallback(srtFile.fsName);
            }
            win.close();
        } else {
            alert("Failed to save SRT: " + res.error);
        }
    };

    win.onResizing = win.onResize = function () {
        win.layout.resize();
    };

    win.layout.layout(true);
    win.show();
}
