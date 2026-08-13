/**
 * AESubMaster — panel.jsx
 *
 * Builds the ScriptUI panel following the design.md hierarchy (sections A → F):
 *   A. Header
 *   B. Target Composition & Template Layer
 *   C. SRT File Input
 *   D. Options
 *   E. Generate & Re-import Buttons
 *   F. Log & Status
 *
 * Requires all lib/ modules to be #included before this file.
 * ExtendScript (ES3) compatible.
 */

/**
 * Build and return the AESubMaster panel.
 *
 * @param  {Window|Panel} thisObj   Context passed from AESubMaster.jsx (Panel when docked, Window otherwise)
 * @return {Window|Panel}
 */
function buildPanel(thisObj) {

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS & STATE
    // ═══════════════════════════════════════════════════════════════════════════

    var PANEL_TITLE    = "AESubMaster";
    var PANEL_SUBTITLE = "SRT to Template Layer";

    /** Active state of the panel — updated on user interaction */
    var state = {
        selectedComp:          null,   // Selected CompItem
        templateLayer:         null,   // Selected template layer
        templateLayerIndex:    -1,     // Index of template layer in comp (for re-validation)
        srtFilePath:           "",     // Path of selected SRT file
        templateLayerName:     "",     // Template layer name (for display)
        lastFfxPath:           "",     // Last .ffx path (from prefs)
        compFps:               25      // Active comp FPS (default 25)
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Return the active composition's frame rate. Defaults to 25 if unavailable.
     * @return {Number}
     */
    function getFps() {
        try {
            if (state.selectedComp && state.selectedComp.frameRate) {
                return state.selectedComp.frameRate;
            }
        } catch (ignore) {}
        return 25;
    }

    /**
     * Format seconds as HH:MM:SS:FF using the active composition's FPS.
     * @param  {Number} seconds
     * @return {String}
     */
    function formatTimeDisplay(seconds) {
        return TimeUtils.secondsToAETime(seconds, getFps());
    }

    /**
     * Parse a user-typed time string. Accepts HH:MM:SS:FF (frame-based) or HH:MM:SS,ms (SRT).
     * @param  {String} str
     * @return {Number}  Seconds, or -1 if the format is invalid.
     */
    function parseTimeInput(str) {
        // Try frame-based format first (HH:MM:SS:FF — 3 colon separators)
        var colonCount = 0;
        for (var ci = 0; ci < str.length; ci++) {
            if (str.charAt(ci) === ":") { colonCount++; }
        }
        if (colonCount === 3) {
            var v = TimeUtils.aeTimeToSeconds(str, getFps());
            if (v >= 0) { return v; }
        }
        // Fallback to SRT millisecond format (HH:MM:SS,ms)
        return TimeUtils.srtTimeToSeconds(str);
    }

    /**
     * Append a message to the log area and mirror it to the Logger system.
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

    /** Clear the log area. */
    function clearLog() {
        try {
            lastLogText = "";
            logArea.text = "";
        } catch (ignore) {}
    }

    /**
     * Update the status label above the log area.
     * @param {String} msg    Status text
     * @param {String} type   "ready" | "processing" | "done" | "error"
     */
    function setStatus(msg, type) {
        try {
            statusLabel.text = msg;
        } catch (ignore) {}
    }

    /**
     * Enable / disable Generate and Re-import buttons based on current state.
     * Both buttons require a template layer AND an SRT file to be selected.
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
     * Return all CompItems in the current project.
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
     * Return all text layers in a composition as { name, index, layer } objects.
     * @param  {CompItem} comp
     * @return {Array}
     */
    function getTextLayers(comp) {
        var layers = [];
        if (!comp || !comp.layers) { return layers; }

        for (var i = 1; i <= comp.layers.length; i++) {
            try {
                var layer = comp.layers[i];
                // Detect text layer by the presence of the "Source Text" property
                if (layer.property("Source Text")) {
                    layers.push({ name: layer.name, index: i, layer: layer });
                }
            } catch (ignore) {}
        }
        return layers;
    }

    /**
     * Populate the composition dropdown from all CompItems in the project.
     */
    function refreshCompDropdown() {
        try {
            ddComp.removeAll();
            var comps = getAllComps();

            if (comps.length === 0) {
                ddComp.add("item", "(no compositions)");
                ddComp.enabled = false;
                return;
            }

            ddComp.enabled = true;
            var activeIndex = 0;

            for (var i = 0; i < comps.length; i++) {
                ddComp.add("item", comps[i].name);
                // Default to the currently active composition in the viewer
                if (app.project.activeItem instanceof CompItem &&
                    comps[i] === app.project.activeItem) {
                    activeIndex = i;
                }
            }

            ddComp.selection = activeIndex;
            onCompSelected();
        } catch (e) {
            log("[WARN] Failed to load composition list: " + e.toString());
        }
    }

    /**
     * Populate the layer dropdown from the selected composition.
     * Automatically pre-selects the layer currently selected in the AE timeline.
     */
    function refreshLayerDropdown() {
        try {
            ddLayer.removeAll();
            state.templateLayer = null;
            updateButtonState();

            if (!state.selectedComp) {
                ddLayer.add("item", "(please select a comp)");
                ddLayer.enabled = false;
                return;
            }

            var textLayers = getTextLayers(state.selectedComp);

            if (textLayers.length === 0) {
                ddLayer.add("item", "(no text layers)");
                ddLayer.enabled = false;
                return;
            }

            ddLayer.enabled = true;

            // Pre-select the layer currently selected in the AE timeline
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
            log("[WARN] Failed to load layer list: " + e.toString());
        }
    }

    /**
     * Sync the panel's composition and layer dropdowns to the currently active AE item.
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

    /** Handle composition dropdown change. */
    function onCompSelected() {
        try {
            var comps = getAllComps();
            var idx   = ddComp.selection ? ddComp.selection.index : 0;
            if (idx >= 0 && idx < comps.length) {
                state.selectedComp = comps[idx];
                // Update FPS from the selected composition
                try {
                    state.compFps = comps[idx].frameRate || 25;
                } catch (ignore) { state.compFps = 25; }
            } else {
                state.selectedComp = null;
                state.compFps = 25;
            }
            refreshLayerDropdown();
        } catch (e) {
            log("[WARN] Error selecting comp: " + e.toString());
        }
    }

    /** Handle layer dropdown change. */
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
            log("[WARN] Error selecting layer: " + e.toString());
        }
    }

    /**
     * Core generation logic: parse SRT and create subtitle layers.
     * Called by both the Generate and Re-import buttons.
     *
     * @param {Boolean} isReimport   If true, removes existing generated layers before creating new ones.
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

        // ── Read Fit Out/In option ───────────────────────────────────────────
        var fitMode = "none";
        try {
            var fitSel = ddFit.selection;
            if (fitSel) {
                if (fitSel.index === 1) { fitMode = "fitOut"; }
                else if (fitSel.index === 2) { fitMode = "fitIn"; }
            }
        } catch (ignore) {}

        // ── Read Lead In / Lead Out values ───────────────────────────────────
        var leadInSec  = 0;
        var leadOutSec = 0;
        try {
            var fps = getFps();
            var leadInVal  = parseFloat(txtLeadIn.text)  || 0;
            var leadOutVal = parseFloat(txtLeadOut.text) || 0;
            if (leadInVal  < 0) { leadInVal  = 0; }
            if (leadOutVal < 0) { leadOutVal = 0; }

            // Convert to seconds based on selected unit
            var useFrames = (ddLeadUnit && ddLeadUnit.selection && ddLeadUnit.selection.index === 0);
            if (useFrames) {
                leadInSec  = leadInVal  / fps;
                leadOutSec = leadOutVal / fps;
            } else {
                leadInSec  = leadInVal;
                leadOutSec = leadOutVal;
            }
        } catch (ignore) {}

        // ── Apply Fit Out/In to entry timings ────────────────────────────────
        if (fitMode === "fitOut") {
            // Extend each subtitle's end to the start of the next subtitle (no gap)
            for (var fi = 0; fi < entries.length - 1; fi++) {
                entries[fi].endSeconds = entries[fi + 1].startSeconds;
            }
            log("[INFO] Fit Out applied: subtitle duration extended to next subtitle start.");
        } else if (fitMode === "fitIn") {
            // Push each subtitle's start back to the end of the previous subtitle (no gap)
            for (var fi = 1; fi < entries.length; fi++) {
                entries[fi].startSeconds = entries[fi - 1].endSeconds;
            }
            log("[INFO] Fit In applied: subtitle start moved to previous subtitle end.");
        }

        // Use the template's original timing as reference for marker sync
        var templateStartTime = state.templateLayer.startTime;
        var templateOutPoint  = state.templateLayer.outPoint;

        // ── Begin undo group ─────────────────────────────────────────────────
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
                    { leadIn: leadInSec, leadOut: leadOutSec }
                );

                if (!dupResult.success) {
                    log("[WARN] Entry #" + entry.index + ": failed to create — " + dupResult.error);
                    continue;
                }

                createdCount++;

                if (doSyncMarker) {
                    try {
                        // Use the post-lead-adjustment timing for marker sync
                        var actualStart = dupResult.actualStart || entry.startSeconds;
                        var actualEnd   = dupResult.actualEnd   || entry.endSeconds;

                        var syncResult = MarkerSync.syncOutMarker(
                            dupResult.layer,
                            templateStartTime,
                            templateOutPoint,
                            actualStart,
                            actualEnd,
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

    // ── TAB 3: EXPORT SRT ────────────────────────────────────────────────
    var tabExport = tabGroup.add("tab", undefined, "Export SRT");
    tabExport.orientation = "column";
    tabExport.alignChildren = ["fill", "fill"];
    tabExport.spacing = 6;
    tabExport.margins = 6;

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

    // ── Fit Out/In Dropdown ───────────────────────────────────────────────────
    var grpFitRow = grpD.add("group");
    grpFitRow.alignment = ["fill", "top"];
    grpFitRow.orientation = "row";
    grpFitRow.alignChildren = ["left", "center"];
    grpFitRow.spacing = 6;
    grpFitRow.margins = [4, 2, 4, 2];

    grpFitRow.add("statictext", undefined, "Fit:");
    var ddFit = grpFitRow.add("dropdownlist", undefined, ["(none)", "Fit Out", "Fit In"]);
    ddFit.selection = 0;
    ddFit.alignment = ["fill", "center"];
    ddFit.helpTip = "Fit Out: extend subtitle end to next subtitle start (no gap).\n" +
                    "Fit In:  extend subtitle start to prev subtitle end (no gap).\n" +
                    "Cannot combine both — use dropdown to select one at a time.";

    // ── Lead In / Lead Out ────────────────────────────────────────────────────
    var grpLeadRow = grpD.add("group");
    grpLeadRow.alignment = ["fill", "top"];
    grpLeadRow.orientation = "row";
    grpLeadRow.alignChildren = ["left", "center"];
    grpLeadRow.spacing = 4;
    grpLeadRow.margins = [4, 2, 4, 2];

    grpLeadRow.add("statictext", undefined, "Lead In:");
    var txtLeadIn = grpLeadRow.add("edittext", undefined, "0");
    txtLeadIn.preferredSize = [38, 20];
    txtLeadIn.helpTip = "Shift In point backwards by N frames/seconds to show subtitle earlier. Default: 0";

    grpLeadRow.add("statictext", undefined, "Lead Out:");
    var txtLeadOut = grpLeadRow.add("edittext", undefined, "0");
    txtLeadOut.preferredSize = [38, 20];
    txtLeadOut.helpTip = "Shift Out point forwards by N frames/seconds to keep subtitle longer. Default: 0";

    var ddLeadUnit = grpLeadRow.add("dropdownlist", undefined, ["Frames", "Seconds"]);
    ddLeadUnit.selection = 0;
    ddLeadUnit.preferredSize = [75, 20];
    ddLeadUnit.helpTip = "Unit for Lead In / Lead Out values.";

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
        columnTitles: ["#", "In (HH:MM:SS:FF)", "Out (HH:MM:SS:FF)", "Subtitle Text"],
        columnWidths: [30, 95, 95, 130]
    });
    lstEdEntries.alignment = ["fill", "fill"];
    lstEdEntries.preferredSize.height = 140;

    // ── Entry Detail Edit Panel ───────────────────────────────────────────────
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
    var txtEdStart = grpEdTimes.add("edittext", undefined, "00:00:00:00");
    txtEdStart.preferredSize.width = 90;
    txtEdStart.helpTip = "Format: HH:MM:SS:FF (frames). Also accepts HH:MM:SS,ms";

    grpEdTimes.add("statictext", undefined, "Out:");
    var txtEdEnd = grpEdTimes.add("edittext", undefined, "00:00:00:00");
    txtEdEnd.preferredSize.width = 90;
    txtEdEnd.helpTip = "Format: HH:MM:SS:FF (frames). Also accepts HH:MM:SS,ms";

    var lblEdDur = grpEdTimes.add("statictext", undefined, "0.0s");
    lblEdDur.alignment = ["fill", "center"];

    var txtEdContent = grpEdDetail.add("edittext", undefined, "", { multiline: true, scrolling: true });
    txtEdContent.alignment = ["fill", "top"];
    txtEdContent.preferredSize.height = 45;

    // ── Action Button Row ─────────────────────────────────────────────────────
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

    /** Rebuild the ListBox from editorEntries, applying an optional text filter. */
    function refreshEditorList(filterText) {
        lstEdEntries.removeAll();
        var search = filterText ? filterText.toLowerCase() : "";
        var fps = getFps();

        for (var i = 0; i < editorEntries.length; i++) {
            var item = editorEntries[i];
            var txtSingle = item.text ? item.text.replace(/\r/g, " ").replace(/\n/g, " ") : "";

            if (search !== "" && txtSingle.toLowerCase().indexOf(search) === -1) {
                continue;
            }

            var row = lstEdEntries.add("item", (i + 1).toString());
            row.subItems[0].text = TimeUtils.secondsToAETime(item.startSeconds, fps);
            row.subItems[1].text = TimeUtils.secondsToAETime(item.endSeconds,   fps);
            row.subItems[2].text = txtSingle;
            row.entryIndex = i;
        }
        lblEdCount.text = "(" + editorEntries.length + " entries)";
    }

    /**
     * Load the selected SRT file into the Subtitle Editor tab.
     * After parsing, attempts to match each entry to an AE text layer in the
     * active composition by inPoint proximity, storing a layerRef for live edits.
     */
    function loadSrtToEditor() {
        if (!state.srtFilePath || state.srtFilePath === "") {
            editorEntries = [];
            refreshEditorList("");
            return;
        }
        var fileObj = new File(state.srtFilePath);
        if (!fileObj.exists) { return; }

        var parseRes = SrtParser.parseSRT(fileObj);
        if (!parseRes.success) { return; }

        editorEntries = parseRes.entries;

        // ── Link entries to AE layers (by inPoint proximity) ────────────────
        // Looks for text layers tagged with aesubmaster_generated comment.
        // Tolerance: 1 frame at current FPS.
        var comp = state.selectedComp;
        if (comp) {
            try {
                var fps       = getFps();
                var tolerance = 1.0 / fps; // 1 frame tolerance

                // Collect generated text layers from comp
                var genLayers = [];
                for (var li = 1; li <= comp.numLayers; li++) {
                    try {
                        var lyr = comp.layer(li);
                        if ((lyr instanceof TextLayer) && lyr.comment === "aesubmaster_generated") {
                            genLayers.push(lyr);
                        }
                    } catch (ignore) {}
                }

                // Match each entry to the closest generated layer by inPoint
                for (var ei = 0; ei < editorEntries.length; ei++) {
                    var entry     = editorEntries[ei];
                    entry.layerRef = null;
                    var bestDiff  = tolerance + 1;

                    for (var gi = 0; gi < genLayers.length; gi++) {
                        try {
                            var diff = Math.abs(genLayers[gi].inPoint - entry.startSeconds);
                            // Valid match only if within tolerance
                            if (diff <= tolerance && diff < bestDiff) {
                                bestDiff       = diff;
                                entry.layerRef = genLayers[gi];
                            }
                        } catch (ignore) {}
                    }
                }
            } catch (linkErr) {
                // Non-fatal — editor still works without live AE sync
            }
        }

        refreshEditorList(txtEdSearch.text);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 3: EXPORT SRT
    // ═══════════════════════════════════════════════════════════════════════════

    // ── Header Info ────────────────────────────────────────────────────────────
    var lblExpInfo = tabExport.add("statictext", undefined,
        "Reads layers currently selected in the AE timeline. Select layers there, then click Refresh.",
        { multiline: true });
    lblExpInfo.alignment = ["fill", "top"];

    // ── Comp info + Refresh button row ──────────────────────────────────────
    var grpExpHeader = tabExport.add("group");
    grpExpHeader.alignment = ["fill", "top"];
    grpExpHeader.orientation = "row";
    grpExpHeader.alignChildren = ["fill", "center"];
    grpExpHeader.spacing = 6;
    grpExpHeader.margins = [0, 2, 0, 2];

    var lblExpComp = grpExpHeader.add("statictext", undefined, "Comp: (sync with Tab 1)");
    lblExpComp.alignment = ["fill", "center"];

    var btnExpRefresh = grpExpHeader.add("button", undefined, "↻ Refresh");
    btnExpRefresh.preferredSize = [80, 22];
    btnExpRefresh.helpTip = "Read currently selected layers from the AE timeline.";

    // ── Preview ListBox (read-only, shows AE-selected text layers) ─────────────
    var lstExpLayers = tabExport.add("listbox", undefined, [], {
        numberOfColumns: 3,
        showHeaders: true,
        columnTitles: ["Layer Name", "In Point", "Out Point"],
        columnWidths: [170, 85, 85]
    });
    lstExpLayers.alignment = ["fill", "fill"];
    lstExpLayers.preferredSize.height = 180;
    lstExpLayers.helpTip = "Preview of currently selected text layers in the AE timeline. Click Refresh to update.";

    // ── Layer count info row ───────────────────────────────────────────────────
    var grpExpSel = tabExport.add("group");
    grpExpSel.alignment = ["fill", "top"];
    grpExpSel.orientation = "row";
    grpExpSel.alignChildren = ["fill", "center"];
    grpExpSel.spacing = 6;
    grpExpSel.margins = [0, 2, 0, 2];

    var lblExpCount = grpExpSel.add("statictext", undefined, "(0 selected in timeline)");
    lblExpCount.alignment = ["fill", "center"];

    // ── Export button ────────────────────────────────────────────────────────────
    var btnExpExport = tabExport.add("button", undefined, "Export Selected Layers as SRT...");
    btnExpExport.alignment = ["fill", "top"];
    btnExpExport.preferredSize.height = 28;
    btnExpExport.enabled = false;
    btnExpExport.helpTip = "Save selected text layers as a new .srt file sorted by In Point.";

    // ── Status label ───────────────────────────────────────────────────────────────
    var lblExpStatus = tabExport.add("statictext", undefined, "");
    lblExpStatus.alignment = ["fill", "top"];

    /**
     * Populate lstExpLayers with text layers currently selected in the AE timeline.
     * Reads layer.selected directly from the active composition.
     */
    function refreshExportLayerList() {
        lstExpLayers.removeAll();
        btnExpExport.enabled = false;
        lblExpCount.text = "(0 selected in timeline)";
        lblExpStatus.text = "";

        var comp = state.selectedComp;
        if (!comp) {
            // Fallback: try to read from app.project.activeItem
            try {
                if (app.project && app.project.activeItem && app.project.activeItem instanceof CompItem) {
                    comp = app.project.activeItem;
                }
            } catch (ignore) {}
        }

        if (!comp) {
            lblExpStatus.text = "No composition selected. Pick one in the Generator tab.";
            return;
        }

        var fps = getFps();
        var selectedTextLayers = [];

        // Collect only selected TEXT layers from the AE timeline.
        // Use instanceof TextLayer — the most reliable type check in ExtendScript.
        // Skips solids, nulls, shapes, footage, adjustment layers, etc.
        try {
            for (var li = 1; li <= comp.numLayers; li++) {
                var lyr = comp.layer(li);
                var isSelected = false;
                var isText = false;
                try { isSelected = lyr.selected; } catch (ignore) {}
                try { isText = (lyr instanceof TextLayer); } catch (ignore) {}

                if (isSelected && isText) {
                    selectedTextLayers.push(lyr);
                }
            }
        } catch (e) {
            lblExpStatus.text = "Error reading layers: " + e.toString();
            return;
        }

        if (selectedTextLayers.length === 0) {
            lblExpStatus.text = "No text layers selected in the timeline. Select layers in AE, then Refresh.";
            return;
        }

        // Sort by inPoint
        selectedTextLayers.sort(function (a, b) {
            var inA = 0, inB = 0;
            try { inA = a.inPoint; } catch (ignore) {}
            try { inB = b.inPoint; } catch (ignore) {}
            return inA - inB;
        });

        for (var ri = 0; ri < selectedTextLayers.length; ri++) {
            var lyr = selectedTextLayers[ri];
            var inPt  = 0;
            var outPt = 0;
            try { inPt  = lyr.inPoint;  } catch (ignore) {}
            try { outPt = lyr.outPoint; } catch (ignore) {}

            var row = lstExpLayers.add("item", lyr.name);
            row.subItems[0].text = TimeUtils.secondsToAETime(inPt,  fps);
            row.subItems[1].text = TimeUtils.secondsToAETime(outPt, fps);
            row.layerRef = lyr; // store layer reference for export
        }

        lblExpCount.text = "(" + selectedTextLayers.length + " selected in timeline)";
        lblExpStatus.text = selectedTextLayers.length + " selected text layer(s) ready to export.";
        btnExpExport.enabled = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 3 EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    lstExpLayers.onChange = function () {
        // Preview-only listbox — no action needed on click
    };

    btnExpRefresh.onClick = function () {
        refreshExportLayerList();
    };

    btnExpExport.onClick = function () {
        try {
            // Export all layers currently shown in the listbox
            // (they represent the AE-timeline-selected text layers at last Refresh)
            if (lstExpLayers.items.length === 0) {
                alert("No layers to export. Select text layers in the AE timeline, then click Refresh.");
                return;
            }

            var expEntries = [];
            for (var ei = 0; ei < lstExpLayers.items.length; ei++) {
                var item = lstExpLayers.items[ei];
                var layerRef = item.layerRef;
                if (!layerRef) { continue; }

                var inPt  = 0;
                var outPt = 0;
                var txt   = "";

                try { inPt  = layerRef.inPoint;  } catch (ignore) {}
                try { outPt = layerRef.outPoint; } catch (ignore) {}

                // Skip non-text layers that may have slipped through
                try {
                    if (!(layerRef instanceof TextLayer)) { continue; }
                } catch (ignore) {}

                // Read text from Source Text property
                try {
                    var srcText = layerRef.property("Source Text");
                    if (srcText) {
                        var tdVal = srcText.value;
                        txt = tdVal.text || "";
                    }
                } catch (ignore) {}

                if (outPt > inPt && txt.length > 0) {
                    expEntries.push({
                        index:        expEntries.length + 1,
                        startSeconds: inPt,
                        endSeconds:   outPt,
                        text:         txt
                    });
                }
            }

            if (expEntries.length === 0) {
                alert("No valid text layers found in selection (layers must have text and non-zero duration).");
                return;
            }

            // Sort by start time
            expEntries.sort(function (a, b) { return a.startSeconds - b.startSeconds; });

            // Re-index sequentially
            for (var ri = 0; ri < expEntries.length; ri++) {
                expEntries[ri].index = ri + 1;
            }

            // Choose save path
            var saveFile = File.saveDialog("Export as SRT", "SRT Files:*.srt");
            if (!saveFile) { return; }

            var savePath = saveFile.fsName;
            if (!/\.srt$/i.test(savePath)) { savePath = savePath + ".srt"; }

            var res = SrtWriter.writeSRT(savePath, expEntries);
            if (res.success) {
                lblExpStatus.text = "Exported " + expEntries.length + " entries to: " + new File(savePath).name;
                alert("SRT exported successfully! (" + expEntries.length + " entries)");
            } else {
                lblExpStatus.text = "Export failed: " + res.error;
                alert("Export failed: " + res.error);
            }
        } catch (e) {
            alert("Export error: " + e.toString());
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 2: SUBTITLE EDITOR EVENT HANDLERS (continued)
    // ═══════════════════════════════════════════════════════════════════════════

    // Comp dropdown change handler
    ddComp.onChange = function () { onCompSelected(); };

    // Layer dropdown change handler
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
                txtSrtPath.text   = decodeURIComponent(chosen.name);
                updateButtonState();
                log("[INFO] SRT file selected: " + decodeURIComponent(chosen.name));
            }
        } catch (e) {
            log("⚠ Failed to open file picker: " + e.toString());
        }
    };

    // Switch tab handler
    tabGroup.onChange = function () {
        if (tabGroup.selection === tabEdit) {
            loadSrtToEditor();
        } else if (tabGroup.selection === tabExport) {
            refreshExportLayerList();
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
        var fps = getFps();

        txtEdStart.text   = TimeUtils.secondsToAETime(entry.startSeconds, fps);
        txtEdEnd.text     = TimeUtils.secondsToAETime(entry.endSeconds,   fps);
        txtEdContent.text = entry.text;

        var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
        lblEdDur.text = dur + "s";
    };

    // Live update when subtitle text is typed
    txtEdContent.onChanging = function () {
        if (edSelectedIndex >= 0 && edSelectedIndex < editorEntries.length) {
            var entry = editorEntries[edSelectedIndex];
            entry.text = txtEdContent.text;

            // Update listbox preview
            if (lstEdEntries.selection) {
                var singleText = entry.text ? entry.text.replace(/\r/g, " ").replace(/\n/g, " ") : "";
                lstEdEntries.selection.subItems[2].text = singleText;
            }

            // Push text change to linked AE layer
            if (entry.layerRef) {
                try {
                    var textProp = entry.layerRef.property("Source Text");
                    var td = textProp.value;
                    td.text = entry.text;
                    textProp.setValue(td);

                    // Update layer name to match the new text
                    var safeName = entry.text.replace(/\r|\n/g, " ").substring(0, 35);
                    if (entry.text.length > 35) {
                        safeName += "...";
                    }
                    if (safeName && safeName.length > 0) {
                        entry.layerRef.name = safeName;
                    }
                } catch (ignore) {}
            }
        }
    };

    // Live update when In time is edited
    txtEdStart.onChange = function () {
        if (edSelectedIndex >= 0 && edSelectedIndex < editorEntries.length) {
            var newStart = parseTimeInput(txtEdStart.text);
            var entry = editorEntries[edSelectedIndex];
            if (newStart >= 0 && newStart < entry.endSeconds) {
                entry.startSeconds = newStart;
                var fps = getFps();
                if (lstEdEntries.selection) {
                    lstEdEntries.selection.subItems[0].text = TimeUtils.secondsToAETime(newStart, fps);
                }
                txtEdStart.text = TimeUtils.secondsToAETime(newStart, fps);
                var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
                lblEdDur.text = dur + "s";

                // Push timing change to linked AE layer
                if (entry.layerRef) {
                    try {
                        app.beginUndoGroup("AESubMaster: Edit In Point");
                        entry.layerRef.startTime = newStart;
                        entry.layerRef.inPoint   = newStart;
                        app.endUndoGroup();
                    } catch (ignore) {
                        try { app.endUndoGroup(); } catch (ignore2) {}
                    }
                }
            }
        }
    };

    // Live update when Out time is edited
    txtEdEnd.onChange = function () {
        if (edSelectedIndex >= 0 && edSelectedIndex < editorEntries.length) {
            var newEnd = parseTimeInput(txtEdEnd.text);
            var entry = editorEntries[edSelectedIndex];
            if (newEnd > entry.startSeconds) {
                entry.endSeconds = newEnd;
                var fps = getFps();
                if (lstEdEntries.selection) {
                    lstEdEntries.selection.subItems[1].text = TimeUtils.secondsToAETime(newEnd, fps);
                }
                txtEdEnd.text = TimeUtils.secondsToAETime(newEnd, fps);
                var dur = (entry.endSeconds - entry.startSeconds).toFixed(2);
                lblEdDur.text = dur + "s";

                // Push timing change to linked AE layer
                if (entry.layerRef) {
                    try {
                        app.beginUndoGroup("AESubMaster: Edit Out Point");
                        entry.layerRef.outPoint = newEnd;
                        app.endUndoGroup();
                    } catch (ignore) {
                        try { app.endUndoGroup(); } catch (ignore2) {}
                    }
                }
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

    // Save SRT to disk
    btnEdSave.onClick = function () {
        if (!state.srtFilePath || state.srtFilePath === "") {
            alert("Select an SRT file in the Generator tab first.");
            return;
        }

        // ── Safety guard: prevent writing empty or all-blank data ──────────────
        if (!editorEntries || editorEntries.length === 0) {
            alert("Nothing to save — the subtitle list is empty.");
            return;
        }
        var validCount = 0;
        for (var vi = 0; vi < editorEntries.length; vi++) {
            var e = editorEntries[vi];
            if (e.text && e.text.replace(/\s/g, "").length > 0 &&
                typeof e.startSeconds === "number" && typeof e.endSeconds === "number" &&
                e.endSeconds > e.startSeconds) {
                validCount++;
            }
        }
        if (validCount === 0) {
            alert("All entries are empty or have invalid timing. Save aborted.");
            return;
        }

        var res = SrtWriter.writeSRT(state.srtFilePath, editorEntries);
        if (res.success) {
            log("[SUCCESS] SRT file saved: " + new File(state.srtFilePath).name);
            alert("SRT file saved successfully! (" + validCount + " valid entries)");
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
