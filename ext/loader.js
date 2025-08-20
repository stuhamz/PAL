// loader.js  —  PAL v19b loader (hardened + verbose)
// - Safe chrome.runtime.getURL usage via palGetURL()
// - Page-realm injection of patch.js (+ diag.js in top frame)
// - Single-shot injection guard
// - Loud diagnostics for every step

(() => {
  // -------------------------
  // simple, chatty logger
  // -------------------------
  const NS = "[PAL]";
  const log  = (...a) => { try { console.log(NS, ...a); } catch {} };
  const warn = (...a) => { try { console.warn(NS, ...a); } catch {} };
  const err  = (...a) => { try { console.error(NS, ...a); } catch {} };

  // -----------------------------------------
  // resolve getURL no matter the environment
  // -----------------------------------------
  const palGetURL = (() => {
    try {
      if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
        return chrome.runtime.getURL.bind(chrome.runtime);
      }
      if (typeof browser !== "undefined" && browser?.runtime?.getURL) {
        return browser.runtime.getURL.bind(browser.runtime);
      }
    } catch {}
    return (p) => p; // fallback for inline/dev
  })();

  // -----------------------------------------
  // add a visible marker so we don't double-inject
  // (isolated world -> page world bridge via DOM)
  // -----------------------------------------
  const markInjected = () => {
    try {
      const el = document.documentElement;
      if (!el) return false;
      if (el.hasAttribute("data-pal-injected")) return true;
      el.setAttribute("data-pal-injected", "1");
      return false;
    } catch { return false; }
  };

  // -----------------------------------------
  // inject <script src="..."> into PAGE REALM
  // -----------------------------------------
  function injectBySrc(src, label) {
    try {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.dataset.pal = label || "true";
      (document.head || document.documentElement).appendChild(s);
      // remove the node to minimize CSP/DOM noise (execution already happened)
      s.parentNode && s.parentNode.removeChild(s);
      log("injectBySrc ok:", label || "", src);
      return true;
    } catch (e) {
      err("injectBySrc fail:", label || "", String(e));
      return false;
    }
  }

  // -----------------------------------------
  // inject inline JS into PAGE REALM
  // -----------------------------------------
  function injectInline(code, label) {
    try {
      const s = document.createElement("script");
      s.textContent = code;
      s.dataset.pal = label || "inline";
      (document.head || document.documentElement).appendChild(s);
      s.parentNode && s.parentNode.removeChild(s);
      log("injectInline ok:", label || "");
      return true;
    } catch (e) {
      err("injectInline fail:", label || "", String(e));
      return false;
    }
  }

  // -----------------------------------------
  // read persisted flags (best-effort)
  // -----------------------------------------
  const ENABLED_KEY = "pal_enabled";
  const PERSONA_KEY = "pal_persona_index";

  async function readConfig() {
    let enabled = true;
    let personaIndex = 0;
    try {
      if (chrome?.storage?.local?.get) {
        const got = await chrome.storage.local.get([ENABLED_KEY, PERSONA_KEY]);
        if (typeof got[ENABLED_KEY] === "boolean") enabled = got[ENABLED_KEY];
        if (Number.isInteger(got[PERSONA_KEY])) personaIndex = got[PERSONA_KEY] | 0;
      }
    } catch (e) {
      warn("storage.get failed:", String(e));
    }
    return { enabled, personaIndex };
  }

  // -----------------------------------------
  // seed generator (stable enough for a tab)
  // -----------------------------------------
  function makeSeed() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] >>> 0;
    } catch {
      return ((Date.now() ^ (Math.random() * 1e9) | 0) >>> 0);
    }
  }

  // -----------------------------------------
  // main boot
  // -----------------------------------------
  (async function boot() {
    try {
      // guard: inject once per document
      if (markInjected()) {
        log("loader: already injected; skipping.");
        return;
      }

      const { enabled, personaIndex } = await readConfig();
      const seed = makeSeed();

      // dispatch a tiny state snapshot (helps correlate logs)
      log("loader.js: patch loaded, state dispatched", {
        enabled, seed, personaIndex
      });

      // if disabled, keep a breadcrumb & bail early
      if (!enabled) {
        injectInline(
          `try{ (top.__pal_diag = top.__pal_diag || {notes:[]}).notes.push({t:"loader.disabled", ts:Date.now(), extra:{url:location.href}}); }catch{}`,
          "pal_boot_disabled"
        );
        return;
      }

      // ship boot config to PAGE REALM (read by patch.js)
      injectInline(
        `
        (function(){
          try{
            window.__PAL_BOOT__ = {
              seed: ${seed >>> 0},
              personaIndex: ${personaIndex|0},
              enabled: true,
              url: location.href
            };
            // also expose a tiny diag bucket early
            var T = (top.__pal_diag = top.__pal_diag || {notes:[],calls:{},realms:[],url:String(location.href),lastSeed:0});
            T.lastSeed = ${seed >>> 0};
            T.notes.push({t:"loader.boot", ts:Date.now(), extra:{url:location.href, seed:${seed>>>0}, personaIndex:${personaIndex|0}}});
          }catch(e){ /* swallow */ }
        })();
        `,
        "pal_boot_config"
      );

      // build srcs with helpful querystring for human debugging
      const q = `?seed=${seed}&enabled=1&idx=${personaIndex}`;
      const patchSrc = palGetURL("patch.js") + q;
      const diagSrc  = palGetURL("diag.js")  + q;

      // inject patch first
      injectBySrc(patchSrc, "pal_patch");

      // inject diag.js only in top frame to reduce noise
      if (window === top) {
        injectBySrc(diagSrc, "pal_diag");
      } else {
        log("skipping diag.js in subframe");
      }

      // belt-and-suspenders: try again after DOMReady if head wasn't there yet
      const reattempt = () => {
        try {
          const el = document.documentElement;
          if (!el || el.hasAttribute("data-pal-reinjected")) return;
          el.setAttribute("data-pal-reinjected", "1");
          injectBySrc(patchSrc, "pal_patch_retry");
          if (window === top) injectBySrc(diagSrc, "pal_diag_retry");
          log("reinjection pass complete");
        } catch (e) {
          warn("reinjection failed:", String(e));
        }
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", reattempt, { once: true });
      } else {
        // if the DOM is already interactive/complete, queue a microtask
        Promise.resolve().then(reattempt);
      }
    } catch (e) {
      err("loader boot fatal:", e);
      // keep one breadcrumb in page realm so we can read it via top.__pal_diag
      try {
        injectInline(
          `try{ (top.__pal_diag = top.__pal_diag || {notes:[]}).notes.push({t:"loader.boot.fatal", ts:Date.now(), extra:String(${JSON.stringify(String(e))})}); }catch{}`,
          "pal_boot_fatal_note"
        );
      } catch {}
    }
  })();
})();
