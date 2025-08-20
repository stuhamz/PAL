// collect.js — PAL collector (CSP-safe, GL-fixed) — drop-in
// Node 18+, puppeteer-core 22+
// Usage (run ON and OFF in two passes with different profiles):
//   $env:PUPPETEER_EXECUTABLE_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
//   node collect.js --userDataDir "C:\\tmp\\pal_on"  --mode on  --sites default --personas 0,1,2 --reps 2 --sessions sessions_on.csv
//   node collect.js --userDataDir "C:\\tmp\\pal_off" --mode off --sites default --personas 0,1,2 --reps 2 --sessions sessions_off.csv
//
// Then analyze both together:
//   python analyze.py sessions_on.csv sessions_off.csv run-*.ndjson

const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer-core');

// ---------- tiny argv parser (no deps) ----------
function parseArgv(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    let a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}
const argv = parseArgv(process.argv);

// ---------- inputs ----------
const MODE = (argv.mode || '').toLowerCase(); // 'on' | 'off'
if (MODE !== 'on' && MODE !== 'off') {
  console.error('FATAL: --mode must be "on" or "off" (run two passes).');
  process.exit(1);
}
const USER_DATA_DIR = argv.userDataDir || '';
const REPS = Math.max(1, parseInt(argv.reps || '1', 10));
const PERSONAS = (argv.personas ? String(argv.personas) : '0')
  .split(',').map(s => s.trim()).filter(Boolean).map(n => parseInt(n, 10));
const SESSIONS_CSV = argv.sessions || `sessions_${MODE}.csv`;
const NDJSON = `run-${new Date().toISOString().replace(/[:.]/g,'-')}.ndjson`;
const STOP_ON_GAP = !!argv.stopOnGap;
const STOP_ON_NO_CHANGE = !!argv.stopOnNoChange;

// Sites
let sites;
if (!argv.sites || argv.sites === 'default') {
  sites = [
    'https://browserleaks.com/canvas',
    'https://www.wikipedia.org',
    'https://github.com'
  ];
} else if (fs.existsSync(argv.sites)) {
  const txt = fs.readFileSync(argv.sites, 'utf8').trim();
  sites = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
} else {
  sites = String(argv.sites).split(',').map(s => s.trim()).filter(Boolean);
}

// ---------- helpers ----------
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// tiny 32-bit hash (FNV-1a)
function hashHex(buf) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

function csvEscape(v){
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

async function ensureCsvHeader() {
  if (!fs.existsSync(SESSIONS_CSV) || !fs.statSync(SESSIONS_CSV).size) {
    fs.writeFileSync(SESSIONS_CSV,
      'ts,mode,persona,seed,url,calls_toDataURL,calls_toBlob,calls_getImageData,calls_readPixels,probe2d_hash,probewebgl_hash,load_ms,ablation' + os.EOL);
  }
}

function appendCsvRow(row) {
  const line = [
    row.ts,
    row.mode,
    row.persona,
    row.seed,
    row.url,
    row.calls_toDataURL,
    row.calls_toBlob,
    row.calls_getImageData,
    row.calls_readPixels,
    row.probe2d_hash,
    row.probewebgl_hash,
    row.load_ms,
    row.ablation || 'none'
  ].map(csvEscape).join(',') + os.EOL;
  fs.appendFileSync(SESSIONS_CSV, line);
}

function appendNdjson(obj){
  fs.appendFileSync(NDJSON, JSON.stringify(obj) + os.EOL);
}

// ---------- PAL-lite init (MAIN world, CSP-safe) ----------
const PAL_INIT = (seed, enable2D, enableGL) => `
(() => {
  try {
    // deterministic PRNG
    function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15, t|1);t^=t+Math.imul(t^t>>>7, t|61);return ((t^t>>>14)>>>0)/4294967296;}}
    const rng = mulberry32(${seed >>> 0});
    const counters = (window.__PAL_COUNTERS ||= {toDataURL:0,toBlob:0,getImageData:0,readPixels:0});

    // 2D: make toDataURL sensitive in a tiny, minimally visible way
    if (${enable2D ? 'true' : 'false'}) {
      const H = HTMLCanvasElement.prototype;
      if (!H.__pal_toDataURL) {
        const origToDataURL = H.toDataURL;
        H.toDataURL = function(...args){
          counters.toDataURL++;
          try {
            const ctx = this.getContext('2d');
            if (ctx && this.width && this.height) {
              // Add a 1px noisy dot in the bottom-right corner
              ctx.save();
              ctx.globalCompositeOperation = 'difference';
              ctx.fillStyle = 'rgba(' + ((rng()*255)|0) + ',' + ((rng()*255)|0) + ',' + ((rng()*255)|0) + ',0.03)';
              ctx.fillRect(this.width-1, this.height-1, 1, 1);
              ctx.restore();
            }
          } catch (_){}
          return origToDataURL.apply(this, args);
        };
        H.__pal_toDataURL = true;
      }

      const C2 = CanvasRenderingContext2D.prototype;
      if (!C2.__pal_getImageData) {
        const origGID = C2.getImageData;
        C2.getImageData = function(...args){
          counters.getImageData++;
          const img = origGID.apply(this, args);
          // Flip a few low bits to introduce noise
          const data = img.data;
          for (let i = 0; i < Math.min(64, data.length); i++) {
            data[i] = data[i] ^ ((rng()*3)|0);
          }
          return img;
        };
        C2.__pal_getImageData = true;
      }

      if (!H.__pal_toBlob) {
        const origToBlob = H.toBlob;
        H.toBlob = function(cb, ...rest){
          counters.toBlob++;
          // Reuse toDataURL path (ensures same noise)
          try { this.toDataURL('image/png'); } catch(_){}
          return origToBlob.call(this, cb, ...rest);
        };
        H.__pal_toBlob = true;
      }
    }

    // WebGL: XOR perturb readPixels buffer (deterministic)
    if (${enableGL ? 'true' : 'false'}) {
      function wrapGL(proto){
        if (!proto || !proto.readPixels || proto.readPixels.__pal_wrapped) return;
        const orig = proto.readPixels;
        proto.readPixels = function(...args){
          counters.readPixels++;
          const rv = orig.apply(this, args);
          try {
            // args: x,y,w,h,format,type,pixels
            const pix = args[6];
            if (pix && (pix instanceof Uint8Array || pix instanceof Uint8ClampedArray)) {
              // XOR a few first bytes deterministically (small perturbation)
              for (let i = 0; i < Math.min(256, pix.length); i++) {
                pix[i] = pix[i] ^ ((rng()*7)|0);
              }
            }
          } catch (_){}
          return rv;
        };
        proto.readPixels.__pal_wrapped = true;
      }
      wrapGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
      wrapGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
    }

    window.__PAL_LITE_READY = true;
  } catch (e) {
    // swallow
  }
})();
`;

// Also send a boot config event for your extension (so it enables GL too)
const PAL_BOOT_EVENT = (seed) => `
(() => {
  try {
    const cfg = {
      enabled: true,
      personaSeed: ${seed >>> 0},
      noise2d: true,
      noiseWebGL: true,
      hook: { toDataURL:true, toBlob:true, getImageData:true, readPixels:true, offscreen:true }
    };
    const ev = new CustomEvent('pal_boot_config', { detail: cfg });
    window.dispatchEvent(ev);
  } catch(_){}
})();
`;

// ---------- probe code (runs in page) ----------
const PROBE_CODE = `
(async () => {
  function strToBytes(s){
    const arr = new Uint8Array(s.length);
    for (let i=0;i<s.length;i++) arr[i] = s.charCodeAt(i) & 0xFF;
    return arr;
  }
  function hashHexBytes(bytes){
    let h = 0x811c9dc5 >>> 0;
    for (let i=0;i<bytes.length;i++){ h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000'+h.toString(16)).slice(-8);
  }

  // 2D
  let h2d = '00000000';
  try {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#f0f';
    ctx.fillRect(0,0,200,50);
    ctx.fillStyle = '#000';
    ctx.fillText('PAL probe ✓', 4, 4);
    const s = c.toDataURL('image/png');
    h2d = hashHexBytes(strToBytes(s));
  } catch(_){}

  // WebGL
  let hgl = '00000000';
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl'));
    if (gl) {
      gl.clearColor(0.1,0.2,0.3,1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const pix = new Uint8Array(64*64*4);
      gl.readPixels(0,0,64,64, gl.RGBA, gl.UNSIGNED_BYTE, pix);
      hgl = hashHexBytes(pix);
    }
  } catch(_){}

  const perf = (performance && performance.timing) ? performance.timing : null;
  let load_ms = 0;
  try {
    if (perf && perf.loadEventEnd && perf.navigationStart) {
      load_ms = Math.max(0, perf.loadEventEnd - perf.navigationStart);
      if (!load_ms && perf.domComplete) load_ms = Math.max(0, perf.domComplete - perf.navigationStart);
    }
  } catch(_){}

  const counters = (window.__PAL_COUNTERS || {toDataURL:0,toBlob:0,getImageData:0,readPixels:0});
  return { h2d, hgl, load_ms, counters };
})();
`;

// ---------- main ----------
(async () => {
  console.log(`[i] Using Chrome profile: ${USER_DATA_DIR || '(ephemeral)'}`);
  console.log(`[i] NDJSON -> ${path.resolve(NDJSON)}`);
  await ensureCsvHeader();

  const launchOpts = {
    headless: false,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=OptimizationGuideModelDownloading,OptimizationHints',
    ],
  };
  if (USER_DATA_DIR) launchOpts.userDataDir = USER_DATA_DIR;
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  const browser = await puppeteer.launch(launchOpts);

  try {
    for (const persona of PERSONAS) {
      for (let r = 0; r < REPS; r++) {
        for (const url of sites) {
          const page = await browser.newPage();

          // Inject BEFORE any script: boot event (for your extension) + PAL-lite fallback in ON mode
          const seed = (persona * 0x9e3779b1) ^ (r * 0x85ebca6b) ^ 0xdeadbeef;
          if (MODE === 'on') {
            await page.evaluateOnNewDocument(PAL_BOOT_EVENT(seed));
            await page.evaluateOnNewDocument(PAL_INIT(seed, true, true)); // 2D+GL enabled
          } else {
            // OFF: ensure counters exist but don’t change signals
            await page.evaluateOnNewDocument(`window.__PAL_COUNTERS={toDataURL:0,toBlob:0,getImageData:0,readPixels:0};`);
          }

          const ts0 = Date.now();
          try {
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });
          } catch (e) {
            appendNdjson({ ts: ts0, mode: MODE, persona, url, err: String(e) });
          }

          // Give it a moment to settle (avoid waitForTimeout API which may differ)
          await sleep(800);

          // Run probe inside the page
          let res = { h2d:'00000000', hgl:'00000000', load_ms:0, counters:{toDataURL:0,toBlob:0,getImageData:0,readPixels:0} };
          try {
            res = await page.evaluate(PROBE_CODE);
          } catch (e) {
            appendNdjson({ ts: ts0, mode: MODE, persona, url, probe_error: String(e) });
          }

          const row = {
            ts: ts0,
            mode: MODE,
            persona,
            seed,
            url,
            calls_toDataURL: res.counters.toDataURL,
            calls_toBlob: res.counters.toBlob,
            calls_getImageData: res.counters.getImageData,
            calls_readPixels: res.counters.readPixels,
            probe2d_hash: res.h2d,
            probewebgl_hash: res.hgl,
            load_ms: res.load_ms || (Date.now() - ts0),
            ablation: 'none'
          };
          appendCsvRow(row);
          appendNdjson({ type: 'row', ...row });

          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    console.log(`[i] Done. CSV -> ${path.resolve(SESSIONS_CSV)}`);
    console.log(`[i] NDJSON -> ${path.resolve(NDJSON)}`);
  }
})();
