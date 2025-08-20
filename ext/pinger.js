console.log("[PAL] pinger running");
try { chrome.runtime.sendMessage({ type: "forceInjectHere" }); } catch {}
