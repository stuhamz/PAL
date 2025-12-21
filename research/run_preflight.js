
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../src');
const PREFLIGHT_HTML = 'file://' + path.resolve(__dirname, 'preflight.html');
const PROBE_CODE = fs.readFileSync(path.resolve(__dirname, 'preflight_probe.js'), 'utf8');

(async () => {
    // Launch with Extension
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();

    // Inject Persona (using our debug helper or relying on Prehook)
    // We rely on Prehook + PolicyManager (which handles file:// now).

    console.log("Navigating to:", PREFLIGHT_HTML);
    await page.goto(PREFLIGHT_HTML, { waitUntil: 'networkidle0' });

    // Give time for iframes to load and extension to hook
    await new Promise(r => setTimeout(r, 2000));

    const frames = page.frames();
    console.log(`Found ${frames.length} frames.`);

    const results = [];

    for (const frame of frames) {
        let frameName = frame.name() || frame.url() || 'main';
        if (frameName === 'about:blank') frameName = 'about:blank-frame';

        console.log(`Probing Frame: ${frameName}`);

        // Run Stability Check here: Probe 10 times
        try {
            const sample1 = await frame.evaluate(PROBE_CODE);

            // 10x Loop for Stability
            let stable = true;
            for (let i = 0; i < 10; i++) {
                const sampleN = await frame.evaluate(PROBE_CODE);
                if (JSON.stringify(sample1) !== JSON.stringify(sampleN)) {
                    stable = false;
                    console.error(`STABILITY FAIL in ${frameName}: Run ${i} differs.`);
                }
            }

            sample1._stability_pass = stable;
            sample1._frame_name = frameName;
            results.push(sample1);

        } catch (e) {
            console.error(`Probe error in ${frameName}:`, e.message);
            results.push({ _frame_name: frameName, error: e.message });
        }
    }

    console.log("--- RESULTS ---");
    console.log(JSON.stringify(results, null, 2));

    await browser.close();

    // verdict analysis
    analyzeVerdict(results);

})();

function analyzeVerdict(results) {
    let fail = false;
    results.forEach(r => {
        if (r.error) {
            console.log(`FAIL: Frame ${r._frame_name} errored.`);
            fail = true;
            return;
        }

        // Coverage
        if (r.webgl.renderer === 'unavailable' || !r.audio) {
            // For Cross Origin, if it's "example.com", we expect hooks to work or be blocked?
            // Since we injected probe via Puppeteer, we expect RESULTS.
            // If hooks failed, we see Native.
            // Check against Native? (Hard without baseline).
            // But 'unavailable' suggests probe crash.
            console.log(`FAIL: Frame ${r._frame_name} returned incomplete data.`);
            fail = true;
        }

        // Check Stability
        if (!r._stability_pass) {
            console.log(`FAIL: Frame ${r._frame_name} unstable.`);
            fail = true;
        }

        // Check Coherence
        const renderer = r.webgl.renderer || "";
        const platform = r.navigator.platform || "";
        const ua = r.navigator.userAgent || "";

        if (renderer.includes("Apple")) {
            if (!platform.includes("Mac") && !ua.includes("Mac")) {
                console.log(`COHERENCE FAIL: Apple Renderer on Non-Mac Platform/UA. (${platform})`);
                fail = true;
            }
        } else if (renderer.includes("Intel") || renderer.includes("NVIDIA")) {
            // Expect Windows generally (for our blueprints)
            if (platform.includes("Mac")) {
                console.log(`COHERENCE FAIL: PC Renderer on Mac Platform. (${platform})`);
                fail = true;
            }
        }

        // Check WebRTC
        if (r.webrtc && r.webrtc.leaks) {
            console.log(`FAIL: Frame ${r._frame_name} leaking Public IP or Host/IPv6 Candidate.`);
            fail = true;
        }

        // Check Tamper
        if (r.tamper) {
            if (!r.tamper.toString_native) {
                console.log(`FAIL: Frame ${r._frame_name} failed toString check.`);
                fail = true;
            }
        }
    });

    if (!fail) console.log("PREFLIGHT VERDICT: PASS");
    else console.log("PREFLIGHT VERDICT: FAIL");
}
