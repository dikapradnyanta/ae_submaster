/**
 * AESubMaster — panel.jsx
 * 
 * Membangun ScriptUI panel sesuai design.md — hierarki A → F:
 *   A. Header
 *   B. Target Composition & Template Layer
 *   C. Input File SRT
 *   D. Opsi Eksekusi
 *   E. Tombol Generate & Re-import
 *   F. Log & Status
 * 
 * Membutuhkan semua modul lib/ sudah di-#include sebelum file ini.
 * Kompatibel dengan ExtendScript (ES3).
 */

/**
 * Bangun dan return panel AESubMaster.
 * 
 * @param  {Window|Panel} thisObj   Konteks dari AESubMaster.jsx (bisa Panel atau Window)
 * @return {Window|Panel}
 */
function buildPanel(thisObj) {

    // ═══════════════════════════════════════════════════════════════════════════
    // KONSTANTA & STATE
    // ═══════════════════════════════════════════════════════════════════════════

    var PANEL_TITLE    = "AESubMaster";
    var PANEL_SUBTITLE = "SRT to Template Layer";

    /** State aktif panel — diperbarui saat user berinteraksi */
    var state = {
        selectedComp:          null,   // CompItem terpilih
        templateLayer:         null,   // Layer template terpilih
        templateLayerIndex:    -1,     // Index layer template di comp (untuk re-validasi)
        srtFilePath:           "",     // Path file SRT terpilih
        templateLayerName:     "",     // Nama layer template (untuk display)
        lastFfxPath:           ""      // Path .ffx terakhir (dari prefs)
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Tulis pesan ke log area dan ke sistem Logger.
     * @param {String} msg
     */
    var lastLogText = "";

    function log(msg) {
        try {
            var current = logArea.text;
            var updated = (current && current.length > 0) ? (current + "\n" + msg) : msg;
            lastLogText = updated;
            logArea.text = updated;
            try { logArea.scrollTo(0, 99999); } catch (ignore) {}

            // Mirror to Logger
            if (msg.indexOf("[ERROR]") !== -1 || msg.indexOf("✖") !== -1) {
                Logger.error("ui", msg);
            } else if (msg.indexOf("[WARN]") !== -1 || msg.indexOf("⚠") !== -1) {
                Logger.warn("ui", msg);
            } else {
                Logger.info("ui", msg);
            }
        } catch (e) {}
    }

    /** Bersihkan log area */
    function clearLog() {
        try {
            lastLogText = "";
            logArea.text = "";
        } catch (ignore) {}
    }

    /**
     * Update label status di atas log area.
     * @param {String} msg    Teks status
     * @param {String} type   "ready" | "processing" | "done" | "error"
     */
    function setStatus(msg, type) {
        try {
            statusLabel.text = msg;
        } catch (ignore) {}
    }

    /**
     * Enable/disable tombol Generate dan Re-import berdasarkan state.
     * Tombol aktif hanya jika template layer DAN file SRT sudah dipilih.
     */
    function updateButtonState() {
        var ready = (state.templateLayer !== null && state.srtFilePath !== "");
        try {
            btnGenerate.enabled = ready;
            btnReimport.enabled = ready;
            btnEditSrt.enabled  = (state.srtFilePath !== "");
        } catch (ignore) {}
    }

    /**
     * Ambil daftar semua CompItem yang ada di project saat ini.
     * @return {Array} Array of CompItem
     */
    function getAllComps() {
        var comps = [];
        if (!app.project) { return comps; }

        for (var i = 1; i <= app.project.items.length; i++) {
            try {
                var item = app.project.items[i];
                if (item instanceof CompItem) {
                    comps.push(item);
                }
            } catch (ignore) {}
        }
        return comps;
    }

    /**
     * Ambil daftar text layer dari sebuah CompItem.
     * @param  {CompItem} comp
     * @return {Array}    Array of { name: String, index: Number, layer: Layer }
     */
    function getTextLayers(comp) {
        var layers = [];
        if (!comp || !comp.layers) { return layers; }

        for (var i = 1; i <= comp.layers.length; i++) {
            try {
                var layer = comp.layers[i];
                // Cek apakah text layer dengan mencoba akses "Source Text"
                if (layer.property("Source Text")) {
                    layers.push({ name: layer.name, index: i, layer: layer });
                }
            } catch (ignore) {}
        }
        return layers;
    }

    /**
     * Populate dropdown komposis dari project.
     */
    function refreshCompDropdown() {
        try {
            ddComp.removeAll();
            var comps = getAllComps();

            if (comps.length === 0) {
                ddComp.add("item", "(tidak ada comp)");
                ddComp.enabled = false;
                return;
            }

            ddComp.enabled = true;
            var activeIndex = 0;

            for (var i = 0; i < comps.length; i++) {
                ddComp.add("item", comps[i].name);
                // Default ke comp aktif (yang sedang dibuka di viewer)
                if (app.project.activeItem instanceof CompItem &&
                    comps[i] === app.project.activeItem) {
                    activeIndex = i;
                }
            }

            ddComp.selection = activeIndex;
            // Trigger update state
            onCompSelected();
        } catch (e) {
            log("⚠ Gagal memuat daftar composition: " + e.toString());
        }
    }

    /**
     * Populate dropdown layer dari comp yang dipilih.
     * Otomatis memilih layer yang sedang aktif/dipilih di timeline After Effects.
     */
    function refreshLayerDropdown() {
        try {
            ddLayer.removeAll();
            state.templateLayer = null;
            updateButtonState();

            if (!state.selectedComp) {
                ddLayer.add("item", "(pilih comp dulu)");
                ddLayer.enabled = false;
                return;
            }

            var textLayers = getTextLayers(state.selectedComp);

            if (textLayers.length === 0) {
                ddLayer.add("item", "(tidak ada text layer)");
                ddLayer.enabled = false;
                return;
            }

            ddLayer.enabled = true;

            // Deteksi layer yang sedang dipilih user di timeline AE
            var targetIndex = 0;
            try {
                var selLayers = state.selectedComp.selectedLayers;
                if (selLayers && selLayers.length > 0) {
                    var firstSelected = selLayers[0];
                    for (var s = 0; s < textLayers.length; s++) {
                        if (textLayers[s].index === firstSelected.index || textLayers[s].layer === firstSelected) {
                            targetIndex = s;
                            break;
                        }
                    }
                }
            } catch (ignore) {}

            for (var i = 0; i < textLayers.length; i++) {
                ddLayer.add("item", textLayers[i].name);
            }
            ddLayer.selection = targetIndex;
            onLayerSelected();
        } catch (e) {
            log("⚠ Gagal memuat daftar layer: " + e.toString());
        }
    }

    /**
     * Sinkronisasi otomatis Composition & Layer aktif dari After Effects ke panel.
     */
    function syncActiveCompAndLayer() {
        try {
            if (app.project && app.project.activeItem instanceof CompItem) {
                var activeComp = app.project.activeItem;
                var comps = getAllComps();
                for (var c = 0; c < comps.length; c++) {
                    if (comps[c] === activeComp) {
                        ddComp.selection = c;
                        state.selectedComp = activeComp;
                        break;
                    }
                }
            }
            refreshLayerDropdown();
        } catch (ignore) {}
    }

    /**
     * Handler saat comp dropdown berubah.
     */
    function onCompSelected() {
        try {
            var comps = getAllComps();
            var idx   = ddComp.selection ? ddComp.selection.index : 0;
            if (idx >= 0 && idx < comps.length) {
                state.selectedComp = comps[idx];
            } else {
                state.selectedComp = null;
            }
            refreshLayerDropdown();
        } catch (e) {
            log("⚠ Error saat memilih comp: " + e.toString());
        }
    }

    /**
     * Handler saat layer dropdown berubah.
     */
    function onLayerSelected() {
        try {
            if (!state.selectedComp || !ddLayer.selection) {
                state.templateLayer = null;
                state.templateLayerName = "";
                updateButtonState();
                return;
            }

            var textLayers = getTextLayers(state.selectedComp);
            var idx        = ddLayer.selection.index;

            if (idx >= 0 && idx < textLayers.length) {
                state.templateLayer      = textLayers[idx].layer;
                state.templateLayerIndex = textLayers[idx].index;
                state.templateLayerName  = textLayers[idx].name;
            } else {
                state.templateLayer     = null;
                state.templateLayerName = "";
            }
            updateButtonState();
        } catch (e) {
            log("⚠ Error saat memilih layer: " + e.toString());
        }
    }

    /**
     * Proses utama: generate subtitle layers dari SRT.
     * Dipanggil oleh tombol Generate dan Re-import.
     * 
     * @param {Boolean} isReimport   Jika true, hapus layer lama sebelum generate.
     */
    function runGenerate(isReimport) {
        clearLog();
        setStatus("Processing...", "processing");

        // ── State Validation ─────────────────────────────────────────────────
        if (!state.selectedComp) {
            log("[ERROR] No composition selected.");
            setStatus("Error", "error");
            return;
        }

        if (!state.templateLayer) {
            log("[ERROR] No template layer selected.");
            setStatus("Error", "error");
            return;
        }

        if (!state.srtFilePath || state.srtFilePath === "") {
            log("[ERROR] No SRT file selected.");
            setStatus("Error", "error");
            return;
        }

        // ── SRT File Validation ──────────────────────────────────────────────
        var srtFile = new File(state.srtFilePath);
        if (!srtFile.exists) {
            log("[ERROR] SRT file not found: " + state.srtFilePath);
            setStatus("Error", "error");
            return;
        }

        if (!/\.srt$/i.test(srtFile.name)) {
            log("[ERROR] Selected file is not an .srt file: " + srtFile.name);
            setStatus("Error", "error");
            return;
        }

        // ── Parse SRT ────────────────────────────────────────────────────────
        var parseResult;
        try {
            parseResult = SrtParser.parseSRT(srtFile);
        } catch (e) {
            log("[ERROR] Failed to read SRT file: " + e.toString());
            setStatus("Error", "error");
            return;
        }

        if (!parseResult.success) {
            log("[ERROR] Invalid SRT file: " + parseResult.error);
            setStatus("Error", "error");
            return;
        }

        for (var w = 0; w < parseResult.warnings.length; w++) {
            log("[WARN] " + parseResult.warnings[w]);
        }

        var entries = parseResult.entries;
        if (entries.length === 0) {
            log("[WARN] No valid subtitle entries found in SRT file.");
            setStatus("Done (0 layers)", "done");
            return;
        }

        log("[INFO] " + entries.length + " subtitle entries found.");

        // ── Overlap Detection ────────────────────────────────────────────────
        var overlaps = MarkerSync.detectOverlaps(entries);

        var doSyncMarker      = chkSyncMarker.value;
        var doAutoAdjustComp  = chkAutoAdjustComp.value;

        var templateStartTime = state.templateLayer.startTime;
        var templateOutPoint  = state.templateLayer.outPoint;

        // ── Undo Group ───────────────────────────────────────────────────────
        app.beginUndoGroup(isReimport ? "AESubMaster: Re-import Subtitles" : "AESubMaster: Generate Subtitles");

        if (isReimport) {
            try {
                var removeResult = LayerDuplicator.removeGeneratedLayers(state.selectedComp, state.templateLayer);
                if (removeResult.success) {
                    log("[SUCCESS] " + removeResult.removedCount + " previous layers removed.");
                } else {
                    log("[WARN] Failed to remove previous layers: " + removeResult.error);
                }
            } catch (e) {
                log("[WARN] Error removing previous layers: " + e.toString());
            }
        }

        var createdCount       = 0;
        var durationConflicts  = [];

        try {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];

                var dupResult = LayerDuplicator.duplicateAsSubtitle(
                    state.templateLayer,
                    entry,
                    {}
                );

                if (!dupResult.success) {
                    log("[WARN] Entry #" + entry.index + ": failed to create — " + dupResult.error);
                    continue;
                }

                createdCount++;

                if (doSyncMarker) {
                    try {
                        var syncResult = MarkerSync.syncOutMarker(
                            dupResult.layer,
                            templateStartTime,
                            templateOutPoint,
                            entry.startSeconds,
                            entry.endSeconds,
                            MarkerSync.KNOWN_OUT_MARKERS
                        );

                        if (syncResult.conflict) {
                            durationConflicts.push(entry.index);
                        }
                    } catch (syncErr) {
                        log("[WARN] Entry #" + entry.index + ": marker sync error — " + syncErr.toString());
                    }
                }
            }

            // ── Auto-Adjust Comp Length ──────────────────────────────────────
            if (doAutoAdjustComp && entries.length > 0) {
                try {
                    var lastEntry    = entries[entries.length - 1];
                    var currentDuration = state.selectedComp.duration;
                    if (lastEntry.endSeconds > currentDuration) {
                        state.selectedComp.duration = lastEntry.endSeconds;
                        log("[INFO] Comp duration extended to " + TimeUtils.secondsToSrtTime(lastEntry.endSeconds) + ".");
                    }
                } catch (compErr) {
                    log("[WARN] Failed to adjust comp duration: " + compErr.toString());
                }
            }

            // ── Hide template layer ──────────────────────────────────────────
            try {
                LayerDuplicator.hideTemplateLayer(state.templateLayer);
                log("[INFO] Template layer \"" + state.templateLayerName + "\" hidden.");
            } catch (hideErr) {
                log("[WARN] Failed to hide template layer: " + hideErr.toString());
            }

        } catch (e) {
            log("[ERROR] Error during generate: " + e.toString());
        } finally {
            app.endUndoGroup();
        }

        // ── Summary Report ───────────────────────────────────────────────────
        log("─────────────────────────────");
        log("[SUCCESS] " + createdCount + " layers created from template.");

        if (parseResult.warnings.length > 0) {
            log("[WARN] " + parseResult.warnings.length + " SRT entries skipped (corrupted format).");
        }

        if (overlaps.length > 0) {
            var overlapNums = [];
            for (var oi = 0; oi < overlaps.length; oi++) {
                overlapNums.push(overlaps[oi].description);
            }
            log("[WARN] Time overlap detected: " + overlapNums.join(", "));
        }

        if (durationConflicts.length > 0) {
            log("[WARN] Subtitle duration < Out animation — check manually: #" + durationConflicts.join(", #"));
        }

        if (overlaps.length === 0 && durationConflicts.length === 0 && parseResult.warnings.length === 0) {
            log("[SUCCESS] No issues detected.");
        }

        var statusMsg = "Done (" + createdCount + " layers)";
        setStatus(statusMsg, "done");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD UI
    // ═══════════════════════════════════════════════════════════════════════════

    var panel = (thisObj instanceof Panel) ? thisObj : new Window("palette", PANEL_TITLE, undefined, { resizeable: true });
    panel.orientation = "column";
    panel.alignChildren = ["fill", "fill"];
    panel.spacing = 2;
    panel.margins = 4;
    panel.preferredSize = [380, 520];

    // ── TABBED PANEL (Generator | Subtitle Editor) ───────────────────────────
    var tabGroup = panel.add("tabbedpanel");
    tabGroup.alignment = ["fill", "fill"];
    tabGroup.alignChildren = ["fill", "fill"];

    // ── TAB 1: GENERATOR ─────────────────────────────────────────────────────
    var tabGen = tabGroup.add("tab", undefined, "Generator");
    tabGen.orientation = "column";
    tabGen.alignChildren = ["fill", "top"];
    tabGen.spacing = 6;
    tabGen.margins = 6;

    // ── TAB 2: SUBTITLE EDITOR ───────────────────────────────────────────────
    var tabEdit = tabGroup.add("tab", undefined, "Subtitle Editor");
    tabEdit.orientation = "column";
    tabEdit.alignChildren = ["fill", "fill"];
    tabEdit.spacing = 6;
    tabEdit.margins = 6;

    tabGroup.selection = tabGen;

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 1: GENERATOR CONTROLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ── B. TARGET & TEMPLATE LAYER ────────────────────────────────────────────
    var grpB = tabGen.add("group");
    grpB.alignment = ["fill", "top"];
    grpB.orientation = "column";
    grpB.alignChildren = ["fill", "top"];
    grpB.spacing = 4;
    grpB.margins = [0, 4, 0, 4];

    var lblSecB = grpB.add("statictext", undefined, "TARGET & TEMPLATE LAYER");
    lblSecB.alignment = ["fill", "top"];
    try { lblSecB.graphics.font = ScriptUI.newFont("dialog", "BOLD", 11); } catch (ignore) {}

    // Dropdown comp + refresh button
    var grpCompRow = grpB.add("group");
    grpCompRow.alignment = ["fill", "top"];
    grpCompRow.orientation = "row";
    grpCompRow.alignChildren = ["left", "center"];
    grpCompRow.spacing = 6;
    grpCompRow.margins = [4, 4, 4, 4];

    var lblComp = grpCompRow.add("statictext", undefined, "Comp:");
    lblComp.preferredSize.width = 40;
    lblComp.alignment = ["left", "center"];

    var ddComp = grpCompRow.add("dropdownlist", undefined, []);
    ddComp.alignment = ["fill", "center"];

    var btnRefreshComp = grpCompRow.add("button", undefined, "↻");
    btnRefreshComp.preferredSize = [26, 22];
    btnRefreshComp.alignment = ["right", "center"];
    btnRefreshComp.helpTip = "Reload / sync active composition & layer list";

    // Dropdown layer + refresh button
    var grpLayerRow = grpB.add("group");
    grpLayerRow.alignment = ["fill", "top"];
    grpLayerRow.orientation = "row";
    grpLayerRow.alignChildren = ["left", "center"];
    grpLayerRow.spacing = 6;
    grpLayerRow.margins = [4, 4, 4, 4];

    var lblLayer = grpLayerRow.add("statictext", undefined, "Layer:");
    lblLayer.preferredSize.width = 40;
    lblLayer.alignment = ["left", "center"];

    var ddLayer = grpLayerRow.add("dropdownlist", undefined, []);
    ddLayer.alignment = ["fill", "center"];

    var btnRefreshLayer = grpLayerRow.add("button", undefined, "↻");
    btnRefreshLayer.preferredSize = [26, 22];
    btnRefreshLayer.alignment = ["right", "center"];
    btnRefreshLayer.helpTip = "Reload / sync selected layer from AE timeline";

    // FFX buttons row
    var grpFfxRow = grpB.add("group");
    grpFfxRow.alignment = ["fill", "top"];
    grpFfxRow.orientation = "row";
    grpFfxRow.alignChildren = ["fill", "center"];
    grpFfxRow.spacing = 6;
    grpFfxRow.margins = [4, 4, 4, 4];

    var btnSaveFFX = grpFfxRow.add("button", undefined, "Save as .ffx");
    btnSaveFFX.alignment = ["fill", "center"];
    btnSaveFFX.preferredSize.height = 22;
    btnSaveFFX.helpTip = "Export template layer style & animation to a .ffx file";

    var btnLoadFFX = grpFfxRow.add("button", undefined, "Load .ffx");
    btnLoadFFX.alignment = ["fill", "center"];
    btnLoadFFX.preferredSize.height = 22;
    btnLoadFFX.helpTip = "Import a saved .ffx file as a new template layer in active comp";

    // Quick Load Last
    var grpQuickLoad = grpB.add("group");
    grpQuickLoad.alignment = ["fill", "top"];
    grpQuickLoad.orientation = "row";
    grpQuickLoad.alignChildren = ["fill", "center"];
    grpQuickLoad.spacing = 6;
    grpQuickLoad.margins = [4, 4, 4, 4];

    var lblLastFFX = grpQuickLoad.add("statictext", undefined, "Last: (none)");
    lblLastFFX.alignment = ["fill", "center"];
    lblLastFFX.helpTip = "Path of the last used .ffx file";

    var btnQuickLoad = grpQuickLoad.add("button", undefined, "Quick Load");
    btnQuickLoad.preferredSize = [80, 22];
    btnQuickLoad.alignment = ["right", "center"];
    btnQuickLoad.enabled = false;
    btnQuickLoad.helpTip = "Reload the last used .ffx file";

    // Divider
    var dividerB = tabGen.add("panel", undefined, undefined);
    dividerB.alignment = ["fill", "top"];
    dividerB.preferredSize.height = 1;

    // ── C. INPUT FILE SRT ─────────────────────────────────────────────────────
    var grpC = tabGen.add("group");
    grpC.alignment = ["fill", "top"];
    grpC.orientation = "column";
    grpC.alignChildren = ["fill", "top"];
    grpC.spacing = 4;
    grpC.margins = [0, 4, 0, 4];

    var lblSecC = grpC.add("statictext", undefined, "SUBTITLE FILE (SRT)");
    lblSecC.alignment = ["fill", "top"];
    try { lblSecC.graphics.font = ScriptUI.newFont("dialog", "BOLD", 11); } catch (ignore) {}

    var grpSrtRow = grpC.add("group");
    grpSrtRow.alignment = ["fill", "top"];
    grpSrtRow.orientation = "row";
    grpSrtRow.alignChildren = ["fill", "center"];
    grpSrtRow.spacing = 6;
    grpSrtRow.margins = [4, 4, 4, 4];

    var txtSrtPath = grpSrtRow.add("edittext", undefined, "");
    txtSrtPath.alignment = ["fill", "center"];
    txtSrtPath.enabled = false;
    txtSrtPath.helpTip = "Selected SRT file path";

    var btnBrowse = grpSrtRow.add("button", undefined, "Browse...");
    btnBrowse.preferredSize = [75, 22];
    btnBrowse.alignment = ["right", "center"];
    btnBrowse.helpTip = "Select a .srt file from your computer";

    // Divider
    var dividerC = tabGen.add("panel", undefined, undefined);
    dividerC.alignment = ["fill", "top"];
    dividerC.preferredSize.height = 1;

    // ── F. LOG & STATUS ───────────────────────────────────────────────────────
    var grpF = tabGen.add("group");
    grpF.alignment = ["fill", "fill"];
    grpF.orientation = "column";
    grpF.alignChildren = ["fill", "top"];
    grpF.spacing = 2;
    grpF.margins = [0, 4, 0, 0];

    var grpStatus = grpF.add("group");
    grpStatus.alignment = ["fill", "top"];
    grpStatus.orientation = "row";
    grpStatus.alignChildren = ["fill", "center"];
    grpStatus.spacing = 6;
    grpStatus.margins = [4, 4, 4, 4];

    grpStatus.add("statictext", undefined, "Status:");
    var statusLabel = grpStatus.add("statictext", undefined, "Ready");
    statusLabel.alignment = ["fill", "center"];

    var btnCopyLog = grpStatus.add("button", undefined, "Copy Log");
    btnCopyLog.preferredSize = [75, 20];
    btnCopyLog.alignment = ["right", "center"];
    btnCopyLog.helpTip = "Copy log text to clipboard";

    var btnOpenDebugLog = grpStatus.add("button", undefined, "Open Log");
    btnOpenDebugLog.preferredSize = [75, 20];
    btnOpenDebugLog.alignment = ["right", "center"];
    btnOpenDebugLog.helpTip = "Open log file in default text editor";

    var logArea = grpF.add("edittext", undefined, "", { multiline: true, scrolling: true });
    logArea.alignment = ["fill", "fill"];
    logArea.minimumSize.height = 35;
    logArea.preferredSize.height = 65;
    logArea.enabled = false;

    // Divider
    var dividerF = tabGen.add("panel", undefined, undefined);
    dividerF.alignment = ["fill", "top"];
    dividerF.preferredSize.height = 1;

    // ── D. OPTIONS ────────────────────────────────────────────────────────────
    var grpD = tabGen.add("group");
    grpD.alignment = ["fill", "top"];
    grpD.orientation = "column";
    grpD.alignChildren = ["fill", "top"];
    grpD.spacing = 3;
    grpD.margins = [0, 4, 0, 4];

    var lblSecD = grpD.add("statictext", undefined, "SYNCHRONIZATION OPTIONS");
    lblSecD.alignment = ["fill", "top"];
    try { lblSecD.graphics.font = ScriptUI.newFont("dialog", "BOLD", 11); } catch (ignore) {}

    var chkSyncMarker = grpD.add("checkbox", undefined, "Sync Marker Out (3rd-party presets, e.g. Mr. Horse)");
    chkSyncMarker.value = true;
    chkSyncMarker.alignment = ["fill", "top"];
    chkSyncMarker.helpTip = "Shift out-animation marker position proportionally with subtitle outPoint.\n" +
                             "Uncheck: marker stays unshifted, Out animation matches original template position.";

    var chkAutoAdjustComp = grpD.add("checkbox", undefined, "Auto-Adjust Comp Length");
    chkAutoAdjustComp.value = true;
    chkAutoAdjustComp.alignment = ["fill", "top"];
    chkAutoAdjustComp.helpTip = "Extend comp duration automatically if the last subtitle exceeds current comp duration.";

    // ── E. EXECUTION ──────────────────────────────────────────────────────────
    var grpE = tabGen.add("group");
    grpE.alignment = ["fill", "top"];
    grpE.orientation = "column";
    grpE.alignChildren = ["fill", "top"];
    grpE.spacing = 4;
    grpE.margins = [4, 4, 4, 4];

    var btnGenerate = grpE.add("button", undefined, "Generate Subtitles");
    btnGenerate.alignment = ["fill", "top"];
    btnGenerate.preferredSize.height = 28;
    btnGenerate.enabled = false;
    btnGenerate.helpTip = "Generate text layers from SRT file using the selected template.\n" +
                           "Enabled after selecting template layer & SRT file.";

    var btnReimport = grpE.add("button", undefined, "Re-import / Replace");
    btnReimport.alignment = ["fill", "top"];
    btnReimport.preferredSize.height = 24;
    btnReimport.enabled = false;
    btnReimport.helpTip = "Remove existing AESubMaster layers, then re-generate from SRT file.\n" +
                           "Other user layers will remain untouched.";

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 2: SUBTITLE EDITOR (ListBox Table + Detail Edit Box)
    // ═══════════════════════════════════════════════════════════════════════════

    var editorEntries = [];
    var edSelectedIndex = -1;

    // ── Search & Counter Row ──────────────────────────────────────────────────
    var grpEdSearch = tabEdit.add("group");
    grpEdSearch.alignment = ["fill", "top"];
    grpEdSearch.orientation = "row";
    grpEdSearch.alignChildren = ["left", "center"];
    grpEdSearch.spacing = 6;
    grpEdSearch.margins = [2, 2, 2, 2];

    grpEdSearch.add("statictext", undefined, "Search:");
    var txtEdSearch = grpEdSearch.add("edittext", undefined, "");
    txtEdSearch.alignment = ["fill", "center"];
    txtEdSearch.helpTip = "Type text to filter subtitle entries";

    var lblEdCount = grpEdSearch.add("statictext", undefined, "(0 entries)");
    lblEdCount.alignment = ["right", "center"];

    // ── Multi-column ListBox Subtitle Entries ─────────────────────────────────
    var lstEdEntries = tabEdit.add("listbox", undefined, [], {
        numberOfColumns: 4,
        showHeaders: true,
        columnTitles: ["#", "In Point", "Out Point", "Subtitle Text"],
        columnWidths: [30, 85, 85, 140]
    });
    lstEdEntries.alignment = ["fill", "fill"];
    lstEdEntries.preferredSize.height = 140;

    // ── Detail Edit Baris Panel ───────────────────────────────────────────────
    var grpEdDetail = tabEdit.add("panel", undefined, "SELECTED ENTRY DETAILS");
    grpEdDetail.alignment = ["fill", "top"];
    grpEdDetail.orientation = "column";
    grpEdDetail.alignChildren = ["fill", "top"];
    grpEdDetail.spacing = 4;
    grpEdDetail.margins = [8, 8, 8, 6];

    var grpEdTimes = grpEdDetail.add("group");
    grpEdTimes.alignment = ["fill", "top"];
    grpEdTimes.orientation = "row";
    grpEdTimes.alignChildren = ["left", "center"];
    grpEdTimes.spacing = 6;

    grpEdTimes.add("statictext", undefined, "In:");
    var txtEdStart = grpEdTimes.add("edittext", undefined, "00:00:00,000");
    txtEdStart.preferredSize.width = 90;

    grpEdTimes.add("statictext", undefined, "Out:");
    var txtEdEnd = grpEdTimes.add("edittext", undefined, "00:00:00,000");
    txtEdEnd.preferredSize.width = 90;

    var lblEdDur = grpEdTimes.add("statictext", undefined, "0.0s");
    lblEdDur.alignment = ["fill", "center"];

    var txtEdContent = grpEdDetail.add("edittext", undefined, "", { multiline: true, scrolling: true });
    txtEdContent.alignment = ["fill", "top"];
    txtEdContent.preferredSize.height = 45;

    // ── Action Buttons Row (Paling Bawah) ─────────────────────────────────────
    var grpEdActions = tabEdit.add("group");
    grpEdActions.alignment = ["fill", "bottom"];
    grpEdActions.orientation = "row";
    grpEdActions.alignChildren = ["fill", "center"];
    grpEdActions.spacing = 6;
    grpEdActions.margins = [0, 4, 0, 2];

    var btnEdAdd = grpEdActions.add("button", undefined, "+ Add");
    btnEdAdd.preferredSize = [80, 24];

    var btnEdDelete = grpEdActions.add("button", undefined, "- Delete");
    btnEdDelete.preferredSize = [80, 24];

    var btnEdSave = grpEdActions.add("button", undefined, "Save SRT");
    btnEdSave.alignment = ["fill", "center"];
    btnEdSave.preferredSize.height = 24;

    /** Refresh isi ListBox dari array editorEntries */
    function refreshEditorList(filterText) {
        lstEdEntries.removeAll();
        var search = filterText ? filterText.toLowerCase() : "";

        for (var i = 0; i < editorEntries.length; i++) {
            var item = editorEntries[i];
            var txtSingle = item.text ? item.text.replace(/\r/g, " ").replace(/\n/g, " ") : "";

            if (search !== "" && txtSingle.toLowerCase().indexOf(search) === -1) {
                continue;
            }

            var row = lstEdEntries.add("item", (i + 1).toString());
            row.subItems[0].text = TimeUtils.secondsToSrtTime(item.startSeconds);
            row.subItems[1].text = TimeUtils.secondsToSrtTime(item.endSeconds);
            row.subItems[2].text = txtSingle;
            row.entryIndex = i;
        }
        lblEdCount.text = "(" + editorEntries.length + " entries)";
    }

    /** Load file SRT ke Tab Editor */
    function loadSrtToEditor() {
        if (!state.srtFilePath || state.srtFilePath === "") {
            editorEntries = [];
            refreshEditorList("");
            return;
        }
        var fileObj = new File(state.srtFilePath);
        if (!fileObj.exists) { return; }

        var parseRes = SrtParser.parseSRT(fileObj);
        if (parseRes.success) {
            editorEntries = parseRes.entries;
            refreshEditorList(txtEdSearch.text);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    // Dropdown comp berubah
    ddComp.onChange = function () { onCompSelected(); };

    // Dropdown layer berubah
    ddLayer.onChange = function () { onLayerSelected(); };

    // Refresh comp
    btnRefreshComp.onClick = function () {
        refreshCompDropdown();
        log("ℹ Composition list updated.");
    };

    // Refresh layer
    btnRefreshLayer.onClick = function () {
        refreshLayerDropdown();
        log("ℹ Layer list updated.");
    };

    // Browse SRT
    btnBrowse.onClick = function () {
        try {
            var chosen = File.openDialog("Select SRT File", "SRT Files:*.srt,All Files:*.*");
            if (chosen && chosen.exists) {
                state.srtFilePath = chosen.fsName;
                txtSrtPath.text   = chosen.name;
                updateButtonState();
                log("ℹ SRT file selected: " + chosen.name);
            }
        } catch (e) {
            log("⚠ Failed to open file picker: " + e.toString());
        }
    };

    // Switch tab handler
    tabGroup.onChange = function () {
        if (tabGroup.selection === tabEdit) {
            loadSrtToEditor();
        }
    };

    // Filter pencarian
    txtEdSearch.onChanging = function () {
        refreshEditorList(txtEdSearch.text);
    };

    // Seleksi baris di ListBox
    lstEdEntries.onChange = function () {
        if (!lstEdEntries.selection) { return; }
        var row = lstEdEntries.selection;
        var idx = row.entryIndex;
        if (typeof idx !== "number" || idx < 0 || idx >= editorEntries.length) { return; }

        edSelectedIndex = idx;
        var entry = editorEntries[idx];

        txtEdStart.text   = TimeUtils.secondsToSrtTime(entry.startSeconds);
        txtEdEnd.text     = TimeUtils.secondsToSrtTime(entry.endSeconds);
        txtEdContent.text = entry.text;

        var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
        lblEdDur.text = dur + "s";
    };

    // Live Auto-Update saat teks subtitle diketik
    txtEdContent.onChanging = function () {
        if (edSelectedIndex >= 0 && edSelectedIndex < editorEntries.length) {
            var entry = editorEntries[edSelectedIndex];
            entry.text = txtEdContent.text;

            if (lstEdEntries.selection) {
                var singleText = entry.text ? entry.text.replace(/\r/g, " ").replace(/\n/g, " ") : "";
                lstEdEntries.selection.subItems[2].text = singleText;
            }
        }
    };

    // Live Auto-Update saat waktu In diubah
    txtEdStart.onChange = function () {
        if (edSelectedIndex >= 0 && edSelectedIndex < editorEntries.length) {
            var newStart = TimeUtils.srtTimeToSeconds(txtEdStart.text);
            var entry = editorEntries[edSelectedIndex];
            if (newStart >= 0 && newStart < entry.endSeconds) {
                entry.startSeconds = newStart;
                if (lstEdEntries.selection) {
                    lstEdEntries.selection.subItems[0].text = TimeUtils.secondsToSrtTime(newStart);
                }
                var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
                lblEdDur.text = dur + "s";
            }
        }
    };

    // Live Auto-Update saat waktu Out diubah
    txtEdEnd.onChange = function () {
        if (edSelectedIndex >= 0 && edSelectedIndex < editorEntries.length) {
            var newEnd = TimeUtils.srtTimeToSeconds(txtEdEnd.text);
            var entry = editorEntries[edSelectedIndex];
            if (newEnd > entry.startSeconds) {
                entry.endSeconds = newEnd;
                if (lstEdEntries.selection) {
                    lstEdEntries.selection.subItems[1].text = TimeUtils.secondsToSrtTime(newEnd);
                }
                var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
                lblEdDur.text = dur + "s";
            }
        }
    };

    // Tambah baris baru
    btnEdAdd.onClick = function () {
        var lastEnd = 0;
        if (editorEntries.length > 0) {
            lastEnd = editorEntries[editorEntries.length - 1].endSeconds + 0.5;
        }

        editorEntries.push({
            index:        editorEntries.length + 1,
            startSeconds: lastEnd,
            endSeconds:   lastEnd + 2.5,
            text:         "New Subtitle"
        });
        refreshEditorList(txtEdSearch.text);
        if (lstEdEntries.items.length > 0) {
            lstEdEntries.selection = lstEdEntries.items.length - 1;
        }
    };

    // Hapus baris terpilih
    btnEdDelete.onClick = function () {
        if (edSelectedIndex < 0 || edSelectedIndex >= editorEntries.length) {
            alert("Select a subtitle entry to delete.");
            return;
        }

        editorEntries.splice(edSelectedIndex, 1);
        edSelectedIndex = -1;
        txtEdContent.text = "";
        refreshEditorList(txtEdSearch.text);
    };

    // Simpan SRT
    btnEdSave.onClick = function () {
        if (!state.srtFilePath || state.srtFilePath === "") {
            alert("Select an SRT file in the Generator tab first.");
            return;
        }
        var res = SrtWriter.writeSRT(state.srtFilePath, editorEntries);
        if (res.success) {
            log("[SUCCESS] SRT file saved: " + new File(state.srtFilePath).name);
            alert("SRT file saved successfully!");
        } else {
            alert("Failed to save SRT: " + res.error);
        }
    };

    // Save as .ffx
    btnSaveFFX.onClick = function () {
        if (!state.templateLayer) {
            log("[ERROR] Select a template layer first before exporting .ffx.");
            return;
        }

        try {
            var saveFile = File.saveDialog("Save template as .ffx", "FFX Files:*.ffx");
            if (!saveFile) { return; }

            var savePath = saveFile.fsName;
            if (!/\.ffx$/i.test(savePath)) { savePath = savePath + ".ffx"; }

            var exportResult = PresetIO.exportTemplateAsPreset(state.templateLayer, savePath);
            if (exportResult.success) {
                Prefs.setPref("lastFfxPath", savePath);
                state.lastFfxPath     = savePath;
                lblLastFFX.text       = "Last: " + new File(savePath).name;
                btnQuickLoad.enabled  = true;
                log("[SUCCESS] Template saved: " + new File(savePath).name);
            } else {
                log("[ERROR] Export .ffx failed: " + exportResult.error);
            }
        } catch (e) {
            log("[WARN] Error saving .ffx: " + e.toString());
        }
    };

    // Load .ffx
    btnLoadFFX.onClick = function () {
        try {
            var loadFile = File.openDialog("Select .ffx template file", "FFX Files:*.ffx,All Files:*.*");
            if (!loadFile || !loadFile.exists) { return; }

            var importResult = PresetIO.importTemplateFromPreset(loadFile.fsName, state.selectedComp);
            if (importResult.success) {
                Prefs.setPref("lastFfxPath", loadFile.fsName);
                state.lastFfxPath = loadFile.fsName;
                lblLastFFX.text = "Last: " + loadFile.name;
                btnQuickLoad.enabled = true;
                log("[SUCCESS] Template loaded from .ffx: " + loadFile.name);
                refreshLayerDropdown();
                if (ddLayer.items.length > 0) {
                    ddLayer.selection = 0;
                    onLayerSelected();
                }
            } else {
                log("[ERROR] Load .ffx failed: " + importResult.error);
            }
        } catch (e) {
            log("[WARN] Error loading .ffx: " + e.toString());
        }
    };

    // Quick Load Last .ffx
    btnQuickLoad.onClick = function () {
        try {
            var ffxPath = state.lastFfxPath || Prefs.getPref("lastFfxPath", "");
            if (!ffxPath || ffxPath === "") {
                log("[WARN] No saved last .ffx file.");
                return;
            }

            if (!state.selectedComp) {
                log("[ERROR] Select target composition first.");
                return;
            }

            var importResult = PresetIO.importTemplateFromPreset(ffxPath, state.selectedComp);
            if (importResult.success) {
                log("[SUCCESS] Quick Load: template loaded from " + new File(ffxPath).name);
                refreshLayerDropdown();
                if (ddLayer.items.length > 0) {
                    ddLayer.selection = 0;
                    onLayerSelected();
                }
            } else {
                log("[ERROR] Quick Load failed: " + importResult.error);
            }
        } catch (e) {
            log("[WARN] Error during Quick Load: " + e.toString());
        }
    };

    // Generate Subtitles
    btnGenerate.onClick = function () {
        try {
            runGenerate(false);
        } catch (e) {
            log("[ERROR] Unexpected error during generate: " + e.toString());
            setStatus("Error", "error");
            try { app.endUndoGroup(); } catch (ignore) {}
        }
    };

    // Re-import / Replace
    btnReimport.onClick = function () {
        try {
            runGenerate(true);
        } catch (e) {
            log("[ERROR] Unexpected error during re-import: " + e.toString());
            setStatus("Error", "error");
            try { app.endUndoGroup(); } catch (ignore) {}
        }
    };

    // Open Debug Log File
    btnOpenDebugLog.onClick = function () {
        try {
            var logPath = Logger.getLogFilePath();
            var logFile = new File(logPath);
            if (logFile.exists) {
                logFile.execute();
                log("[INFO] Opening log file: " + logPath);
            } else {
                log("[INFO] Log file path: " + logPath + " (file not created yet)");
            }
        } catch (e) {
            log("[WARN] Failed to open log file: " + e.toString());
        }
    };

    // Copy Log Text to Clipboard
    btnCopyLog.onClick = function () {
        try {
            var txt = logArea.text;
            if (!txt || txt.length === 0) {
                alert("Log box is empty.");
                return;
            }

            var tempFile = new File(Folder.temp.fsName + "/aesubmaster_log_copy.txt");
            tempFile.encoding = "UTF-8";
            if (tempFile.open("w")) {
                tempFile.write(txt);
                tempFile.close();

                var cmd = 'cmd.exe /c type "' + tempFile.fsName + '" | clip';
                system.callSystem(cmd);
                tempFile.remove();
                alert("Log messages copied to clipboard!");
            }
        } catch (e) {
            alert("Failed to copy log: " + e.toString());
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // INISIALISASI
    // ═══════════════════════════════════════════════════════════════════════════

    // Load prefs
    try {
        var savedFFX = Prefs.getPref("lastFfxPath", "");
        if (savedFFX && savedFFX !== "") {
            state.lastFfxPath = savedFFX;
            var ffxFile = new File(savedFFX);
            lblLastFFX.text      = "Last: " + ffxFile.name;
            btnQuickLoad.enabled = true;
        }
    } catch (ignore) {}

    // Otomatis sinkronisasi saat panel diakses / mendapat fokus oleh user
    panel.onActivate = function () {
        try {
            syncActiveCompAndLayer();
        } catch (ignore) {}
    };

    // Populate dropdown comp & layer saat panel pertama dibuka
    refreshCompDropdown();

    // Resize support (berfungsi baik untuk Window standalone maupun Docked Panel)
    panel.onResizing = panel.onResize = function () {
        try {
            panel.layout.resize();
        } catch (ignore) {}
    };

    panel.layout.layout(true);

    if (panel instanceof Window) {
        panel.show();
    }

    return panel;
}
