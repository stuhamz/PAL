const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Configuration ---
const SITES_FILE = path.join(__dirname, 'sites_structured.json');
const EXTENSION_PATH = path.resolve(__dirname, '../');
const RESEARCH_PROBE_PATH = path.join(__dirname, 'research_probe.js');
const DATA_DIR = path.resolve(__dirname, '../data/runs');

// --- Experimental Design ---
const TARGET_COUNT = 3; // Demo Mode: 3 Sites (Change to 100 for full run)
const EPOCHS = 3;
const MODES = ['vanilla', 'compat', 'privacy'];

// --- Run Identity ---
const RUN_ID = crypto.randomUUID();
const RUN_DIR = path.join(DATA_DIR, RUN_ID);
if (!fs.existsSync(RUN_DIR)) fs.mkdirSync(RUN_DIR, { recursive: true });

const EVENTS_FILE = path.join(RUN_DIR, `run_${RUN_ID}.jsonl`);

// --- Helpers ---
function appendJSONL(data) {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(data) + '\n');
}

(async () => {
    console.log(`Starting Research Crawl ${RUN_ID}`);

    // 1. Load Sites
    const sitesRaw = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
    const urls = sitesRaw.slice(0, TARGET_COUNT).map(s => s.url);

    // 2. Iterate Modes
    for (const mode of MODES) {
        console.log(`\n=== MODE: ${mode.toUpperCase()} ===`);

        // Launch Browser for this Mode (Fresh Profile per Mode/Epoch usually, 
        // but Protocol says Epoch 2 = Return Session. 
        // We will simulate return via Persona persistence if using extension, 
        // or UserDataDir persistence. 
        // For simplicity & robustness: Fresh Browser per Epoch, injecting same Persona ID for 'Return' logic.

        for (let epoch = 1; epoch <= EPOCHS; epoch++) {
            console.log(`  -- Epoch ${epoch} --`);

            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ];

            if (mode !== 'vanilla') {
                launchArgs.push(`--disable-extensions-except=${EXTENSION_PATH}`);
                launchArgs.push(`--load-extension=${EXTENSION_PATH}`);
            }

            const browser = await puppeteer.launch({
                headless: false, // Visual verify
                args: launchArgs
            });

            // 3. Iterate Sites
            for (const url of urls) {
                const visitId = crypto.randomUUID();
                const contextId = crypto.randomUUID(); // Persona ID for this site/mode sequence
                // NOTE: If Epoch 2 is "Return", we should reuse contextId from Epoch 1?
                // User Requirement: "Epoch 2: Return session... Epoch 3: Long-term return"
                // Implies Identity Persistence.
                // We will reuse a stable persona_id for (Site + Mode).
                // But for "Unlinkability" (Privacy Mode), PAL *should* rotate anyway if configured?
                // Actually, Privacy mode rotates persona ON EVERY VISIT or SESSION.
                // Compat mode keeps it.
                // We inject a STABLE persona_id into the config, and let PAL decide to rotate or not based on Logic.
                // Wait, prehook takes config.persona_id. If we pass stable, PAL uses stable.
                // To test Unlinkability, we verify that even if we pass Stable Persona (simulating same user), 
                // Privacy Mode's NOISE makes it unlinkable. 
                // OR: Privacy Mode logic *inside* PAL rotates the visual persona.

                // Let's stick to the protocol:
                // We pass `epoch_id`.
                // We pass a persistent `persona_id` (The "Real User").

                const persistentPersona = crypto.createHash('sha256').update(url + mode).digest('hex').substring(0, 12);

                try {
                    const page = await browser.newPage();

                    // Inject Config (Compat/Privacy only)
                    if (mode !== 'vanilla') {
                        const config = {
                            run_id: RUN_ID,
                            mode: mode,
                            epoch_id: epoch,
                            persona_id: persistentPersona, // Same user returning
                            top_level_site: new URL(url).hostname
                        };
                        await page.evaluateOnNewDocument((c) => {
                            window.__PAL_CONFIG = c;
                        }, config);
                    }

                    // Log Collection
                    page.on('console', msg => {
                        const txt = msg.text();
                        if (txt.startsWith('__PAL_TELEM__:')) {
                            const events = JSON.parse(txt.replace('__PAL_TELEM__:', ''));
                            events.forEach(e => {
                                // Enrich
                                e.mode = mode;
                                e.epoch = epoch;
                                e.url = url;
                                appendJSONL(e);
                            });
                        }
                    });

                    // Navigate
                    console.log(`     Visiting ${url}...`);
                    await page.goto(url, { waitUntil: 'networkidle2' });

                    // Inject Probe
                    const probeSrc = fs.readFileSync(RESEARCH_PROBE_PATH, 'utf8');
                    await page.evaluate(probeSrc);

                    await new Promise(r => setTimeout(r, 2000)); // Wait for iframe/worker

                    await page.close();

                } catch (e) {
                    console.error(`     Error: ${e.message}`);
                    appendJSONL({ type: 'error', msg: e.message, mode, epoch, url });
                }
            }

            await browser.close();
        }
    }

    console.log("Research Crawl Complete.");
})();
