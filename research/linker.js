const fs = require('fs');

const filename = process.argv[2] || 'research/sticky_events.jsonl';
if (!fs.existsSync(filename)) {
    console.error(`File not found: ${filename}`);
    process.exit(1);
}

console.log(`[LINKER] Analyzing ${filename}...`);

const raw = fs.readFileSync(filename, 'utf8');
const events = raw.split('\n')
    .filter(line => line.trim())
    .map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
    })
    .filter(e => e);

// grouping
const sessions = {}; // Map<ID, Vectors>

events.forEach(e => {
    // Prefer config_id (Ground Truth) > persona_id (Self-Reported)
    const id = e.config_id || e.persona_id || 'unknown';
    if (!sessions[id]) {
        sessions[id] = {
            id: id,
            seed: e.persona_id, // Capture the reported seed
            vectors: {}
        };
    }

    // Extract High-Entropy Vectors
    // Page-Side Ground Truth (Attacker View)
    if (e.api_name === 'STICKY_TEST') {
        sessions[id].vectors['canvas'] = e.output_hash;
    }
    // Telemetry View
    else if (e.api_name === 'toDataURL' || e.api_name === 'getImageData') {
        // Only use if we haven't seen a STICKY_TEST (which is better)
        if (!sessions[id].vectors['canvas']) {
            sessions[id].vectors['canvas'] = e.output_hash;
        }
    }
    // Audio
    if (e.api_name === 'getChannelData') {
        sessions[id].vectors['audio'] = e.output_hash;
    }
    // WebGL Pixels
    if (e.api_name === 'readPixels') {
        sessions[id].vectors['webgl'] = e.output_hash;
    }
    // WebGL Params (Renderer)
    if (e.api_name.includes('getParameter') && e.output_hash) {
        // rough heuristic for renderer
        // We might need to look at raw output if hash is just "null" or generic
        // but for now, let's assume hash is capturing the value
    }

    // Meta
    if (e.userAgent) sessions[id].vectors['ua'] = e.userAgent;
});

console.log(`[LINKER] Extracted ${Object.keys(sessions).length} Unique Sessions.`);

// Analysis: Pairwise Comparison
const ids = Object.keys(sessions).sort();
let linked_pairs = 0;
let diff_pairs = 0;

console.log("-".repeat(60));
console.log("VECTOR REPORT");
ids.forEach(id => {
    const s = sessions[id];
    console.log(`[${id.padEnd(5)}] Seed: ${s.seed ? s.seed.substring(0, 8) : 'N/A'} | Canvas: ${s.vectors.canvas || 'MISSING'} | Audio: ${s.vectors.audio || 'MISSING'}`);
});
console.log("-".repeat(60));

console.log("LINKABILITY MATRIX (0 = Exact Match, 1 = Different)");
// Simple exact match logic for now
for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
        const idA = ids[i];
        const idB = ids[j];
        const vecA = sessions[idA].vectors;
        const vecB = sessions[idB].vectors;

        let total_features = 0;
        let diffs = 0;

        // Compare keys
        ['canvas', 'audio', 'webgl'].forEach(key => {
            if (vecA[key] && vecB[key]) {
                total_features++;
                if (vecA[key] !== vecB[key]) diffs++;
            }
        });

        if (total_features === 0) continue;

        const distance = diffs / total_features;
        const linked = (distance === 0);

        let relation = "UNKNOWN";
        // Ground Truth logic: 
        // A1 vs A2 should match (Seed A)
        // A1 vs B1 should mismatch (Seed A vs B)
        const seedA = sessions[idA].seed;
        const seedB = sessions[idB].seed;
        const expect_match = (seedA === seedB);

        if (linked) linked_pairs++; else diff_pairs++;

        const status = (linked === expect_match) ? "PASS" : "FAIL";

        console.log(`[${status}] ${idA} vs ${idB}: Dist=${distance.toFixed(2)} (Expect ${expect_match ? 0 : '1.0'}). Shared=${total_features}`);
    }
}

