
const puppeteer = require('puppeteer');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, '../');

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox'
        ]
    });

    const page = await browser.newPage();
    const testUrl = 'file:///' + path.resolve(__dirname, 'worker_test.html');

    console.log("Navigating to: " + testUrl);
    await page.goto(testUrl, { waitUntil: 'networkidle0' });

    // Wait for worker results
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
        return {
            worker: window.WORKER_RESULT,
            offscreen: window.OFFSCREEN_RESULT,
            ua: navigator.userAgent
        };
    });

    console.log("VERIFICATION RESULT:");
    console.log(JSON.stringify(result, null, 2));

    await browser.close();
})();
