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

// ===== PAL State + Popup Bridge =====

const DEFAULT_STATE = { enabled: true, personaIndex: 0, seed: Date.now() >>> 0 };

async function getState() {
  const s = await chrome.storage.local.get(DEFAULT_STATE);
  const full = Object.assign({}, DEFAULT_STATE, s);
  await chrome.storage.local.set(full);
  return full;
}

async function setState(patch) {
  const cur = await getState();
  const next = Object.assign({}, cur, patch);
  await chrome.storage.local.set(next);
  return next;
}

async function broadcast(type, payload) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs)
      chrome.tabs.sendMessage(t.id, { source: "PAL", type, payload });
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "getState": {
        sendResponse({ ok: true, state: await getState() });
        break;
      }
      case "startProtection": {
        const state = await setState({ enabled: true });
        await broadcast("stateChanged", state);
        sendResponse({ ok: true, state });
        break;
      }
      case "stopProtection": {
        const state = await setState({ enabled: false });
        await broadcast("stateChanged", state);
        sendResponse({ ok: true, state });
        break;
      }
      case "rotatePersona": {
        const cur = await getState();
        const state = await setState({
          personaIndex: (cur.personaIndex | 0) + 1,
          seed: (Date.now() ^ ((Math.random() * 1e9) | 0)) >>> 0
        });
        await broadcast("stateChanged", state);
        sendResponse({ ok: true, state });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown_message_type" });
    }
  })();
  return true; // keep port open for async
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(DEFAULT_STATE);
});
