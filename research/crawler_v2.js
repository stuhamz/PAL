const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Configuration ---
const CONFIG = {
    urls: [
        "https://example.com",
        "https://browserleaks.com/canvas",
        "https://browserleaks.com/webgl",
        // Add more from sites.json if needed
    ],
    mode: "privacy", // compat, balanced, privacy
    run_id: crypto.randomUUID(),
    machine_id: "dev_machine_01" // In prod, get from env
};

const EXTENSION_PATH = path.resolve(__dirname, '../');
const DATA_DIR = path.resolve(__dirname, '../data/runs', CONFIG.run_id);

// --- Ensure Data Directory ---
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- File Streams ---
const metaFile = path.join(DATA_DIR, 'run_meta.json');
const eventsFile = path.join(DATA_DIR, `run_${CONFIG.run_id}.jsonl`);
const visitsFile = path.join(DATA_DIR, 'visits.jsonl');
const invalidFile = path.join(DATA_DIR, 'invalid_events.jsonl');

// --- Helpers ---
function appendJSONL(file, data) {
    fs.appendFileSync(file, JSON.stringify(data) + '\n');
}

// --- Main Crawl ---
(async () => {
    console.log(`Starting Crawl Run: ${CONFIG.run_id}`);
    console.log(`Mode: ${CONFIG.mode}`);
    console.log(`Data Dir: ${DATA_DIR}`);

    // 1. Write Run Metadata
    const meta = {
        run_id: CONFIG.run_id,
        machine_id: CONFIG.machine_id,
        start_time: new Date().toISOString(),
        config_mode: CONFIG.mode,
        extension_build: "0.0.1", // TODO: Read from manifest
        browser_build: "Puppeteer-Chrome",
        url_count_planned: CONFIG.urls.length,
        notes: "Pilot Crawl V2 Schema Test"
    };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    // 2. Launch Browser
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

    for (const url of CONFIG.urls) {
        const visitId = crypto.randomUUID();
        const site = new URL(url).hostname;
        console.log(`Visiting [${completed + 1}/${CONFIG.urls.length}]: ${url}`);

        // Visit Start
        appendJSONL(visitsFile, {
            type: "VisitStart",
            site_visit_id: visitId,
            timestamp: Date.now(),
            page_url: url,
            top_level_site: site,
            policy_scope: "site" // Default
        });

        const page = await browser.newPage();

        // Inject Config into Page (Simulating Extension Config)
        await page.evaluateOnNewDocument((c) => {
            window.__PAL_CONFIG = c;
        }, {
            mode: CONFIG.mode,
            run_id: CONFIG.run_id,
            site_visit_id: visitId
        });

        // Capture Telemetry
        page.on('console', msg => {
            const text = msg.text();
            console.log(`[Browser Console] ${text}`); // DEBUG

            if (text.startsWith('__PAL_TELEM__:')) {
                try {
                    const payload = text.replace('__PAL_TELEM__:', '');
                    const events = JSON.parse(payload);
                    if (Array.isArray(events)) {
                        events.forEach(e => {
                            // Validation (Schema V2)
                            if (!e.site_visit_id || !e.api_method) {
                                appendJSONL(invalidFile, { error: "Schema Violation", event: e });
                            } else {
                                appendJSONL(eventsFile, e);
                            }
                        });
                    }
                } catch (e) {
                    console.error("Telemetry Parse Error:", e);
                }
            }
        });

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000)); // Dwell time

            // Generate some events if page is quiet
            await page.evaluate(() => {
                const c = document.createElement('canvas');
                c.toDataURL();
            });

            // DEBUG: Check injection status
            const injected = await page.evaluate(() => window.__PAL_CHECK);
            console.log(`[CRAWLER DEBUG] ${url} Injected: ${injected}`);

        } catch (e) {
            console.error(`Error visiting ${url}:`, e.message);
            appendJSONL(visitsFile, {
                type: "VisitError",
                site_visit_id: visitId,
                error: e.message
            });
        } finally {
            await page.close();
        }

        // Visit End
        appendJSONL(visitsFile, {
            type: "VisitEnd",
            site_visit_id: visitId,
            timestamp: Date.now(),
            status: "success"
        });

        completed++;
    }

    // Update Meta with End Time
    meta.end_time = new Date().toISOString();
    meta.url_count_completed = completed;
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    await browser.close();
    console.log("Crawl Complete.");

})();
