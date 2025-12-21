// Research Grade Analysis
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const RUNS_DIR = path.resolve(__dirname, '../data/runs');
const latestRun = fs.readdirSync(RUNS_DIR)
    .map(name => ({ name, time: fs.statSync(path.join(RUNS_DIR, name)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time)[0].name;

const RUN_ID = process.argv[2] || latestRun;
const EVENTS_FILE = path.join(RUNS_DIR, RUN_ID, `run_${RUN_ID}.jsonl`);

// Output to file
const reportPath = path.join(__dirname, 'analysis_report_clean.txt');
let logBuffer = "";
function log(msg) {
    console.log(msg);
    logBuffer += msg + "\n";
}

log(`Analyzing Research Run: ${RUN_ID}`);

if (!fs.existsSync(EVENTS_FILE)) {
    console.error("Events file not found:", EVENTS_FILE);
    process.exit(1);
}

const content = fs.readFileSync(EVENTS_FILE, 'utf8');
const lines = content.split('\n');

const vectors = [];
const apiCalls = [];

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const e = JSON.parse(line);
        if (e.event_type === 'fingerprint_vector') {
            vectors.push(e);
        } else if (e.event_type === 'api_call') {
            apiCalls.push(e);
        }
    } catch (e) { }
}

log(`Captured ${vectors.length} fingerprint vectors.`);

// --- Requirement 1: 27 Vectors (1 Site * 3 Epochs * 3 Modes * 3 Contexts) ---
// Note: Vanilla mode might not produce API calls in prehook, BUT Probe injects logs manually.
// Wait, `research_probe.js` emits `__PAL_TELEM__`.
// So we expect 27 vectors.

const expected = 1 * 3 * 3 * 3;
log(`Expected: ${expected} vectors.`);

const counts = {}; // mode -> epoch -> context -> count

for (const v of vectors) {
    // We need to know mode/epoch. Enriched by crawler.
    const mode = v.mode || 'unknown';
    const epoch = v.epoch || 'unknown';
    const ctx = v.context || 'unknown';

    if (!counts[mode]) counts[mode] = {};
    if (!counts[mode][epoch]) counts[mode][epoch] = {};
    if (!counts[mode][epoch][ctx]) counts[mode][epoch][ctx] = 0;
    counts[mode][epoch][ctx]++;
}

// Print Matrix
let missing = 0;
const modes = ['vanilla', 'compat', 'privacy'];
const contexts = ['top', 'iframe', 'worker'];

for (const m of modes) {
    for (let ep = 1; ep <= 3; ep++) {
        for (const ctx of contexts) {
            const c = (counts[m] && counts[m][ep]) ? (counts[m][ep][ctx] || 0) : 0;
            if (c === 0) {
                log(`[MISSING] Mode=${m} Epoch=${ep} Context=${ctx}`);
                missing++;
            }
        }
    }
}

if (missing === 0) {
    log("SUCCESS: All 27 Contexts Covered.");
} else {
    log(`WARNING: Missing ${missing} contexts.`);
}

// --- Requirement 2: Schema Compliance ---
// Check sample API calls for mandatory fields
log("\n--- Schema Check ---");
let schemaFail = 0;
for (const e of apiCalls) {
    // Only check our strict fields
    if (!e.output_hash) {
        log(`[SCHEMA FAIL] Missing output_hash: ${e.api_name}`);
        schemaFail++;
    }
    // Check criticals for raw_output
    if (['Canvas', 'WebGL', 'AudioBuffer'].includes(e.surface_name)) {
        if (e.raw_output_sample === undefined) { // Validation logic said we might null it, but key must exist?
            // Prehook sets it to null or string. undefined means key missing.
            log(`[SCHEMA FAIL] Missing raw_output_sample key: ${e.api_name}`);
            schemaFail++;
        }
    }
}

if (schemaFail === 0) {
    log("SUCCESS: Schema Compliance Verified.");
} else {
    log(`WARNING: ${schemaFail} events failed schema check.`);
}

// --- Requirement 3: Drift Verification (Mini) ---
// Privacy Mode: S1 (Epoch1) vs S3 (Epoch3 - Long term)
// Should differ.
// Compat Mode: Should match.

log("\n--- Drift Check (Mini) ---");

function getHash(mode, epoch, ctx, comp) {
    const v = vectors.find(v => v.mode === mode && v.epoch === epoch && v.context === ctx);
    return v ? v.components[comp] : null;
}

const comps = ['canvas_imagedata_hash', 'audio_hash', 'webgl_hash']; // Core

for (const comp of comps) {
    for (const ctx of contexts) {
        // Compat
        const c1 = getHash('compat', 1, ctx, comp);
        const c3 = getHash('compat', 3, ctx, comp);
        if (c1 && c3) {
            if (c1 !== c3) log(`[DRIFT FAIL] Compat ${ctx} ${comp} changed!`);
        }

        // Privacy
        const p1 = getHash('privacy', 1, ctx, comp);
        const p3 = getHash('privacy', 3, ctx, comp);
        if (p1 && p3) {
            if (p1 === p3) log(`[DRIFT FAIL] Privacy ${ctx} ${comp} identical! (Linked) [${p1} vs ${p3}]`);
            else log(`[OK] Privacy ${ctx} ${comp} Unlinkable. [${p1} vs ${p3}]`);
        }
    }
}

fs.writeFileSync(reportPath, logBuffer);
