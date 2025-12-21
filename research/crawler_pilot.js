const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Configuration ---
const SITES_FILE = path.join(__dirname, '../data/sites.json');
const EXTENSION_PATH = path.resolve(__dirname, '../');
const MACHINE_ID = "dev_machine_01";
const TARGET_COUNT = 50;

// --- Run Identity ---
const RUN_ID = crypto.randomUUID();
const DATA_DIR = path.resolve(__dirname, '../data/runs', RUN_ID);

// --- Ensure Data Directory ---
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- File Streams ---
const metaFile = path.join(DATA_DIR, 'run_meta.json');
const eventsFile = path.join(DATA_DIR, `run_${RUN_ID}.jsonl`);
const visitsFile = path.join(DATA_DIR, 'visits.jsonl');
const invalidFile = path.join(DATA_DIR, 'invalid_events.jsonl');

// --- Load Probe Bundle ---
const PROBE_SOURCE = fs.readFileSync(path.join(__dirname, 'probe_v2.js'), 'utf8');
console.log("Loaded Probe Source");
const PREHOOK_SOURCE = fs.readFileSync(path.join(__dirname, '../src/content/prehook.js'), 'utf8');
console.log("Loaded Prehook Source");

// --- Helpers ---
function appendJSONL(file, data) {
    fs.appendFileSync(file, JSON.stringify(data) + '\n');
}

function getETLD1(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    const sld = parts[parts.length - 2];
    if (sld.length <= 3 && parts.length >= 3) {
        return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
}

// --- Main Crawl ---
(async () => {
    console.log(`Starting Pilot Crawl: ${RUN_ID}`);
    console.log(`Target: Top ${TARGET_COUNT} sites from sites.json`);

    // 1. Load Targets & Resume Logic
    let urls = [];
    let completedSites = new Set();
    const RUNS_DIR = path.resolve(__dirname, '../data/runs');

    // Check for existing visits to resume (GLOBAL SCAN)
    if (fs.existsSync(RUNS_DIR)) {
        try {
            console.log("Scanning all previous runs for resume...");
            const runDirs = fs.readdirSync(RUNS_DIR).filter(d => fs.statSync(path.join(RUNS_DIR, d)).isDirectory());

            const visitMap = {}; // id -> { url, mode, complete }

            for (const d of runDirs) {
                const vFile = path.join(RUNS_DIR, d, 'visits.jsonl');
                if (!fs.existsSync(vFile)) continue;

                try {
                    const content = fs.readFileSync(vFile, 'utf8');
                    const lines = content.split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const rec = JSON.parse(line);
                            if (rec.type === 'VisitStart') {
                                visitMap[rec.site_visit_id] = { url: rec.page_url, mode: rec.mode, complete: false };
                            } else if (rec.type === 'VisitEnd' && rec.status === 'complete') {
                                if (visitMap[rec.site_visit_id]) {
                                    visitMap[rec.site_visit_id].complete = true;
                                }
                            }
                        } catch (e) { }
                    }
                } catch (e) { }
            }

            // Aggregate by URL
            const urlModes = {}; // url -> Set(modes)
            for (const vid in visitMap) {
                const v = visitMap[vid];
                if (v.complete) {
                    if (!urlModes[v.url]) urlModes[v.url] = new Set();
                    urlModes[v.url].add(v.mode);
                }
            }

            // identify fully completed sites (compat + privacy)
            for (const u in urlModes) {
                if (urlModes[u].has('compat') && urlModes[u].has('privacy')) {
                    completedSites.add(u);
                }
            }
            console.log(`Found ${completedSites.size} fully completed sites to skip (from ${runDirs.length} runs).`);

        } catch (e) {
            console.error("Resume logic error:", e);
        }
    }

    try {
        const raw = fs.readFileSync(SITES_FILE, 'utf8');
        const sites = JSON.parse(raw);
        // Filter out completed sites
        urls = sites
            .map(s => s.url)
            .filter(u => !completedSites.has(u))
            .slice(0, TARGET_COUNT); // Enforce count limit after filter? No, slice first then filter? 
        // Original logic: slice(0, TARGET_COUNT).
        // We want to target the SAME top 50.

        const allTargetUrls = sites.slice(0, TARGET_COUNT).map(s => s.url);
        urls = allTargetUrls.filter(u => !completedSites.has(u));

        console.log(`Loaded ${allTargetUrls.length} targets. Skipping ${completedSites.size}. Remaining: ${urls.length}.`);
    } catch (e) {
        console.error("Failed to load sites.json:", e);
        process.exit(1);
    }

    // 2. Write Run Metadata
    const meta = {
        run_id: RUN_ID,
        machine_id: MACHINE_ID,
        start_time: new Date().toISOString(),
        config_mode: "mixed",
        extension_build: "0.0.1",
        browser_build: "Puppeteer-Chrome",
        url_count_planned: urls.length,
        config_switches: "compat+privacy",
        notes: "Phase 17 Scale-Up Crawl (Resumed) - 50 Sites"
    };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    // 3. Launch Browser
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    let completed = 0;

    // Global Error Handlers to prevent crash
    process.on('uncaughtException', (err) => {
        console.error('UNCAUGHT EXCEPTION:', err);
        // Do not exit, try to continue
    });
    process.on('unhandledRejection', (reason, p) => {
        console.error('UNHANDLED REJECTION:', reason);
    });

    for (const url of urls) {
        // Paired Visits: Monitor (Compat) then Privacy
        const modes = ["compat", "privacy"];

        for (const mode of modes) {
            const visitId = crypto.randomUUID();
            let siteHost = "unknown";
            try { siteHost = new URL(url).hostname; } catch (e) { }

            console.log(`[${completed + 1}/${urls.length}] ${mode.toUpperCase()} Visit: ${url}`);

            try {
                // Visit Start
                appendJSONL(visitsFile, {
                    type: "VisitStart",
                    site_visit_id: visitId,
                    timestamp: Date.now(),
                    page_url: url,
                    top_level_site: siteHost,
                    mode: mode,
                    policy_scope: "site"
                });

                let page = null;
                try {
                    page = await browser.newPage();

                    // Inject Config
                    const etld1 = getETLD1(siteHost);
                    const runConfig = {
                        mode: mode,
                        run_id: RUN_ID,
                        site_visit_id: visitId,
                        top_level_site: siteHost,
                        top_level_site_etld1: etld1,
                        persona_id: crypto.randomUUID(),
                        blueprint_id: "Windows 10 Chrome 120",
                        epoch_id: 1,
                        seed_derivation_version: 1,
                        features_enabled: { rotation: true, canvas: true, audio: true, webrtc: true },
                        seed: Math.floor(Math.random() * 1000000)
                    };

                    await page.evaluateOnNewDocument((c) => {
                        window.__PAL_CONFIG = c;
                    }, runConfig);

                    // Telemetry Listener
                    const handleTelemetryLog = (text) => {
                        if (typeof text !== 'string') return;
                        if (text.startsWith('__PAL_TELEM__:')) {
                            try {
                                const payload = text.replace('__PAL_TELEM__:', '');
                                const events = JSON.parse(payload);
                                if (Array.isArray(events)) {
                                    events.forEach(e => {
                                        appendJSONL(eventsFile, e);
                                    });
                                }
                            } catch (e) { }
                        }
                    };

                    page.on('console', msg => handleTelemetryLog(msg.text()));

                    page.on('workercreated', w => {
                        console.log(`[Worker Created] ${w.url()}`);
                        w.on('console', msg => {
                            const text = msg.text();
                            if (text.startsWith('__PAL_TELEM__:')) handleTelemetryLog(text);
                        });
                    });

                    // Inject Probe - Wrapped in try/catch in case of ProtocolError
                    try {
                        await page.evaluateOnNewDocument(PROBE_SOURCE);
                    } catch (e) { console.error("Probe Injection Failed:", e.message); }

                    // Navigate
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 2000));

                    // Execute Probe (Top)
                    try {
                        await page.evaluate(async () => {
                            if (window.__PAL_RUN_PROBE) await window.__PAL_RUN_PROBE();
                        });
                    } catch (e) { console.error("Probe Execution Failed:", e.message); }

                    // Execute Probe (Worker)
                    await page.evaluate(async (probeSrc, prehookSrc, config) => {
                        try {
                            const configScript = 'self.__PAL_CONFIG = ' + JSON.stringify(config) + ';';
                            const blob = new Blob([configScript, prehookSrc, probeSrc], { type: "application/javascript" });
                            const url = URL.createObjectURL(blob);
                            const w = new Worker(url);
                            w.onmessage = function (e) {
                                if (typeof e.data === 'string' && e.data.startsWith('__PAL_TELEM__:')) console.log(e.data);
                            };
                        } catch (e) { }
                    }, PROBE_SOURCE, PREHOOK_SOURCE, runConfig);

                    await new Promise(r => setTimeout(r, 2000));

                } catch (e) {
                    console.error(`Error visiting ${url}:`, e.message);
                    appendJSONL(visitsFile, { type: "VisitError", site_visit_id: visitId, error: e.message });
                } finally {
                    if (page) try { await page.close(); } catch (e) { }
                }

                // Visit End
                appendJSONL(visitsFile, {
                    type: "VisitEnd",
                    site_visit_id: visitId,
                    timestamp: Date.now(),
                    status: "complete"
                });
            } catch (e) {
                console.error("Critical Loop Error:", e);
            }
        }
        completed++;
    }

    // Finalize
    meta.end_time = new Date().toISOString();
    meta.url_count_completed = completed;
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    await browser.close();
    console.log("Pilot Crawl Complete.");

})();
