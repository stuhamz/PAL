// src/popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
    const shiftBtn = document.getElementById('shift-btn');
    const statusText = document.getElementById('status-text');
    const personaIdEl = document.getElementById('current-persona-id');
    const container = document.querySelector('.container');

    // Stats Elements (we will add them dynamically)
    function renderStats(persona) {
        // Clear old stats if any (except header)
        const oldStats = document.querySelectorAll('.dynamic-stat');
        oldStats.forEach(el => el.remove());

        const createRow = (label, val) => {
            const row = document.createElement('div');
            row.className = 'stat-row dynamic-stat';
            row.style.marginTop = '8px';
            row.innerHTML = `<span class="label">${label}</span><span class="value" title="${val}">${val}</span>`;
            // sibling after status-card content
            document.querySelector('.status-card').appendChild(row);
        };

        // Truncate
        const trunc = (s, l = 20) => s.length > l ? s.substring(0, l) + '...' : s;

        createRow("Profile", persona.name || "Custom");
        createRow("OS", persona.navigator.platform);
        createRow("Res", `${persona.screen.width}x${persona.screen.height}`);
        createRow("Browser", "Chrome (Spoofed)");
    }

    function updateUI(persona) {
        if (!persona) return;
        personaIdEl.innerText = persona.id.substring(0, 18) + "...";
        renderStats(persona);
    }

    // Initial Load
    chrome.runtime.sendMessage({ type: 'GET_PERSONA' }, (response) => {
        if (response && response.persona) {
            updateUI(response.persona);
        }
    });

    // Shift Action
    shiftBtn.addEventListener('click', () => {
        shiftBtn.disabled = true;
        shiftBtn.innerText = "Shifting...";

        chrome.runtime.sendMessage({ type: 'SHIFT_IDENTITY' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Shift failed:", chrome.runtime.lastError);
                statusText.innerText = "Error";
                shiftBtn.disabled = false;
                return;
            }

            if (response && response.success) {
                updateUI(response.persona);
                shiftBtn.innerText = "Shift Identity";
                shiftBtn.disabled = false;

                // Optional: Reload active tab to apply
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) chrome.tabs.reload(tabs[0].id);
                });
            }
        });
    });
});
