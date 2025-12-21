const fs = require('fs');
const readline = require('readline');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
    console.error("Usage: node analyze_results.js <path_to_jsonl>");
    process.exit(1);
}

const stats = {
    vectors: [],
    errors: [],
    sites: new Set(),
    modes: new Set(),
    epochs: new Set(),
    contexts: new Set()
};

async function processLineByLine() {
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const rec = JSON.parse(line);

            // Track Corpus
            if (rec.url) {
                try {
                    const host = new URL(rec.url).hostname;
                    stats.sites.add(host);
                } catch (e) { }
            }
            if (rec.mode) stats.modes.add(rec.mode);
            if (rec.epoch) stats.epochs.add(rec.epoch);
            if (rec.context) stats.contexts.add(rec.context);

            if (rec.event_type === 'fingerprint_vector') {
                stats.vectors.push(rec);
            } else if (['error', 'unhandledrejection', 'csp_violation'].includes(rec.event_type) || rec.type === 'error') {
                stats.errors.push(rec);
            }
        } catch (e) {
            // ignore bad lines
        }
    }

    analyze();
}

function analyze() {
    console.log("1. Corpus summary");
    console.log(`Sites: ${stats.sites.size}`);
    console.log(`Modes: ${Array.from(stats.modes).sort().join(', ')}`);
    console.log(`Epochs: ${stats.epochs.size}`);
    console.log(`Contexts: ${Array.from(stats.contexts).sort().join(', ')}`);
    console.log(`Total Vectors: ${stats.vectors.length}`);
    console.log("\n");

    // --- Helper to Group ---
    // keyFn => items
    const groupBy = (arr, keyFn) => {
        const map = new Map();
        for (const item of arr) {
            const key = keyFn(item);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(item);
        }
        return map;
    };

    // --- 2. Drift Data ---
    // Group by Surface, Mode, Context
    // Surfaces to check:
    const surfaces = {
        'Canvas': v => v.components?.canvas_imagedata_hash || v.canvas_hash,
        'WebGL': v => v.components?.webgl_hash || v.webgl_hash,
        'Audio': v => v.components?.audio_hash || v.audio_hash,
        'Navigator': v => v.components?.nav_hash || v.nav_hash,
        'Screen': v => v.components?.screen_hash || v.screen_hash,
        'Intl': v => v.components?.intl_hash || v.intl_hash
    };

    console.log("2. DRIFT DATA");
    console.log("DRIFT_RATES:");

    for (const [surfName, hashFn] of Object.entries(surfaces)) {
        console.log(`\n${surfName}:`);
        for (const context of ['top', 'iframe', 'worker']) {
            const lineParts = [];
            for (const mode of ['vanilla', 'compat', 'privacy']) {
                // Get all site-groups for this mode/context
                // We need to calc drift per site, then average it
                const relevant = stats.vectors.filter(v => v.mode === mode && v.context === context);
                const bySite = groupBy(relevant, v => new URL(v.url).hostname);

                let totalPairs = 0;
                let diffPairs = 0;

                for (const [site, vecs] of bySite.entries()) {
                    // Sort by epoch
                    vecs.sort((a, b) => a.epoch - b.epoch);
                    // Pairs: (1,2), (2,3), (1,3)...
                    for (let i = 0; i < vecs.length; i++) {
                        for (let j = i + 1; j < vecs.length; j++) {
                            const h1 = hashFn(vecs[i]);
                            const h2 = hashFn(vecs[j]);
                            if (h1 && h2) {
                                totalPairs++;
                                if (h1 !== h2) diffPairs++;
                            }
                        }
                    }
                }

                const rate = totalPairs > 0 ? (diffPairs / totalPairs).toFixed(2) : "N/A";
                lineParts.push(`${mode.charAt(0).toUpperCase() + mode.slice(1)}=${rate}`);
            }
            console.log(`  ${context.charAt(0).toUpperCase() + context.slice(1)}:     ${lineParts.join(', ')}`);
        }
    }
    console.log("\n");

    // --- 3. Cross-Context Consistency ---
    console.log("3. CROSS-CONTEXT CONSISTENCY DATA");
    console.log("CONSISTENCY_RATES:");

    // For each surface, mode
    // Fraction of site-epoch cases where top == iframe == worker
    for (const [surfName, hashFn] of Object.entries(surfaces)) {
        if (surfName === 'Intl') continue; // Optional
        console.log(`\n${surfName}:`);

        for (const mode of ['vanilla', 'compat', 'privacy']) {
            // Group by Site+Epoch
            const relevant = stats.vectors.filter(v => v.mode === mode);
            const bySiteEpoch = groupBy(relevant, v => `${new URL(v.url).hostname}__${v.epoch}`);

            let consistentCount = 0;
            let totalCount = 0;

            for (const [key, vecs] of bySiteEpoch.entries()) {
                const top = vecs.find(v => v.context === 'top');
                const iframe = vecs.find(v => v.context === 'iframe');
                const worker = vecs.find(v => v.context === 'worker');

                if (top && iframe && worker) {
                    const h1 = hashFn(top);
                    const h2 = hashFn(iframe);
                    const h3 = hashFn(worker);
                    // Only count if hashes exist
                    if (h1 && h2 && h3) {
                        totalCount++;
                        if (h1 === h2 && h2 === h3) consistentCount++;
                    }
                }
            }
            const rate = totalCount > 0 ? (consistentCount / totalCount).toFixed(2) : "N/A";
            console.log(`  ${mode.charAt(0).toUpperCase() + mode.slice(1)}=${rate}`);
        }
    }
    console.log("\n");

    // --- 4. Composite Linkability ---
    console.log("4. COMPOSITE LINKABILITY DATA");
    console.log("LINKABILITY:");

    // Composite = Join all hashes
    // Fraction of epoch-pairs with IDENTICAL composite
    const getComposite = (v) => {
        return [
            v.components?.canvas_imagedata_hash,
            v.components?.webgl_hash,
            v.components?.audio_hash,
            v.components?.nav_hash,
            v.components?.screen_hash
        ].join('|');
    };

    for (const context of ['top', 'iframe', 'worker']) {
        console.log(`\n${context.charAt(0).toUpperCase() + context.slice(1)}:`);
        for (const mode of ['vanilla', 'compat', 'privacy']) {
            const relevant = stats.vectors.filter(v => v.mode === mode && v.context === context);
            const bySite = groupBy(relevant, v => new URL(v.url).hostname);

            let totalPairs = 0;
            let identicalPairs = 0;

            for (const [site, vecs] of bySite.entries()) {
                vecs.sort((a, b) => a.epoch - b.epoch);
                for (let i = 0; i < vecs.length; i++) {
                    for (let j = i + 1; j < vecs.length; j++) {
                        totalPairs++;
                        if (getComposite(vecs[i]) === getComposite(vecs[j])) identicalPairs++;
                    }
                }
            }
            const rate = totalPairs > 0 ? (identicalPairs / totalPairs).toFixed(2) : "N/A";
            console.log(`  ${mode.charAt(0).toUpperCase() + mode.slice(1)}=${rate}`);
        }
    }
    console.log("\n");

    // --- 5. Breakage Data ---
    console.log("5. BREAKAGE DATA");
    console.log("BREAKAGE:");

    for (const mode of ['vanilla', 'compat', 'privacy']) {
        const modeErrors = stats.errors.filter(e => e.mode === mode);
        const errorEvents = modeErrors.filter(e => e.event_type === 'error' || e.type === 'error').length;
        const unhandled = modeErrors.filter(e => e.event_type === 'unhandledrejection').length;
        const csp = modeErrors.filter(e => e.event_type === 'csp_violation').length;

        const uniqueSites = new Set(modeErrors.map(e => {
            try { return new URL(e.url || e.blocked_url).hostname } catch (x) { return 'unknown' }
        })).size;

        console.log(`\n${mode.charAt(0).toUpperCase() + mode.slice(1)}:`);
        console.log(`  Error events: ${errorEvents}`);
        console.log(`  Unhandled rejections: ${unhandled}`);
        console.log(`  CSP violations: ${csp}`);
        console.log(`  Sites with any breakage: ${uniqueSites} / ${stats.sites.size}`);
    }
    console.log("\n");

    // --- 6. Timing ---
    console.log("6. TIMING / OVERHEAD DATA");
    console.log("TIMING_MS:");

    // Mean + StdDev per mode/context
    const calcStats = (arr) => {
        if (!arr.length) return { mean: 0, std: 0 };
        const sum = arr.reduce((a, b) => a + b, 0);
        const mean = sum / arr.length;
        const sqDiffs = arr.map(x => Math.pow(x - mean, 2));
        const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / arr.length;
        const std = Math.sqrt(avgSqDiff);
        return { mean: mean.toFixed(1), std: std.toFixed(1) };
    };

    for (const context of ['top', 'iframe', 'worker']) {
        console.log(`\n${context.charAt(0).toUpperCase() + context.slice(1)}:`);
        for (const mode of ['vanilla', 'compat', 'privacy']) {
            const relevant = stats.vectors.filter(v => v.mode === mode && v.context === context && v.timings);
            const times = relevant.map(v => v.timings);
            const s = calcStats(times);
            console.log(`  ${mode.charAt(0).toUpperCase() + mode.slice(1)}: mean=${s.mean}, std=${s.std}`);
        }
    }
}

processLineByLine();
