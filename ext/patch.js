// patch.js — v19b (no FP.call/apply hooks, no readbacks; deep diagnostics; extra guards)
(function () {
  // prevent double install
  if (window.__pal_canvas_patch_v19b__) return;
  window.__pal_canvas_patch_v19b__ = true;

  // --------- diagnostics ----------
  const TOP = (() => { try { return top; } catch { return window; } })();
  const DIAG = (TOP.__pal_diag = TOP.__pal_diag || {
    ready: false,
    url: String(location.href),
    realms: [],
    calls: { toDataURL: 0, toBlob: 0, getImageData: 0, readPixels: 0, offscreenConvert: 0 },
    lastSeed: 0,
    notes: []
  });
  function note(t, extra) {
    try {
      DIAG.notes.push({ t, ts: Date.now(), extra });
      if (DIAG.notes.length > 800) DIAG.notes.shift();
      // noisy by design while debugging:
      console.debug("[PAL]", t, extra ?? "");
    } catch {}
  }
  function bump(k) { try { DIAG.calls[k] = (DIAG.calls[k] || 0) + 1; } catch {} }

  // --------- deterministic pixel noise (no readback) ----------
  function drawDelta2D(canvas, seed) {
    try {
      if (!canvas || typeof canvas.width !== "number" || typeof canvas.height !== "number") return;
      const w = canvas.width | 0, h = canvas.height | 0;
      if (!w || !h) return;

      let ctx = null;
      try { ctx = canvas.getContext && canvas.getContext("2d", { willReadFrequently: true }); } catch {}
      if (!ctx) return;

      const x = seed % w;
      const y = ((seed >>> 11) + w) % h;

      if (typeof ctx.save === "function") ctx.save();
      try {
        ctx.globalCompositeOperation = "xor";
        ctx.fillStyle = "rgba(1,0,0,0.004)";
        ctx.fillRect(x, y, 1, 1);
      } finally {
        if (typeof ctx.restore === "function") ctx.restore();
      }
      note("noise2d.ok", { w, h, x, y });
    } catch (e) { note("noise2d.fail", String(e)); }
  }

  function noiseGL(dst) {
    try {
      if (dst && typeof dst.length === "number" && dst.length) { dst[0] ^= 1; note("noisegl.ok", { len: dst.length }); }
    } catch (e) { note("noisegl.fail", String(e)); }
  }

  // --------- patch a single realm (window) ----------
  function installInto(win, tag) {
    try {
      const W = win;
      const HCE = W?.HTMLCanvasElement?.prototype;
      const C2D = W?.CanvasRenderingContext2D?.prototype;
      const GL1 = W?.WebGLRenderingContext?.prototype;
      const GL2 = W?.WebGL2RenderingContext?.prototype;
      const OC  = W?.OffscreenCanvas?.prototype;

      if (!HCE) { note(tag + ".skip.noHCE"); return false; }

      // getContext (log only)
      try {
        if (HCE.getContext && !HCE.getContext.__pal_wrapped) {
          const orig = HCE.getContext;
          HCE.getContext = function (type, ...rest) {
            let ctx;
            try { ctx = Reflect.apply(orig, this, [type, ...rest]); }
            catch (e) { note(tag + ".getContext.fail", String(e)); throw e; }
            try { this.__pal_seen_2d = this.__pal_seen_2d || (String(type).toLowerCase() === "2d" && !!ctx); } catch {}
            return ctx;
          };
          HCE.getContext.__pal_wrapped = true;
          note(tag + ".install.getContext");
        }
      } catch (e) { note(tag + ".install.getContext.fail", String(e)); }

      // toDataURL
      try {
        if (HCE.toDataURL && !HCE.toDataURL.__pal_wrapped) {
          const orig = HCE.toDataURL;
          HCE.toDataURL = function (...a) {
            try { drawDelta2D(this, DIAG.lastSeed); bump("toDataURL"); note(tag + ".call.toDataURL"); }
            catch (e) { note(tag + ".call.toDataURL.fail", String(e)); }
            return Reflect.apply(orig, this, a);
          };
          HCE.toDataURL.__pal_wrapped = true;
          note(tag + ".install.toDataURL");
        }
      } catch (e) { note(tag + ".install.toDataURL.fail", String(e)); }

      // toBlob
      try {
        if (HCE.toBlob && !HCE.toBlob.__pal_wrapped) {
          const orig = HCE.toBlob;
          HCE.toBlob = function (cb, ...rest) {
            try { drawDelta2D(this, DIAG.lastSeed ^ 0x5a5a5a); bump("toBlob"); note(tag + ".call.toBlob"); }
            catch (e) { note(tag + ".call.toBlob.fail", String(e)); }
            return Reflect.apply(orig, this, [cb, ...rest]);
          };
          HCE.toBlob.__pal_wrapped = true;
          note(tag + ".install.toBlob");
        }
      } catch (e) { note(tag + ".install.toBlob.fail", String(e)); }

      // 2D getImageData (counter only)
      try {
        if (C2D?.getImageData && !C2D.getImageData.__pal_wrapped) {
          const orig = C2D.getImageData;
          C2D.getImageData = function (...ga) {
            const img = Reflect.apply(orig, this, ga);
            try { bump("getImageData"); note(tag + ".call.getImageData"); } catch {}
            return img;
          };
          C2D.getImageData.__pal_wrapped = true;
          note(tag + ".install.ctx2d.getImageData");
        }
      } catch (e) { note(tag + ".install.ctx2d.getImageData.fail", String(e)); }

      // WebGL readPixels
      try {
        if (GL1?.readPixels && !GL1.readPixels.__pal_wrapped) {
          const orig = GL1.readPixels;
          GL1.readPixels = function (...pa) {
            const r = Reflect.apply(orig, this, pa);
            try { noiseGL(pa[5]); bump("readPixels"); note(tag + ".call.readPixels"); } catch (e) { note(tag + ".call.readPixels.fail", String(e)); }
            return r;
          };
          GL1.readPixels.__pal_wrapped = true;
          note(tag + ".install.webgl.readPixels");
        }
      } catch (e) { note(tag + ".install.webgl.readPixels.fail", String(e)); }
      try {
        if (GL2?.readPixels && !GL2.readPixels.__pal_wrapped) {
          const orig = GL2.readPixels;
          GL2.readPixels = function (...pa) {
            const r = Reflect.apply(orig, this, pa);
            try { noiseGL(pa[5]); bump("readPixels"); note(tag + ".call.readPixels2"); } catch (e) { note(tag + ".call.readPixels2.fail", String(e)); }
            return r;
          };
          GL2.readPixels.__pal_wrapped = true;
          note(tag + ".install.webgl2.readPixels");
        }
      } catch (e) { note(tag + ".install.webgl2.readPixels.fail", String(e)); }

      // OffscreenCanvas
      try {
        if (OC?.convertToBlob && !OC.convertToBlob.__pal_wrapped) {
          const orig = OC.convertToBlob;
          OC.convertToBlob = function (...a) {
            try { bump("offscreenConvert"); note(tag + ".call.offscreen.convertToBlob"); } catch {}
            return Reflect.apply(orig, this, a);
          };
          OC.convertToBlob.__pal_wrapped = true;
          note(tag + ".install.offscreen.convertToBlob");
        }
      } catch (e) { note(tag + ".install.offscreen.convertToBlob.fail", String(e)); }

      DIAG.realms.push({
        realm: String((win.location && win.location.href) || "<about:blank>"),
        already: true,
        id: `${(location && location.origin) || ""} | sandbox=${tag.includes("child") ? "child" : "n/a"} | ts=${(performance.now() | 0)}`
      });

      return true;
    } catch (e) {
      note("realm.install.fail", { where: tag, err: String(e) });
      return false;
    }
  }

  // --------- observe canvases (log only) ----------
  function sweepCanvases(doc) {
    try {
      const list = (doc && doc.querySelectorAll) ? doc.querySelectorAll("canvas") : [];
      note("sweepDoc", { canvases: list.length, url: location.href });
      try {
        const mo = new MutationObserver(muts => {
          try {
            for (const m of muts) {
              m.addedNodes && m.addedNodes.forEach(n => {
                try {
                  if (!n || n.nodeType !== 1) return;
                  if (n.tagName === "CANVAS") note("canvas.added");
                  if (n.querySelectorAll) n.querySelectorAll("canvas").forEach(() => note("canvas.added.deep"));
                } catch (e) { note("observe.subtree.node.fail", String(e)); }
              });
            }
          } catch (e) { note("observe.subtree.cb.fail", String(e)); }
        });
        mo.observe(doc, { childList: true, subtree: true });
        note("observe.doc");
      } catch (e) { note("observe.doc.fail", String(e)); }
    } catch (e) { note("sweepDoc.fail", String(e)); }
  }

  // --------- patch same-origin about:blank frames (best-effort) ----------
  function patchSameOriginBlankFrames() {
    try {
      let frames = [];
      try { frames = document.querySelectorAll('iframe[sandbox~="allow-same-origin"]'); }
      catch (e) { note("frames.qs.fail", String(e)); frames = []; }

      const out = [];
      frames.forEach(f => {
        const info = { sandbox: "", patched: false, reason: "" };
        try {
          info.sandbox = f.getAttribute("sandbox") || "";
          let cw = null, cd = null;
          try { cw = f.contentWindow; cd = f.contentDocument; }
          catch (e) { info.reason = "no access: " + String(e); }

          if (cw && cd) {
            info.patched = installInto(cw, "child") || false;
            if (!info.patched) info.reason = "installInto failed";
            try {
              const mo = new MutationObserver(()=>{});
              mo.observe(cd, { childList: true, subtree: true });
            } catch (e) { note("frame.observe.fail", String(e)); }
            try {
              f.addEventListener("load", () => {
                try {
                  const ok = installInto(f.contentWindow, "child.load");
                  note("frame.load", { ok, sandbox: f.getAttribute("sandbox") || "" });
                } catch (e) { note("frame.load.fail", String(e)); }
              }, { once: true });
            } catch (e) { note("frame.addEventListener.fail", String(e)); }
          }
        } catch (e) { info.reason = "frame.fail: " + String(e); }
        out.push(info);
      });
      note("frames.scan", out);

      try {
        const mo = new MutationObserver(muts => {
          try {
            muts.forEach(m => {
              m.addedNodes && m.addedNodes.forEach(n => {
                try {
                  if (!n || n.nodeType !== 1 || n.tagName !== "IFRAME") return;
                  const sb = n.getAttribute("sandbox") || "";
                  if (!/\ballow-same-origin\b/i.test(sb)) return;
                  let cw = null, cd = null;
                  try { cw = n.contentWindow; cd = n.contentDocument; } catch {}
                  const ok = cw && cd ? installInto(cw, "child") : false;
                  note("frame.subtree", { sandbox: sb, ok });
                  try {
                    n.addEventListener("load", () => {
                      try {
                        const ok2 = installInto(n.contentWindow, "child.load");
                        note("frame.load", { ok: ok2, sandbox: n.getAttribute("sandbox") || "" });
                      } catch (e) { note("frame.load.fail", String(e)); }
                    }, { once: true });
                  } catch (e) { note("frame.subtree.addEventListener.fail", String(e)); }
                } catch (e) { note("frame.subtree.fail", String(e)); }
              });
            });
          } catch (e) { note("frames.observe.cb.fail", String(e)); }
        });
        mo.observe(document, { childList: true, subtree: true });
      } catch (e) { note("frames.observe.fail", String(e)); }
    } catch (e) { note("frames.scan.outer.fail", String(e)); }
  }

  // --------- kick ----------
  try { DIAG.lastSeed = (Date.now() ^ (Math.random() * 1e9 | 0)) >>> 0; } catch { DIAG.lastSeed = (Date.now() | 0) >>> 0; }
  note("install", { url: location.href, seed: DIAG.lastSeed });

  try { installInto(window, "top"); } catch (e) { note("top.install.fail", String(e)); }
  try { sweepCanvases(document); } catch (e) { note("sweep.fail", String(e)); }
  try { patchSameOriginBlankFrames(); } catch (e) { note("frames.fail", String(e)); }

  DIAG.ready = true;
  note("ready", { calls: DIAG.calls, url: location.href });
})();
