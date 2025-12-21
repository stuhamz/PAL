import { PersonaGenerator } from '../lib/persona.js';

/**
 * PolicyManager
 * Handles the "Stability" of PAL.
 * Ensures that a specific Origin (e.g., github.com) always receives the SAME Persona
 * until the user explicitly requests a shift.
 */
export class PolicyManager {

    static async getStorage() {
        return await chrome.storage.local.get(['pal_policy_map', 'pal_global_seed']);
    }

    /**
     * Get or Create a stable persona for this origin.
     * @param {string} url - Tab URL to extract origin from
     * @returns {Promise<Object>} The full persona object
     */
    static async getPersonaForUrl(url) {
        if (!url || (!url.startsWith('http') && !url.startsWith('file'))) {
            // Non-http/file pages (chrome://, etc) get a transient random persona
            return PersonaGenerator.generate();
        }

        const origin = new URL(url).origin;
        const data = await this.getStorage();
        const map = data.pal_policy_map || {};

        // Rotation Policy: Daily
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        if (map[origin]) {
            let persona = map[origin];
            // Check Rotation (Day Change)
            if (persona.dateString !== today) {
                console.log(`[PAL] Policy: Day change detected for ${origin} (${persona.dateString || 'OLD'} -> ${today}). Rotating...`);
                persona = PersonaGenerator.generate();
                persona.dateString = today;

                map[origin] = persona;
                await chrome.storage.local.set({ pal_policy_map: map });
                return persona;
            }

            console.log(`[PAL] Policy: Resuming session for ${origin} (${today})`);
            return persona;
        }

        // No existing persona, generate and save
        console.log(`[PAL] Policy: Generating NEW persona for ${origin}`);
        const newPersona = PersonaGenerator.generate();
        newPersona.dateString = today;

        // Save
        map[origin] = newPersona;
        await chrome.storage.local.set({ pal_policy_map: map });

        return newPersona;
    }

    /**
     * Force rotation for a specific origin (User clicked "Shift Identity" on this site)
     */
    static async rotateForUrl(url) {
        if (!url || !url.startsWith('http')) return PersonaGenerator.generate();

        const origin = new URL(url).origin;
        const data = await this.getStorage();
        const map = data.pal_policy_map || {};

        const newPersona = PersonaGenerator.generate();
        map[origin] = newPersona;

        await chrome.storage.local.set({ pal_policy_map: map });
        return newPersona;
    }

    /**
     * Nuke all policies (Factory Reset)
     */
    static async clearAll() {
        await chrome.storage.local.remove('pal_policy_map');
    }
}
