// src/background/net.js
// Manages Network Header Spoofing (Client Hints & UA)

export const NetSpoofer = {
    updateHeaders: async (persona) => {
        // 1. Clear existing dynamic rules
        const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        const oldRuleIds = oldRules.map(rule => rule.id);

        if (oldRuleIds.length > 0) {
            // We will include these in the atomic update below
        }

        // 2. Define new rules
        // We need to construct the Sec-CH-UA string based on the Persona.
        // Example: "Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"

        // Extract version from UA string if possible, or use defaults from Blueprints?
        // Our UA is "Chrome/123.0.0.0".
        const uaMatch = persona.navigator.userAgent.match(/Chrome\/(\d+)/);
        const version = uaMatch ? uaMatch[1] : "120";

        const secChUa = `"Not A(Brand";v="99", "Google Chrome";v="${version}", "Chromium";v="${version}"`;
        const platform = persona.navigator.platform.startsWith("Mac") ? "macOS" : "Windows";

        const newId = Math.floor(Math.random() * 1000000) + 1000;

        const newRules = [
            {
                id: newId,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        { header: "User-Agent", operation: "set", value: persona.navigator.userAgent },
                        { header: "Sec-CH-UA", operation: "set", value: secChUa },
                        { header: "Sec-CH-UA-Platform", operation: "set", value: `"${platform}"` },
                        { header: "Sec-CH-UA-Mobile", operation: "set", value: "?0" } // Assuming desktop for now
                    ]
                },
                condition: {
                    urlFilter: "*", // Apply to all URLs
                    resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "image", "stylesheet", "other"]
                }
            }
        ];

        // 3. Apply new rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds, // Fix: Actually remove old rules
            addRules: newRules
        });

        console.log("[PAL] Network Headers Updated for:", persona.id);
    }
};
