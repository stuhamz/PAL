
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
    await page.goto('https://example.com/', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    const result = await page.evaluate(() => {
        const out = {
            cache: null,
            probe: {}
        };

        // 1. Snapshot Cache
        if (window.__PAL_CACHE__ && window.__PAL_CACHE__.webgl) {
            out.cache = window.__PAL_CACHE__.webgl;
        } else {
            out.cache = 'MISSING_OR_EMPTY';
        }

        // 2. Run Probe
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (gl) {
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                if (ext) {
                    out.probe.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
                    out.probe.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
                } else {
                    out.probe.error = "No Extension";
                }
            } else {
                out.probe.error = "No WebGL";
            }
        } catch (e) {
            out.probe.error = e.message;
        }

        return out;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})();
