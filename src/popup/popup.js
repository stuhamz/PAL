document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const shiftBtn = document.getElementById('shift-btn');

    // UI Elements
    const elId = document.getElementById('persona-id');
    const elName = document.getElementById('persona-name');
    const elOs = document.getElementById('persona-os');
    const elBrowser = document.getElementById('persona-browser');
    const elRes = document.getElementById('persona-res');

    function updateUI(persona) {
        if (!persona) {
            loading.innerHTML = "<h2>No Active Site</h2><p>Visit a website to see identity.</p>";
            shiftBtn.disabled = true;
            return;
        }

        loading.classList.add('hidden');
        dashboard.classList.remove('hidden');
        shiftBtn.disabled = false;

        elId.innerText = persona.id.substring(0, 16) + "...";
        elName.innerText = persona.name;
        elOs.innerText = persona.navigator.platform;
        elBrowser.innerText = "Chrome (Spoofed)"; // Simplified for UI
        elRes.innerText = `${persona.screen.width}x${persona.screen.height}`;
    }

    // Initial Load
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (response && response.persona) {
            updateUI(response.persona);
        } else {
            updateUI(null);
        }
    } catch (e) {
        console.error("Popup Init Error:", e);
        loading.innerHTML = "<h2>Error</h2><p>Service Worker Unreachable</p>";
    }

    // Shift Action
    shiftBtn.addEventListener('click', async () => {
        shiftBtn.innerText = "Shifting...";
        shiftBtn.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({ type: 'PAL_SHIFT' });
            if (response && response.status === 'rotated') {
                updateUI(response.persona);
                shiftBtn.innerText = "Identity Shifted!";
                setTimeout(() => { shiftBtn.innerText = "Shift Identity"; shiftBtn.disabled = false; }, 2000);
            } else {
                shiftBtn.innerText = "Failed";
                setTimeout(() => { shiftBtn.innerText = "Shift Identity"; shiftBtn.disabled = false; }, 2000);
            }
        } catch (e) {
            shiftBtn.innerText = "Error";
        }
    });
});
