// MV3 content-script registration, MAIN world, earliest possible.
const CS_ID = "pal-main-patch";

async function ensureRegistered() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const hasOld = existing.some(s => s.id === CS_ID);
    if (hasOld) await chrome.scripting.unregisterContentScripts({ ids: [CS_ID] });

    await chrome.scripting.registerContentScripts([{
      id: CS_ID,
      js: ["patch.js"],               // injected as MAIN world code
      matches: ["<all_urls>"],
      allFrames: true,
      matchOriginAsFallback: true,    // <-- MV3 way to hit about:blank/srcdoc if allowed
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true
    }]);

    console.log("[PAL] content script registered");
  } catch (e) {
    console.error("[PAL] registerContent error:", e);
  }
}

chrome.runtime.onInstalled.addListener(ensureRegistered);
chrome.runtime.onStartup.addListener(ensureRegistered);

// Optional manual re-register (handy while iterating)
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg === "pal-reregister") {
    ensureRegistered().then(() => send(true));
    return true;
  }
});
