const fs = require('fs');
const path = require('path');

const files = [
    'research/crawler_pilot.js',
    'research/universal_probe.js',
    'src/content/prehook.js'
];

console.log("Searching for 'fullConfig'...");

files.forEach(f => {
    try {
        const content = fs.readFileSync(path.join(__dirname, f), 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            if (line.includes('fullConfig')) {
                console.log(`FOUND in ${f}:${idx + 1}: ${line.trim()}`);
            }
        });
    } catch (e) {
        console.error(`Error reading ${f}:`, e.message);
    }
});
console.log("Done.");
