const { collectPageData } = require('./crawler');
const fs = require('fs');

(async () => {
    const url = "https://example.com";
    console.log("=== DEBUG RUN ===");

    // Run Monitor
    console.log("--- MONITOR ---");
    const m = await collectPageData(url, 'MONITOR');
    console.log("Monitor Result:", m.outcome);

    // Run Protect
    console.log("--- PROTECT ---");
    const p = await collectPageData(url, 'PROTECT');
    console.log("Protect Result:", p.outcome);

    // Check Logs
    // Logs are printed to stdout via crawler.js console handler
})();
