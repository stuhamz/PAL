const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../');

(async () => {
    console.log("Starting V2 Verification...");
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox'
        ]
    });

    const page = await browser.newPage();

    // Inject Mock Config
    await page.evaluateOnNewDocument(() => {
        window.__PAL_CONFIG = {
            mode: 'privacy',
            run_id: 'test-v2-run-' + Date.now(),
            site_visit_id: 'visit-' + Date.now(),
            top_level_site: 'browserleaks.com'
        };
    });

    let eventCount = 0;
    page.on('console', msg => {
        if (msg.text().startsWith('__PAL_TELEM__:')) {
            const raw = JSON.parse(msg.text().replace('__PAL_TELEM__:', ''));
            raw.forEach(e => {
                eventCount++;
                console.log("Event:", JSON.stringify(e, null, 2));

                // Quick internal check
                if (!e.persona_id) console.error("FAIL: Missing Persona ID");
                if (!e.output_hash && !e.error_flag) console.warn("WARN: No Hash and No Error");
            });
        }
    });

    await page.goto('https://browserleaks.com/canvas', { waitUntil: 'networkidle2' });

    console.log(`Captured ${eventCount} events.`);
    await browser.close();
})();
