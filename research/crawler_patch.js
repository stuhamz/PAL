
data.probe_results = frameResults;

// E. Telemetry Collection
const getFrameStats = async (p) => {
    let totalSafe = {
        overhead: {},
        counts: {},
        fingerprints: {},
        realms: []
    };
    const merge = (s) => {
        if (!s) return;
        for (let k in s.counts) totalSafe.counts[k] = (totalSafe.counts[k] || 0) + s.counts[k];
        for (let k in s.overhead) totalSafe.overhead[k] = (totalSafe.overhead[k] || []).concat(s.overhead[k]);
        for (let k in s.fingerprints) {
            totalSafe.fingerprints[k] = [...new Set((totalSafe.fingerprints[k] || []).concat(s.fingerprints[k]))];
        }
        if (s.realm) totalSafe.realms.push(s.realm);
    };
    for (const frame of p.frames()) {
        try { merge(await frame.evaluate(() => window.__PAL_STATS || null)); } catch (e) { }
    }
    return totalSafe;
};

// Extract detailed CSP from DOM
try {
    const domCSP = await page.evaluate(() => {
        const metas = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
        return Array.from(metas).map(m => m.content).join(", ");
    });
    if (domCSP) {
        data.meta.csp = data.meta.csp ? data.meta.csp + ", " + domCSP : domCSP;
    }
} catch (e) { }

data.telemetry = await getFrameStats(page);

await page.close();
return data;
    }
