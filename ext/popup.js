// MV3 popup that talks to worker.js using:
//   getState, startProtection, stopProtection, rotatePersona

const $ = (id) => document.getElementById(id);

async function ask(msg) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

function render(state) {
  if (!state) return;
  const on = !!state.enabled;

  $("toggle").checked = on;
  $("status").textContent = on ? "ON" : "OFF";
  $("status").className = on ? "ok" : "off";

  $("personaIdx").textContent = state.personaIndex ?? "0";
  $("seed").textContent = state.seed ?? "—";
}

async function loadState() {
  try {
    const r = await ask({ type: "getState" });
    render(r && r.state ? r.state : r); // worker returns {ok:true,state:{...}}
  } catch (e) {
    console.error("getState failed", e);
  }
}

async function setEnabled(enable) {
  try {
    const r = await ask({ type: enable ? "startProtection" : "stopProtection" });
    render(r.state || r);
  } catch (e) {
    console.error("toggle failed", e);
  }
}

async function rotate() {
  try {
    const r = await ask({ type: "rotatePersona" });
    render(r.state || r);
  } catch (e) {
    console.error("rotate failed", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("toggle").addEventListener("change", (e) => setEnabled(e.target.checked));
  $("rotate").addEventListener("click", rotate);
  $("refresh").addEventListener("click", loadState);

  // live updates if worker refreshes storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const patch = {};
    if (changes.enabled) patch.enabled = changes.enabled.newValue;
    if (changes.personaIndex) patch.personaIndex = changes.personaIndex.newValue;
    if (changes.seed) patch.seed = changes.seed.newValue;
    if (Object.keys(patch).length) render(Object.assign({}, patch));
  });

  loadState();
});
