
const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../');

(async () => {
    console.log("Launching Debug Browser...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox'
        ]
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log("Navigating to example.com...");
    await page.goto('https://example.com/', { waitUntil: 'networkidle2' });

    // Inject logic to check window.__PAL_STATS
    await new Promise(r => setTimeout(r, 2000));

    const stats = await page.evaluate(() => {
        return window.__PAL_STATS && window.__PAL_STATS.realm && window.__PAL_STATS.realm.timings;
    });

    console.log("TIMINGS DUMP:");
    console.log(JSON.stringify(stats, null, 2));

    await browser.close();
})();
