const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Configuration ---
// --- Configuration ---
const SITES_FILE = path.join(__dirname, '../data/sites.json');
const EXTENSION_PATH = path.resolve(__dirname, '../');
const MACHINE_ID = "dev_machine_01";
const TARGET_COUNT = 5; // Top 5 sites only
const VISITS_PER_SITE = 2; // 2 Visits per mode per site (Longitudinal)

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
const PREHOOK_SOURCE = fs.readFileSync(path.join(__dirname, '../src/content/prehook.js'), 'utf8');

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
    console.log(`Starting Longitudinal Crawl: ${RUN_ID}`);
    console.log(`Target: Top ${TARGET_COUNT} sites, ${VISITS_PER_SITE} visits each.`);

    // 1. Load Targets
    let urls = [];
    try {
        const raw = fs.readFileSync(SITES_FILE, 'utf8');
        const sites = JSON.parse(raw);
        urls = sites.slice(0, TARGET_COUNT).map(s => s.url);
        console.log(`Loaded ${urls.length} target URLs.`);
    } catch (e) {
        console.error("Failed to load sites.json:", e);
        process.exit(1);
    }

    // 2. Write Run Metadata
    const meta = {
        run_id: RUN_ID,
        machine_id: MACHINE_ID,
        start_time: new Date().toISOString(),
        config_mode: "longitudinal",
        extension_build: "0.0.1",
        browser_build: "Puppeteer-Chrome",
        url_count_planned: urls.length * VISITS_PER_SITE * 2, // 2 modes
        config_switches: "compat+privacy",
        notes: "Phase 17B Longitudinal Analysis - Stability vs Unlinkability"
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

    for (const url of urls) {
        let siteHost = "unknown";
        try { siteHost = new URL(url).hostname; } catch (e) { }
        const etld1 = getETLD1(siteHost);

        console.log(`\n--- Site: ${url} ---`);

        // Modes: Compat, Privacy
        const modes = ["compat", "privacy"];

        for (const mode of modes) {
            // Repeat Visits
            for (let i = 0; i < VISITS_PER_SITE; i++) {
                const visitId = crypto.randomUUID();
                const sessionLabel = `Session_${i + 1}`;
                console.log(`[${module.id || 'Job'}] Visiting ${url} [${mode.toUpperCase()}] [${sessionLabel}]`);

                // Visit Start
                appendJSONL(visitsFile, {
                    type: "VisitStart",
                    site_visit_id: visitId,
                    timestamp: Date.now(),
                    page_url: url,
                    top_level_site: siteHost,
                    mode: mode,
                    session_label: sessionLabel, // Tag for analysis (Session_1 vs Session_2)
                    policy_scope: "site"
                });

                let page = null;
                try {
                    page = await browser.newPage();

                    // Inject Config with seed randomization
                    // Note: In Compat mode, seed is ignored by applyNoise logic (validated in Phase 16)
                    // In Privacy mode, seed controls noise.
                    // We generate a NEW random seed for every visit to verify UNLINKABILITY.
                    const runConfig = {
                        mode: mode,
                        run_id: RUN_ID,
                        site_visit_id: visitId,
                        top_level_site: siteHost,
                        top_level_site_etld1: etld1,
                        persona_id: crypto.randomUUID(), // New persona per visit (mimic new session)
                        blueprint_id: "Windows 10 Chrome 120",
                        epoch_id: i + 1, // Encode session in epoch
                        seed_derivation_version: 1,
                        features_enabled: { rotation: true, canvas: true, audio: true, webrtc: true },
                        seed: Math.floor(Math.random() * 1000000) // Random seed per visit
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
                                        e.session_label = sessionLabel;
                                        appendJSONL(eventsFile, e);
                                    });
                                }
                            } catch (e) { }
                        }
                    };

                    page.on('console', msg => handleTelemetryLog(msg.text()));

                    // Worker Handling
                    page.on('workercreated', w => {
                        w.on('console', msg => {
                            const text = msg.text();
                            if (text.startsWith('__PAL_TELEM__:')) handleTelemetryLog(text);
                        });
                    });

                    // Inject Probe
                    await page.evaluateOnNewDocument(PROBE_SOURCE);

                    // Navigate
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 2000));

                    // Execute Probe (Top)
                    await page.evaluate(async () => {
                        if (window.__PAL_RUN_PROBE) await window.__PAL_RUN_PROBE();
                    });

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
                    completed++;

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
            }
        }
    }

    // Finalize
    meta.end_time = new Date().toISOString();
    meta.url_count_completed = completed;
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    await browser.close();
    console.log("Longitudinal Crawl Complete.");

})();
