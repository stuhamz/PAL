const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../');

(async () => {
    console.log('Starting Standardized Tests...');
    const browser = await puppeteer.launch({
        headless: false, // Must be false for extension to work properly
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const context = browser.defaultBrowserContext();

    // Helper: Take Screenshot
    async function capture(page, name) {
        const p = path.join(__dirname, `screenshot_${name}.png`);
        await page.screenshot({ path: p, fullPage: true });
        console.log(`Captured: ${name}`);
    }

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // 1. BrowserLeaks Canvas
        console.log('Testing: browserleaks.com/canvas');
        await page.goto('https://browserleaks.com/canvas', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000)); // Wait for render
        await capture(page, 'browserleaks_canvas');

        // Extract Signature
        const canvasSig = await page.evaluate(() => {
            return document.querySelector('#crc')?.innerText || 'Unknown';
        });
        console.log(`Canvas Signature: ${canvasSig}`);

        // 2. BrowserLeaks WebGL
        console.log('Testing: browserleaks.com/webgl');
        await page.goto('https://browserleaks.com/webgl', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));
        await capture(page, 'browserleaks_webgl');

        const webglVendor = await page.evaluate(() => {
            return document.querySelector('#wl_unmasked_vendor')?.innerText || 'Unknown';
        });
        console.log(`WebGL Vendor: ${webglVendor}`);

        // 3. AmiUnique
        console.log('Testing: amiunique.org/fp');
        await page.goto('https://amiunique.org/fp', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000)); // Heavy calculation
        await capture(page, 'amiunique');

    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        await browser.close();
        console.log('Tests Completed.');
    }
})();
