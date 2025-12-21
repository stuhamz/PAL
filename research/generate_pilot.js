const fs = require('fs');
const path = require('path');

const INPUT = path.resolve(__dirname, 'sites.json');
const OUTPUT = path.resolve(__dirname, 'pilot.json');

try {
    const allSites = JSON.parse(fs.readFileSync(INPUT));
    const pilot = allSites.slice(0, 40);
    fs.writeFileSync(OUTPUT, JSON.stringify(pilot, null, 2));
    console.log(`Generated pilot.json with ${pilot.length} sites.`);
} catch (e) { console.error(e); }
