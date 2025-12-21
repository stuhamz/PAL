// src/content/loader.js
// Runs in Isolated World. 
// Responsibility: Fetch Persistent Persona (Async) -> Send to Pre-Hook (Main World).

(async function () {
    try {
        // Ask Service Worker for the correct Persona for this origin
        const persona = await chrome.runtime.sendMessage({ type: 'PAL_HELLO' });

        if (persona) {
            // Dispatch Update Event to Main World Pre-Hook
            window.postMessage({
                type: 'PAL_UPDATE',
                detail: persona
            }, '*');
        }
    } catch (e) {
        // Silent failure if extension context invalidated
    }
})();
