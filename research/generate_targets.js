const fs = require('fs');
const path = require('path');

// 1. READ USER URLs
const USER_FILE = path.resolve(__dirname, 'user_urls.txt');
let USER_URLS = [];

try {
    const data = fs.readFileSync(USER_FILE, 'utf-8');
    // Filter empty lines and trim
    USER_URLS = data.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.startsWith('http'));
} catch (e) {
    console.error("Could not read user_urls.txt. Ensure it exists.");
    process.exit(1);
}

console.log(`[GENERATOR] Loaded ${USER_URLS.length} base URLs from user list.`);

// 2. DEFINE N
const TARGET_N = 1000;
const FINAL_LIST = [];

// 3. GENERATE TARGETS (Cycle through User URLs)
// We add a specific 'category' to real sites vs probes if we wanted, 
// but here we mark them all as "User Stress Test".

for (let i = 0; i < TARGET_N; i++) {
    const pointer = i % USER_URLS.length;
    const base = USER_URLS[pointer];

    // We add a query param to ensure unique "Target Object", 
    // and maybe burst cache if the site respects it.
    // For many SPAs, ?test_run=X is harmless.
    const url = `${base}/?test_run=${i}`;

    FINAL_LIST.push({
        url: url,
        category: "Real-World Stress Test",
        reason: "User Provided List (Iterated)"
    });
}

const OUT_PATH = path.resolve(__dirname, 'sites.json');
fs.writeFileSync(OUT_PATH, JSON.stringify(FINAL_LIST, null, 2));

console.log(`[GENERATOR] Created ${FINAL_LIST.length} targets (Cycling ${USER_URLS.length} base sites).`);
