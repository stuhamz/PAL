
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// CONFIG
const EXTENSION_PATH = path.resolve(__dirname, '../');
const inputFilename = process.argv[2];
const outputFilename = process.argv[3];
const INPUT_FILE = inputFilename ? path.resolve(process.cwd(), inputFilename) : path.resolve(__dirname, 'sites.json');
const OUTPUT_FILE = outputFilename ? path.resolve(process.cwd(), outputFilename) : path.resolve(__dirname, 'research_events.jsonl');
const RUN_ID = crypto.randomUUID();

// Event Stream Setup
const stream = fs.createWriteStream(OUTPUT_FILE, { flags: 'a' });
function logEvent(event) {
    stream.write(JSON.stringify(event) + '\n');
}

const UA_STRING = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

(async () => {
    console.log(`[RESEARCH] Starting Phase 8 Collection (RunID: ${RUN_ID})`);
    console.log(`[OUTPUT] Streaming events to: ${OUTPUT_FILE}`);

    // 0. Load Targets
    let SITES = [];
    try {
        if (!fs.existsSync(INPUT_FILE)) require('./generate_targets.js');
        SITES = JSON.parse(fs.readFileSync(INPUT_FILE));
    } catch (e) {
        console.error("Failed to load sites:", e);
        process.exit(1);
    }
    console.log(`[INIT] Loaded ${SITES.length} targets.`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            `--user-agent=${UA_STRING}`
        ]
    });

    // HELPER: Collect Page Data
    async function collectPageData(site, mode, attemptId = 0) {
        const url = site.url;
        let page;
        try {
            page = await browser.newPage();
            page.setDefaultNavigationTimeout(45000);
        } catch (e) { return; }

        // A. Inject Configuration (Push run_id)
        await page.evaluateOnNewDocument((cfg, forcedSeed) => {
            window.__PAL_CONFIG = cfg;
            if (forcedSeed) {
                window.__PAL_CACHE__ = { seed: forcedSeed };
                sessionStorage.setItem('__PAL_CACHE__', JSON.stringify(window.__PAL_CACHE__));
            }
        }, {
            mode: mode,
            run_id: RUN_ID,
            epoch: attemptId,
            policy_scope: 'site'
        }, site.seed || null);

        // B. Listeners (Scrape Telemetry)
        page.on('console', msg => {
            const text = msg.text();
            if (text.startsWith('__PAL_TELEM__:')) {
                try {
                    const jsonStr = text.substring(14);
                    const batch = JSON.parse(jsonStr);
                    batch.forEach(evt => {
                        // Patch missing fields from Crawler side context if needed
                        evt.crawled_url = url;
                        evt.mode = mode;
                        evt.config_id = site.id || "unknown"; // Track Config ID
                        logEvent(evt);
                    });
                } catch (e) { }
            }
        });

        // C. Visit
        try {
            await page.goto(url, { waitUntil: 'networkidle2' });

            // Wait for probes/activity
            await new Promise(r => setTimeout(r, 2000));

            // Scroll to trigger lazy loads
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            logEvent({
                run_id: RUN_ID,
                top_level_site: new URL(url).hostname,
                api_name: "CRAWL_ERROR",
                error_flag: true,
                raw_output_sample: e.message,
                timing_ms: 0,
                surface_name: "SYSTEM"
            });
        }

        await page.close();
    }

    // MAIN LOOP
    for (const site of SITES) {
        const url = site.url;
        console.log(`[CRAWL] Processing: ${url}`);

        // PASS 1: MONITOR (Skip if part of Sticky Test)
        if (!site.seed) {
            await collectPageData(site, 'MONITOR', 0);
        }

        // PASS 2: PROTECT
        await collectPageData(site, 'PROTECT', 0);
    }

    await browser.close();
    stream.end();
    console.log(`[RESEARCH] Complete.`);

})();
