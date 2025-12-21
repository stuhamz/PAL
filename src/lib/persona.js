// src/lib/persona.js
// Coherence Engine Wrapper
// Generates persistent, coherent identities using Blueprints.

import { BLUEPRINTS } from './blueprints.js';

function pickWeighted(items) {
    const total = items.reduce((sum, item) => sum + item.marketShareWeight, 0);
    let r = Math.random() * total;
    for (const item of items) {
        if (r < item.marketShareWeight) return item;
        r -= item.marketShareWeight;
    }
    return items[0];
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const PersonaGenerator = {
    generate: () => {
        // 1. Select Blueprint
        const bp = pickWeighted(BLUEPRINTS);

        // 2. Resolve Versions (Jitter)
        // Simulate recent Chrome versions (e.g., 120-123)
        const chromeVersion = Math.floor(Math.random() * 4) + 120;

        // 3. Resolve Hardware
        const resolution = pickRandom(bp.screen.resolutions);
        const gpu = pickRandom(bp.webgl.vendors);
        const concurrency = pickRandom(bp.navigator.hardwareConcurrencyOptions);
        const memory = pickRandom(bp.navigator.deviceMemoryOptions);

        const userAgent = bp.navigator.userAgentTemplate.replace('{chromeVersion}', chromeVersion);

        // 4. Generate Noise Seed
        // This seed determines the "offset" for Canvas/Audio so it remains stable for this persona.
        const noiseSeed = generateUUID();

        return {
            id: generateUUID(),
            name: bp.name, // Helpful for debugging UI
            blueprint_id: bp.name, // Using name as ID for now
            epoch_id: 1,
            seed_derivation_version: 1,
            seed: noiseSeed, // For seeded random noise
            timestamp: Date.now(),
            lastUpdated: Date.now(), // Track for Drift

            navigator: {
                userAgent: userAgent,
                platform: bp.navigator.platform,
                hardwareConcurrency: concurrency,
                deviceMemory: memory
            },

            screen: {
                width: resolution.width,
                height: resolution.height,
                colorDepth: 24,
                pixelDepth: 24,
                availWidth: resolution.width,
                availHeight: resolution.height
            },

            webgl: {
                vendor: gpu.vendor,
                renderer: gpu.renderer
            }
        };
    },

    /**
     * Evolve a persona (Session Drift)
     * Increments the Chrome version to simulate an update, keeping the device ID (seed) same.
     */
    evolve: (persona) => {
        try {
            console.log("[PAL] Evolving Persona:", persona.id);
            // 1. Parse current version from UA
            // "Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36"
            const ua = persona.navigator.userAgent;
            const match = ua.match(/Chrome\/(\d+)/);

            if (match && match[1]) {
                const currentVer = parseInt(match[1]);
                const newVer = currentVer + 1;

                // 2. Reconstruct UA
                const newUA = ua.replace(`Chrome/${currentVer}`, `Chrome/${newVer}`);

                // 3. Update Persona
                persona.navigator.userAgent = newUA;
                persona.lastUpdated = Date.now(); // Reset drift timer

                console.log(`[PAL] Drift Success: Chrome ${currentVer} -> ${newVer}`);
                return persona;
            }
        } catch (e) {
            console.error("[PAL] Evolution Failed:", e);
        }
        return persona;
    }
};
