document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("protectionToggle");
  const personaNameEl = document.getElementById("personaName");
  const rotateBtn = document.getElementById("rotateNow");

  // Ask background for unified state (keeps old/new keys synced)
  chrome.runtime.sendMessage({ type: "getState" }, (st) => {
    if (!st) return;
    toggle.checked = !!st.palEnabled;
    personaNameEl.textContent = (st.uiPersona && st.uiPersona.name) ? st.uiPersona.name : "Default";
  });

  toggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: toggle.checked ? "startProtection" : "stopProtection" });
  });

  rotateBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "pal.rotate.now" });
  });

  // Keep display in sync with storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.pal_enabled || changes.protectionEnabled) {
      const nv = (changes.pal_enabled?.newValue ?? changes.protectionEnabled?.newValue);
      if (typeof nv === "boolean") toggle.checked = nv;
    }
    if (changes.activePersona) {
      personaNameEl.textContent = changes.activePersona.newValue?.name || "Default";
    }
  });
});
