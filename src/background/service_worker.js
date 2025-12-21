// src/background/service_worker.js
// Manages state, storage, and cross-context coordination for PAL.

import { PersonaGenerator } from '../lib/persona.js';
import { NetSpoofer } from './net.js';
import { PolicyManager } from './policy.js';

console.log("[PAL] Background Service Worker Initialized (Policy Aware)");

// -----------------------------------------------------
// Message Handling (Bridge between Content / Popup)
// -----------------------------------------------------

// Logic is async, but listener must be synchronous to return 'true'
async function handleMessageLogic(message, sender, sendResponse) {
    try {
        if (message.type === 'PAL_HELLO') {
            // Tab asking for its persona.
            // Identify origin from sender.tab.url
            const url = sender.tab ? sender.tab.url : null;
            const persona = await PolicyManager.getPersonaForUrl(url);

            // Also update net rules for this active tab (Best Effort)
            if (sender.tab && sender.tab.active) {
                NetSpoofer.updateHeaders(persona).catch(e => { });
            }

            sendResponse(persona);
        }

        else if (message.type === 'PAL_SHIFT') {
            // User clicked "Shift Identity" in Popup
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (tab && tab.url) {
                console.log("[PAL] Shifting identity for:", tab.url);
                const newPersona = await PolicyManager.rotateForUrl(tab.url);

                // Clear cache in that tab
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => { try { sessionStorage.removeItem('__PAL_CACHE__'); } catch (e) { } }
                });

                await NetSpoofer.updateHeaders(newPersona);

                // Reload to apply
                chrome.tabs.reload(tab.id);

                sendResponse({ status: 'rotated', persona: newPersona });
            } else {
                // Fallback for empty/system pages
                sendResponse({ status: 'error', message: 'No active site' });
            }
        }

        else if (message.type === 'GET_STATUS') {
            // Popup wants status. Return ACTIVE tab's persona.
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                const persona = await PolicyManager.getPersonaForUrl(tab.url);
                sendResponse({ persona: persona });
            } else {
                sendResponse({ persona: null });
            }
        }
    } catch (e) {
        console.error("Message Handler Error:", e);
        sendResponse(null);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessageLogic(message, sender, sendResponse);
    return true; // Keep channel open for async response
});


// -----------------------------------------------------
// Initialization & Registration
// -----------------------------------------------------

// 80. Initialization & Registration
chrome.runtime.onInstalled.addListener(async () => {
    // Force Fresh Registration (Fixes "Ignored Updates" bug)
    try {
        await chrome.scripting.unregisterContentScripts({ ids: ["pal_prehook"] });
    } catch (e) { } // Ignore if not found

    // Register Main World Pre-Hook dynamically
    chrome.scripting.registerContentScripts([{
        id: "pal_prehook",
        js: ["src/content/prehook.js"],
        matches: ["<all_urls>"],
        runAt: "document_start",
        allFrames: true,
        matchOriginAsFallback: true,
        world: "MAIN"
    }]).then(() => {
        console.log("[PAL] Hook Registration Updated (allFrames: true)");
    }).catch(e => {
        console.error("Script registration failed:", e);
    });
});
