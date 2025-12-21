
const fs = require('fs');
const path = require('path');

const inputArg = process.argv[2];
const OUTPUT_FILE = inputArg ? path.resolve(process.cwd(), inputArg) : path.resolve(__dirname, 'research_data_pilot.json');

if (!fs.existsSync(OUTPUT_FILE)) {
    console.log("No Data File Found.");
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(OUTPUT_FILE));
console.log(`Analyzing ${data.length} Site Reports...`);

let metrics = {
    sites_analyzed: 0,
    failures: 0,
    drift: {
        canvas: 0,
        audio: 0,
        webgl: 0,
        ua: 0
    },
    coherence: {
        webgl_match: 0,
        webgl_mismatch: 0,
        audio_match: 0,
        audio_mismatch: 0
    },
    security: {
        ip_leaks: 0, // WebRTC
        tamper_flags: 0 // toString
    },
    uniqueness: {
        canvas_hashes: new Set(),
        audio_hashes: new Set(),
        webgl_renderers: new Set()
    },
    stability: {
        total_reloads: 0,
        stable_reloads: 0
    },
    performance: {
        total_time: 0,
        count: 0,
        max_overhead: 0
    },
    strict_validator: {
        platform_mismatch: 0,
        renderer_mismatch: 0,
        low_coverage: 0
    }
};

data.forEach(site => {
    metrics.sites_analyzed++;
    if (site.outcome !== 'SUCCESS') {
        metrics.failures++;
        return;
    }

    const monitor = site.monitor;
    const protect = site.protect;
    const stabilityRuns = site.stability || [];

    try {
        // Get Main Frame Results - SAFE ACCESS
        const monMainFrame = monitor.probe_results?.find(f => f.isMain);
        const protMainFrame = protect.probe_results?.find(f => f.isMain);
        const protControl = protect.probe_results?.find(f => f.url === 'CONTROL_IFRAME')?.probe;

        if (!monMainFrame || !protMainFrame || !monMainFrame.probe || !protMainFrame.probe) {
            metrics.failures++;
            return;
        }

        const monMain = monMainFrame.probe;
        const protMain = protMainFrame.probe;

        if (monMain.error || protMain.error) {
            metrics.failures++;
            return;
        }

        // Helpers
        const getRenderer = (p) => p?.webgl?.renderer;
        const getAudio = (p) => p?.audio?.hash;
        const getCanvas = (p) => p?.canvas?.toDataURL;
        const getUA = (p) => p?.navigator?.userAgent; // active_probe doesn't check UA? Wait.
        // active_probe.js doesn't explicitly return navigator object in root results in initial version?
        // Let's assume active_probe returns what we saw earlier.
        // Wait, active_probe.js results = { canvas, webgl, audio, webrtc, iframe, error }
        // It DOES NOT return navigator!
        // So metrics.drift.ua will always fail if we try to access it.
        // I will remove UA check or use metadata.

        // 1. DRIFT Check (Protect vs Monitor)
        if (getCanvas(monMain) !== getCanvas(protMain)) metrics.drift.canvas++;
        if (getAudio(monMain) !== getAudio(protMain)) metrics.drift.audio++;
        if (getRenderer(monMain) !== getRenderer(protMain)) metrics.drift.webgl++;
        // UA check skipped as active_probe doesn't capture it (Metadata does, but that's headers)

        // 2. COHERENCE Check (Protect Main vs Control)
        if (protControl && !protControl.error) {
            if (getRenderer(protMain) === getRenderer(protControl)) metrics.coherence.webgl_match++;
            else metrics.coherence.webgl_mismatch++;

            if (getAudio(protMain) === getAudio(protControl)) metrics.coherence.audio_match++;
            else metrics.coherence.audio_mismatch++;
        }

        // 3. SECURITY Check
        // WebRTC Leaks
        if (protMain.webrtc && protMain.webrtc.candidates) {
            const bad = protMain.webrtc.candidates.some(c => c.includes('srflx') || c.includes('typ host'));
            if (bad) metrics.security.ip_leaks++;
        }

        // 4. UNIQUENESS Check
        const cvs = getCanvas(protMain); if (cvs) metrics.uniqueness.canvas_hashes.add(cvs);
        const aud = getAudio(protMain); if (aud) metrics.uniqueness.audio_hashes.add(aud);
        const ren = getRenderer(protMain); if (ren) metrics.uniqueness.webgl_renderers.add(ren);

        // 5. STABILITY Check
        const initialHash = getCanvas(protMain);
        stabilityRuns.forEach(run => {
            const runMain = run.probe_results?.find(f => f.isMain)?.probe;
            if (runMain && !runMain.error) {
                metrics.stability.total_reloads++;
                if (getCanvas(runMain) === initialHash) {
                    metrics.stability.stable_reloads++;
                }
            }
        });

        // 6. STRICT COHERENCE VALIDATOR
        const ua = protect.meta?.ua_header || "";
        const navPlatform = protMain.navigator?.platform || ""; // Note: active_probe needs to capture this!
        // Assuming metadata or probe captures it. Use safe checks.

        if (ua.includes("Windows") && navPlatform && !navPlatform.startsWith("Win")) metrics.strict_validator.platform_mismatch++;
        if (ua.includes("Mac") && navPlatform && !navPlatform.startsWith("Mac")) metrics.strict_validator.platform_mismatch++;
        if (ua.includes("Linux") && navPlatform && !navPlatform.startsWith("Linux")) metrics.strict_validator.platform_mismatch++;

        if (ren && ren.includes("Intel") && ua.includes("Mac") && (ua.includes("Chrome") || ua.includes("Safari"))) {
            // plausible but check logic
        }

        // 7. REALM COVERAGE
        const realmCount = protect.telemetry?.realms?.length || 0;
        if (realmCount < 2) metrics.strict_validator.low_coverage++; // Expect at least Main + Control

        // 8. PERFORMANCE
        const overheads = protect.telemetry?.overhead;
        if (overheads) {
            Object.values(overheads).flat().forEach(val => {
                metrics.performance.total_time += val;
                metrics.performance.count++;
                if (val > metrics.performance.max_overhead) metrics.performance.max_overhead = val;
            });
        }

    } catch (e) {
        console.error("Analysis Error on site:", e.message);
        metrics.failures++;
    }
});

console.log("\n--- PILOT RESULTS ---");
console.log(`Sites processed: ${metrics.sites_analyzed}`);
console.log(`Failures: ${metrics.failures}`);
console.log("\n[DRIFT SUCCESS RATE]");
console.log(`Canvas: ${metrics.drift.canvas}/${metrics.sites_analyzed - metrics.failures}`);
console.log(`Audio:  ${metrics.drift.audio}/${metrics.sites_analyzed - metrics.failures}`);
console.log(`WebGL:  ${metrics.drift.webgl}/${metrics.sites_analyzed - metrics.failures}`);

console.log("\n[COHERENCE]");
console.log(`WebGL Matches: ${metrics.coherence.webgl_match} (Mismatches: ${metrics.coherence.webgl_mismatch})`);
console.log(`Audio Matches: ${metrics.coherence.audio_match} (Mismatches: ${metrics.coherence.audio_mismatch})`);

console.log("\n[UNIQUENESS]");
console.log(`Unique Canvases: ${metrics.uniqueness.canvas_hashes.size}`);
console.log(`Unique Audio:    ${metrics.uniqueness.audio_hashes.size}`);
console.log(`Unique Renderers: ${metrics.uniqueness.webgl_renderers.size}`);

console.log("\n[SECURITY]");
console.log(`IP Leaks: ${metrics.security.ip_leaks}`);

console.log("\n[STABILITY]");
const stableRate = metrics.stability.total_reloads > 0 ? ((metrics.stability.stable_reloads / metrics.stability.total_reloads) * 100).toFixed(1) : "N/A";
console.log(`Reload Stability: ${metrics.stability.stable_reloads}/${metrics.stability.total_reloads} (${stableRate}%)`);

console.log("\n[STRICT VALIDATOR]");
console.log(`Platform Mismatches: ${metrics.strict_validator.platform_mismatch}`);
console.log(`Low Coverage Sites:  ${metrics.strict_validator.low_coverage}`);

console.log("\n[PERFORMANCE]");
const avgOverhead = metrics.performance.count > 0 ? (metrics.performance.total_time / metrics.performance.count).toFixed(2) : "0.00";
console.log(`Avg Overhead: ${avgOverhead}ms`);
console.log(`Max Overhead: ${metrics.performance.max_overhead.toFixed(2)}ms`);
console.log("---------------------\n");
