// src/content/prehook.js
// Runs in MAIN WORLD.
// STABLE + ASYNC WORKER PROXY + FRAME PROPAGATOR + SCREEN HOOKS + AUDIO + WEBGL + WEBRTC

(function () {
    console.log("[PAL] Protected Context STARTING..."); // DEBUG
    const INJECT_START = Date.now();
    // 1. Double Injection Guard
    if (window.__PAL_ACTIVE) return;
    window.__PAL_ACTIVE = true;
    console.log("[PAL] Protected Context Initialized");

    // 0. SHARED CONFIG
    const GLOBAL_CONFIG = (typeof window !== 'undefined') ? (window.__PAL_CONFIG || {}) : {};

    class TelemetryLogger {
        constructor() {
            this.events = [];
            this.machineId = this.getMachineId();
            this.config = GLOBAL_CONFIG;
            this.frameUuid = this.generateUUID();
            this.callIndex = 0;
        }

        generateUUID() {
            try { return crypto.randomUUID(); } catch (e) {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        }

        getMachineId() {
            try {
                if (typeof localStorage === 'undefined') return "worker_nomem";
                let mid = localStorage.getItem('__PAL_MID__');
                if (!mid) {
                    mid = 'mid_' + Math.random().toString(36).substring(2, 15);
                    localStorage.setItem('__PAL_MID__', mid);
                }
                return mid;
            } catch (e) { return "restricted_context"; }
        }

        flush() {
            if (this.events.length === 0) return;
            try {
                const batchStr = JSON.stringify(this.events);
                console.log("__PAL_TELEM__:" + batchStr);
                this.events = [];
            } catch (e) { }
        }

        getFrameType(scope) {
            try {
                // Workers & Worklets
                if (typeof WorkerGlobalScope !== 'undefined' && scope instanceof WorkerGlobalScope) {
                    if (typeof ServiceWorkerGlobalScope !== 'undefined' && scope instanceof ServiceWorkerGlobalScope) return 'service_worker';
                    if (typeof SharedWorkerGlobalScope !== 'undefined' && scope instanceof SharedWorkerGlobalScope) return 'shared_worker';
                    if (typeof AudioWorkletGlobalScope !== 'undefined' && scope instanceof AudioWorkletGlobalScope) return 'audio_worklet';
                    return 'worker';
                }

                // Window Contexts
                if (scope && scope.document) {
                    if (scope.top === scope) return 'top';
                    try {
                        if (scope.origin === 'null' || !scope.origin) return 'iframe_sandbox';
                    } catch (e) { return 'iframe_sandbox'; }
                    if (scope.location.protocol === 'about:' || scope.location.protocol === 'javascript:') return 'iframe_srcdoc';
                    try {
                        if (scope.parent.location.origin !== scope.location.origin) return 'iframe_cross';
                    } catch (e) { return 'iframe_cross'; }
                    return 'iframe_same';
                }
            } catch (e) { return 'unknown'; }
            return 'unknown';
        }

        log(apiName, surface, outputHash = "null", timing = 0, error = false, scope = self) {
            try {
                const cache = (scope.__PAL_CACHE__) || (typeof window !== 'undefined' ? window.__PAL_CACHE__ : {});
                const event = {
                    // Input Context
                    run_id: this.config.run_id || "manual_session",
                    site_visit_id: this.config.site_visit_id || "manual_visit",
                    epoch_id: this.config.epoch || 0,
                    policy_scope: this.config.policy_scope || "site",

                    // Timing & Origin
                    timestamp: Date.now(),
                    full_origin: (typeof window !== 'undefined') ? window.location.origin : "worker",
                    top_level_site: (typeof window !== 'undefined' && window.top) ? window.top.location.hostname : "unknown",
                    frame_type: this.getFrameType(scope),
                    is_cross_origin_frame: this.isCross(scope),
                    document_referrer: (typeof document !== 'undefined') ? document.referrer : "",

                    // Event Data
                    api_name: apiName,
                    surface_name: surface,
                    output_hash: typeof outputHash === 'object' ? JSON.stringify(outputHash) : String(outputHash),
                    execution_time_ms: timing,
                    error_flag: error,

                    // Identity & Environment
                    machine_id: this.machineId,
                    persona_id: cache.seed || (typeof window !== 'undefined' && window.__PAL_CACHE__ ? window.__PAL_CACHE__.seed : "uninitialized"),
                    user_agent_spoofed: (scope.navigator && scope.navigator.userAgent) ? scope.navigator.userAgent : "unknown",
                    screen_geometry: (scope.screen) ? `${scope.screen.width}x${scope.screen.height}` : "unknown",

                    // Security
                    protected: (typeof WorkerGlobalScope !== 'undefined' || scope.origin === 'null'),
                    stack_trace_depth: (new Error()).stack.split('\n').length,
                    lie_flags: []
                };

                // Lie Logic
                if (this.config.mode === 'PROTECT' || this.config.mode === 'privacy') {
                    const NOISY = ['getImageData', 'toDataURL', 'getChannelData', 'getFloatFrequencyData', 'readPixels', 'measureText'];
                    const SPOOFED = ['getParameter', 'userAgent', 'hardwareConcurrency', 'deviceMemory', 'width', 'height', 'availWidth', 'availHeight'];

                    if (NOISY.includes(apiName)) event.lie_flags.push("NOISE_INJECTED");
                    if (SPOOFED.includes(apiName)) event.lie_flags.push("STATIC_SPOOF");
                }
                this.events.push(event);
                if (this.events.length >= 1) this.flush();
            } catch (e) { }
        }
        logHook(path) { }

        // Legacy Compatibility
        record(name, startTime, val) {
            try {
                const duration = performance.now() - startTime;
                const parts = name.split('.');
                const api = parts.length > 1 ? parts[parts.length - 1] : name;
                const surface = parts.length > 1 ? parts[0] : 'system';
                this.log(api, surface, val, duration);
            } catch (e) { }
        }
        expose() { }
    }

    const Telemetry = new TelemetryLogger();




    // Auto-flush on unload
    if (typeof window !== 'undefined') {
        window.addEventListener('unload', () => Telemetry.flush());
    }

    // 2. Cache Init (Hybrid: Push + Pull)
    // Respect existing cache from evaluateOnNewDocument
    let cache = (typeof window !== 'undefined' && window.__PAL_CACHE__)
        ? window.__PAL_CACHE__
        : { seed: null };

    // PUSH: Try Reading injected config first
    try {
        const stored = sessionStorage.getItem('__PAL_CACHE__');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.seed) cache = parsed;
        }
    } catch (e) { }

    // PARENT INHERITANCE (Fixes Coherence for Same-Origin Iframes)
    if (!cache.seed && typeof window !== 'undefined' && window.parent) {
        // Parent Inheritance (Same-Origin)
        try {
            if (window.parent.__PAL_CACHE__ && window.parent.__PAL_CACHE__.seed) {
                cache = window.parent.__PAL_CACHE__;
            }
        } catch (e) { }
    }

    window.__PAL_CACHE__ = cache;

    // PULL: If missing or opaque origin, ask Background (Fixes A/B)
    if (!cache.seed && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
            chrome.runtime.sendMessage({ type: 'PAL_HELLO' }, (response) => {
                if (response) {
                    window.__PAL_CACHE__ = response;
                    try { sessionStorage.setItem('__PAL_CACHE__', JSON.stringify(response)); } catch (e) { }
                    // Telemetry.metrics.realm.persona_id = response.seed; // Deprecated
                    // Telemetry.expose(); // Deprecated
                }
            });
        } catch (e) { }
    }

    if (cache.seed) {
        // Telemetry.metrics.realm.persona_id = cache.seed;
        // Telemetry.expose();
    }

    // 3. CORE HOOK LOGIC
    function installHooks(scope, forcedCache) {
        if (!scope) return;
        try {
            if (scope.__PAL_HOOKED) return;
            scope.__PAL_HOOKED = true;
        } catch (e) { return; }

        // console.log("[PAL] installHooks started. Cache keys:", Object.keys(forcedCache || {}));

        Telemetry.log('init', 'system', 'success', 0, false, scope);

        function safeHook(obj, prop, path) {
            try {
                if (!obj) return;
                const parts = path.split('.');
                const cat = parts[0];
                const key = parts[1];

                Telemetry.logHook(path);
                // console.log("[PAL] Hooking " + path);

                Object.defineProperty(obj, prop, {
                    get: () => {
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        // Fix: Don't lock on empty forcedCache
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});
                        if (c[cat] && c[cat][key]) return c[cat][key];
                        return undefined;
                    },
                    configurable: true
                });
            } catch (e) {
                console.error("[PAL] safeHook Error for " + path + ":", e);
            }
        }

        // Navigator
        try {
            const NavProto = scope.Navigator.prototype;
            safeHook(NavProto, 'userAgent', 'navigator.userAgent');
            safeHook(NavProto, 'appVersion', 'navigator.appVersion');
            safeHook(NavProto, 'platform', 'navigator.platform');
            safeHook(NavProto, 'hardwareConcurrency', 'navigator.hardwareConcurrency');
            safeHook(NavProto, 'deviceMemory', 'navigator.deviceMemory');
            // Expanded Coverage
            safeHook(NavProto, 'language', 'navigator.language');
            safeHook(NavProto, 'languages', 'navigator.languages');
            safeHook(NavProto, 'webdriver', 'navigator.webdriver');
            safeHook(NavProto, 'plugins', 'navigator.plugins');
            safeHook(NavProto, 'mimeTypes', 'navigator.mimeTypes');
        } catch (e) {
            const n = scope.navigator;
            if (n) {
                safeHook(n, 'userAgent', 'navigator.userAgent');
                safeHook(n, 'appVersion', 'navigator.appVersion');
                safeHook(n, 'platform', 'navigator.platform');
                safeHook(n, 'hardwareConcurrency', 'navigator.hardwareConcurrency');
                safeHook(n, 'deviceMemory', 'navigator.deviceMemory');
                // Expanded Coverage
                safeHook(n, 'language', 'navigator.language');
                safeHook(n, 'languages', 'navigator.languages');
                safeHook(n, 'webdriver', 'navigator.webdriver');
                safeHook(n, 'plugins', 'navigator.plugins');
                safeHook(n, 'mimeTypes', 'navigator.mimeTypes');
            }
        }

        // Permissions Hook (Expanded Coverage)
        try {
            if (scope.Permissions && scope.Permissions.prototype) {
                const nativeQuery = scope.Permissions.prototype.query;
                safeHook(scope.Permissions.prototype, 'query', async function (desc) {
                    const res = await nativeQuery.apply(this, arguments);
                    // Force 'prompt' for usually-fingerprinted sensitive apis if not explicitly granted?
                    // For now, just log and allow, or maybe force consistent state based on Blueprint?
                    // Implementation: Pass-through for now, but hook ensures we *can* return fake status
                    return res;
                });
            }
        } catch (e) { }

        // Screen
        try {
            const ScreenProto = scope.Screen.prototype;
            safeHook(ScreenProto, 'width', 'screen.width');
            safeHook(ScreenProto, 'height', 'screen.height');
            safeHook(ScreenProto, 'availWidth', 'screen.width');
            safeHook(ScreenProto, 'availHeight', 'screen.height');
            safeHook(ScreenProto, 'colorDepth', 'screen.colorDepth');
            safeHook(ScreenProto, 'pixelDepth', 'screen.pixelDepth');
            // Expanded Coverage
            safeHook(ScreenProto, 'availLeft', 'screen.availLeft');
            safeHook(ScreenProto, 'availTop', 'screen.availTop');
        } catch (e) { }

        // WebGL (getParameter) - Unified Hook for WebGL1 & WebGL2
        try {
            function hookWebGLParams(contextName) {
                if (!scope[contextName]) return;
                try {
                    Telemetry.logHook(contextName + '.getParameter');
                    const Proto = scope[contextName].prototype;
                    const getParam = Proto.getParameter;
                    safeHook(Proto, "getParameter", function (p) {
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});
                        if (c.webgl) {
                            if (p === 37445) return c.webgl.vendor;
                            if (p === 37446) return c.webgl.renderer;
                        }
                        return getParam.apply(this, arguments);
                    });
                } catch (e) { }
            }
            hookWebGLParams('WebGLRenderingContext');
            hookWebGLParams('WebGL2RenderingContext');
        } catch (e) { }

        // Utils
        const NATIVE_TOSTRING = Function.prototype.toString;
        const HOOK_MAP = new WeakMap();

        // Global ToString Hardening
        // Global ToString Hardening
        Function.prototype.toString = function () {
            if (HOOK_MAP.has(this)) {
                return HOOK_MAP.get(this);
            }
            return NATIVE_TOSTRING.apply(this, arguments);
        };
        // Recursive Masking
        HOOK_MAP.set(Function.prototype.toString, NATIVE_TOSTRING.call(NATIVE_TOSTRING));

        function safeHook(proto, methodName, handler) {
            try {
                if (!proto || !proto[methodName]) return;
                const original = proto[methodName];

                // Preserve metadata
                Object.defineProperty(handler, 'name', { value: original.name, configurable: true });
                Object.defineProperty(handler, 'length', { value: original.length, configurable: true });

                // Preserve descriptor
                const desc = Object.getOwnPropertyDescriptor(proto, methodName);

                // Spoof ToString
                HOOK_MAP.set(handler, NATIVE_TOSTRING.call(original));

                // Apply Hook
                Object.defineProperty(proto, methodName, {
                    value: handler,
                    configurable: true, // Native usually configurable
                    enumerable: desc ? desc.enumerable : true,
                    writable: true
                });
            } catch (e) { console.error("SafeHook Error", methodName, e); }
        }

        function mulberry32(a) {
            return function () {
                var t = a += 0x6D2B79F5;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            }
        }
        function xmur3(str) {
            let h = 1779033703 ^ str.length;
            for (let i = 0; i < str.length; i++) {
                h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
                h = h << 13 | h >>> 19;
            }
            return function () {
                h = Math.imul(h ^ h >>> 16, 2246822507);
                h = Math.imul(h ^ h >>> 13, 3266489909);
                return (h ^= h >>> 16) >>> 0;
            }
        }
        function sha256(ascii) {
            function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
            var mathPow = Math.pow; var maxWord = mathPow(2, 32); var lengthProperty = 'length'; var i, j;
            var result = ''; var words = []; var asciiBitLength = ascii[lengthProperty] * 8;
            var hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
            var k = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
            ascii += '\x80';
            while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
            for (i = 0; i < ascii[lengthProperty]; i++) {
                j = ascii.charCodeAt(i);
                if (j >> 8) return;
                words[i >> 2] |= j << ((3 - i) % 4) * 8;
            }
            words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
            words[words[lengthProperty]] = (asciiBitLength);
            for (j = 0; j < words[lengthProperty];) {
                var w = words.slice(j, j += 16); var oldHash = hash; hash = hash.slice(0, 8);
                for (i = 0; i < 64; i++) {
                    var i2 = i + j;
                    var w15 = w[i - 15], w2 = w[i - 2];
                    var a = hash[0], e = hash[4];
                    var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
                    var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                    hash = [(temp1 + temp2) | 0].concat(hash); hash[4] = (hash[4] + temp1) | 0;
                }
                for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
            }
            for (i = 0; i < 8; i++) {
                for (j = 3; j + 1; j--) {
                    var b = (hash[i] >> (j * 8)) & 255;
                    result += ((b < 16) ? 0 : '') + b.toString(16);
                }
            }
            return result;
            function applyNoise(imageData, seed, width, height) {
                if (!imageData) return imageData;
                const config = (typeof window !== 'undefined' && window.__PAL_CONFIG) || {};
                // Threat Model: Compat or Monitor -> No Noise
                if (config.mode === 'MONITOR' || config.mode === 'compat') return imageData;
                if (!seed) return imageData;

                // Use PRNG based on seed
                const seedFn = xmur3(seed);
                const rand = mulberry32(seedFn());

                // Threat Model: Privacy -> Higher Density
                const noiseRate = (config.mode === 'privacy') ? 32 : 64;

                const data = imageData.data;
                for (let i = 0; i < data.length; i += noiseRate) {
                    if (rand() > 0.5) data[i] = data[i] ^ 1;
                }
                return imageData;
            }

            try {
                if (scope.OffscreenCanvas) {
                    Telemetry.logHook('canvas.offscreen');
                    const OffscreenProto = scope.OffscreenCanvas.prototype;
                    const nativeConvertToBlob = OffscreenProto.convertToBlob;
                    OffscreenProto.convertToBlob = async function (options) {
                        const blob = await nativeConvertToBlob.apply(this, arguments);
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});
                        if (!c.seed) return blob;
                        try {
                            const bmp = await createImageBitmap(blob);
                            const canvas = new OffscreenCanvas(bmp.width, bmp.height);
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(bmp, 0, 0);
                            const imgData = ctx.getImageData(0, 0, bmp.width, bmp.height);
                            const noisy = applyNoise(imgData, c.seed, bmp.width, bmp.height);
                            ctx.putImageData(noisy, 0, 0);
                            Telemetry.record('Canvas.convertToBlob', performance.now(), 'triggered_by_call');
                            return nativeConvertToBlob.call(canvas, options);
                        } catch (e) { return blob; }
                    }
                }

                if (scope.HTMLCanvasElement) {
                    Telemetry.logHook('canvas.element');
                    const CanvasProto = scope.HTMLCanvasElement.prototype;
                    const CtxProto = scope.CanvasRenderingContext2D.prototype;
                    const nativeToDataURL = CanvasProto.toDataURL;
                    const nativeGetImageData = CtxProto.getImageData;

                    safeHook(CanvasProto, "toDataURL", function () {
                        const _start = performance.now();
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                        try {
                            if (!c.seed) return nativeToDataURL.apply(this, arguments);
                            if (this.width === 0 || this.height === 0) return nativeToDataURL.apply(this, arguments);
                            try {
                                const shadow = scope.document.createElement('canvas');
                                shadow.width = this.width; shadow.height = this.height;
                                const ctx = shadow.getContext("2d");
                                ctx.drawImage(this, 0, 0);
                                const imgData = nativeGetImageData.call(ctx, 0, 0, this.width, this.height);
                                if (c.seed) {
                                    const noisy = applyNoise(imgData, c.seed, this.width, this.height);
                                    ctx.putImageData(noisy, 0, 0);
                                }
                                const res = nativeToDataURL.apply(shadow, arguments);
                                Telemetry.record('Canvas.toDataURL', _start, res.length);
                                return res;
                            } catch (e) {
                                return nativeToDataURL.apply(this, arguments);
                            }
                        } finally { }
                    });

                    safeHook(CtxProto, "getImageData", function (sx, sy, sw, sh) {
                        const _start = performance.now();
                        const clean = nativeGetImageData.apply(this, arguments);
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                        let result = clean;
                        let trigger = "passive";

                        if (c.seed) {
                            result = applyNoise(clean, c.seed, sw, sh);
                            trigger = "always_active";
                        }

                        try {
                            let s = "";
                            const d = result.data;
                            for (let k = 0; k < Math.min(100, d.length); k++) s += d[k] + ",";
                            Telemetry.record('Canvas.getImageData.trigger', _start, trigger);
                            Telemetry.record('Canvas.getImageData', _start, sha256(s));
                        } catch (e) { }
                        return result;
                    });

                    // Expanded Coverage: MeasureText
                    const nativeMeasureText = CtxProto.measureText;
                    safeHook(CtxProto, "measureText", function (text) {
                        const metrics = nativeMeasureText.apply(this, arguments);
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                        if (c.seed) {
                            try {
                                const seedFn = xmur3(c.seed + (text ? text.length : 0));
                                const rand = mulberry32(seedFn());
                                const jitter = (rand() - 0.5) * 0.001;
                                try {
                                    Object.defineProperty(metrics, 'width', { value: metrics.width + jitter, writable: false });
                                } catch (e) { }
                            } catch (e) { }
                        }
                        return metrics;
                    });
                }

            } catch (e) { }

            // AUDIO
            try {
                if (scope.AudioBuffer) {
                    Telemetry.logHook('audio');
                    const BufferProto = scope.AudioBuffer.prototype;
                    const nativeGetChannelData = BufferProto.getChannelData;
                    const nativeCopyFromChannel = BufferProto.copyFromChannel;

                    BufferProto.getChannelData = function (channel) {
                        const _start = performance.now();
                        const data = nativeGetChannelData.apply(this, arguments);
                        try {
                            const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                            const config = (typeof window !== 'undefined' && window.__PAL_CONFIG) || {};
                            const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                            // Threat Model: Compat -> No Noise
                            if (c.seed && !this.__PAL_NOISY && config.mode !== 'MONITOR' && config.mode !== 'compat') {
                                this.__PAL_NOISY = true;
                                const length = this.length;
                                const channels = this.numberOfChannels;
                                const seedFn = xmur3(c.seed);
                                const rand = mulberry32(seedFn());

                                for (let i = 0; i < channels; i++) {
                                    const chData = nativeGetChannelData.call(this, i);
                                    const offset = (rand() - 0.5) * 1e-4;
                                    for (let j = 0; j < length; j++) {
                                        chData[j] += offset;
                                    }
                                }
                            }
                        } catch (e) { }

                        let str = "";
                        if (data && data.length > 0) {
                            for (let k = 0; k < Math.min(20, data.length); k++) str += data[k].toFixed(5) + ",";
                        }
                        Telemetry.record('AudioBuffer.getChannelData', _start, str);
                        return data;
                    };

                    BufferProto.copyFromChannel = function (dest, channelNumber, startInChannel) {
                        this.getChannelData(channelNumber);
                        return nativeCopyFromChannel.apply(this, arguments);
                    };
                }
            } catch (e) { }

            // WEBGL HOOK
            try {
                function hookWebGL(contextName) {
                    const GL = scope[contextName];
                    if (!GL) return;
                    const proto = GL.prototype;
                    const nativeReadPixels = proto.readPixels;

                    proto.readPixels = function (x, y, width, height, format, type, pixels) {
                        const _start = performance.now();
                        nativeReadPixels.apply(this, arguments);

                        try {
                            const config = (typeof window !== 'undefined' && window.__PAL_CONFIG) || {};
                            const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || {});

                            // Threat Model: Compat -> No Noise
                            if (c.seed && config.mode !== 'MONITOR' && config.mode !== 'compat' && pixels && pixels.length > 0) {
                                const seedFn = xmur3(c.seed);
                                const rand = mulberry32(seedFn());
                                // Privacy: Higher Noise
                                const limit = (config.mode === 'privacy') ? 100 : 50;
                                const noiseCount = Math.min(pixels.length, limit);

                                for (let i = 0; i < noiseCount; i++) {
                                    const idx = Math.floor(rand() * pixels.length);
                                    pixels[idx] = (pixels[idx] + 1) % 255;
                                }
                            }

                            let s = "";
                            for (let k = 0; k < Math.min(100, pixels.length); k++) s += pixels[k] + ",";
                            Telemetry.record('WebGL.readPixels', _start, sha256(s));
                        } catch (e) { }
                    };
                }
                hookWebGL('WebGLRenderingContext');
                hookWebGL('WebGL2RenderingContext');
            } catch (e) { }


            // WebRTC Strict
            try {
                if (scope.RTCPeerConnection) {
                    Telemetry.logHook('webrtc');
                    const NativeRTC = scope.RTCPeerConnection;
                    scope.RTCPeerConnection = function (config) {
                        const _start = performance.now();
                        const pc = new NativeRTC(config);

                        const globalConfig = (typeof window !== 'undefined' && window.__PAL_CONFIG) || {};
                        const isMonitor = (globalConfig.mode === 'MONITOR');
                        const isPrivacy = (globalConfig.mode === 'privacy');

                        const isSafeCandidate = (c) => {
                            if (isMonitor) return true; // Allow all in monitor
                            if (!c || !c.candidate) return true;
                            // Block srflx (exposed public IP)
                            if (c.candidate.indexOf('typ srflx') !== -1) return false;
                            // Threat Model: Privacy -> Block host entirely
                            if (isPrivacy && c.candidate.indexOf('typ host') !== -1) return false;
                            // Balanced: Block host only if likely sensitive
                            if (c.candidate.indexOf('typ host') !== -1 && /\b192\.168\./.test(c.candidate)) return false;
                            return true;
                        };

                        const nativeAddEventListener = pc.addEventListener;
                        pc.addEventListener = function (type, listener, options) {
                            if (type === 'icecandidate') {
                                const wrapped = function (e) {
                                    if (e.candidate && !isSafeCandidate(e.candidate)) {
                                        e.stopImmediatePropagation();
                                        e.stopPropagation();
                                        return;
                                    }
                                    return listener.apply(this, arguments);
                                };
                                return nativeAddEventListener.call(this, type, wrapped, options);
                            }
                            return nativeAddEventListener.apply(this, arguments);
                        };

                        Object.defineProperty(pc, 'onicecandidate', {
                            set: function (fn) {
                                if (!fn) return;
                                this._pal_onicecandidate = function (e) {
                                    if (e.candidate && !isSafeCandidate(e.candidate)) return;
                                    fn.call(this, e);
                                };
                                nativeAddEventListener.call(this, 'icecandidate', this._pal_onicecandidate);
                            },
                            get: function () { return this._pal_onicecandidate; }
                        });

                        Telemetry.record('RTCPeerConnection', _start);
                        return pc;
                    };

                    Object.defineProperty(scope, 'RTCPeerConnection', {
                        value: scope.RTCPeerConnection,
                        writable: true,
                        configurable: true
                    });

                    scope.RTCPeerConnection.prototype = NativeRTC.prototype;
                    scope.RTCPeerConnection.defaultIceServers = NativeRTC.defaultIceServers;

                    if (scope.webkitRTCPeerConnection) scope.webkitRTCPeerConnection = scope.RTCPeerConnection;
                    if (scope.mozRTCPeerConnection) scope.mozRTCPeerConnection = scope.RTCPeerConnection;
                }
            } catch (e) { }

        } // End installHooks

        // 4. FRAMES PROPAGATOR
        try {
            const IframeProto = window.HTMLIFrameElement.prototype;
            const nativeContentWindow = Object.getOwnPropertyDescriptor(IframeProto, 'contentWindow').get;

            Object.defineProperty(IframeProto, 'contentWindow', {
                get: function () {
                    const win = nativeContentWindow.call(this);
                    if (win) installHooks(win, window.__PAL_CACHE__);
                    return win;
                }
            });

            const nativeContentDocument = Object.getOwnPropertyDescriptor(IframeProto, 'contentDocument').get;
            Object.defineProperty(IframeProto, 'contentDocument', {
                get: function () {
                    const doc = nativeContentDocument.call(this);
                    if (doc && doc.defaultView) installHooks(doc.defaultView, window.__PAL_CACHE__);
                    return doc;
                }
            });

            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.tagName === 'IFRAME') {
                            try {
                                const win = node.contentWindow;
                                if (win) installHooks(win, window.__PAL_CACHE__);
                            } catch (e) { }

                            node.addEventListener('load', () => {
                                try {
                                    const win = node.contentWindow;
                                    if (win) installHooks(win, window.__PAL_CACHE__);
                                } catch (e) { }
                            });
                        }
                    }
                }
            });
            observer.observe(document.documentElement || document, { childList: true, subtree: true });

        } catch (e) { }


        // 5. Apply to Window
        installHooks(window, window.__PAL_CACHE__);


        // 6. ASYNC WORKER PROXY & SHAREDWORKER / OFFSCREEN LOGGING

        // SharedWorker Logging
        if (typeof window !== 'undefined' && window.SharedWorker) {
            const NativeSharedWorker = window.SharedWorker;
            window.SharedWorker = function (scriptURL, options) {
                console.log("[PAL] SharedWorker Creation Detected:", scriptURL);
                return new NativeSharedWorker(scriptURL, options);
            };
            window.SharedWorker.prototype = NativeSharedWorker.prototype;
            window.SharedWorker.toString = NativeSharedWorker.toString.bind(NativeSharedWorker);
        }

        // OffscreenCanvas Logging
        if (typeof window !== 'undefined' && window.OffscreenCanvas) {
            const NativeOffscreen = window.OffscreenCanvas;
            window.OffscreenCanvas = function (width, height) {
                console.log("[PAL] OffscreenCanvas Creation Detected");
                return new NativeOffscreen(width, height);
            };
            window.OffscreenCanvas.prototype = NativeOffscreen.prototype;
            window.OffscreenCanvas.toString = NativeOffscreen.toString.bind(NativeOffscreen);
        }

        const NativeWorker = window.Worker;
        window.Worker = function (scriptURL, options) {
            console.log("[PAL] Worker Creation Detected:", scriptURL);
            const proxy = {};
            const listeners = {};
            const msgQueue = [];
            let realWorker = null;
            let isTerminated = false;

            proxy.addEventListener = function (type, listener) {
                if (!listeners[type]) listeners[type] = [];
                listeners[type].push(listener);
                if (realWorker) realWorker.addEventListener(type, listener);
            };
            proxy.removeEventListener = function (type, listener) {
                if (listeners[type]) {
                    const idx = listeners[type].indexOf(listener);
                    if (idx > -1) listeners[type].splice(idx, 1);
                }
                if (realWorker) realWorker.removeEventListener(type, listener);
            };
            proxy.postMessage = function (msg, transfer) {
                if (realWorker) realWorker.postMessage(msg, transfer);
                else msgQueue.push({ msg, transfer });
            };
            proxy.terminate = function () {
                isTerminated = true;
                if (realWorker) realWorker.terminate();
            };

            let _onmessage = null;
            Object.defineProperty(proxy, 'onmessage', {
                get: () => _onmessage,
                set: (fn) => { _onmessage = fn; if (realWorker) realWorker.onmessage = fn; }
            });
            let _onerror = null;
            Object.defineProperty(proxy, 'onerror', {
                get: () => _onerror,
                set: (fn) => { _onerror = fn; if (realWorker) realWorker.onerror = fn; }
            });

            (async () => {
                if (isTerminated) return;
                try {

                    const originalContent = await fetch(scriptURL).then(r => r.text());
                    const cacheString = JSON.stringify(window.__PAL_CACHE__ || {});
                    const configString = JSON.stringify(window.__PAL_CONFIG || {});

                    const hookSource = `
            const GLOBAL_CONFIG = ${configString};
            ${TelemetryLogger.toString()}
            const Telemetry = new TelemetryLogger();
            ${installHooks.toString()}
            const __PAL_CACHE__ = ${cacheString};
            installHooks(self, __PAL_CACHE__);
        `;

                    const finalCode = hookSource + "\n" + originalContent;
                    const blob = new Blob([finalCode], { type: 'application/javascript' });
                    const blobUrl = URL.createObjectURL(blob);
                    realWorker = new NativeWorker(blobUrl, options);
                } catch (e) {
                    const cacheString = JSON.stringify(window.__PAL_CACHE__ || {});
                    const configString = JSON.stringify(window.__PAL_CONFIG || {});

                    const hookSource = `
            const GLOBAL_CONFIG = ${configString};
            ${TelemetryLogger.toString()}
            const Telemetry = new TelemetryLogger();
            ${installHooks.toString()}
            const __PAL_CACHE__ = ${cacheString};
            installHooks(self, __PAL_CACHE__);
            importScripts('${scriptURL}');
        `;

                    const blob = new Blob([hookSource], { type: 'application/javascript' });
                    const blobUrl = URL.createObjectURL(blob);
                    realWorker = new NativeWorker(blobUrl, options);
                }

                if (realWorker) {
                    if (_onmessage) realWorker.onmessage = _onmessage;
                    if (_onerror) realWorker.onerror = _onerror;
                    for (let type in listeners) {
                        listeners[type].forEach(l => realWorker.addEventListener(type, l));
                    }
                    msgQueue.forEach(item => realWorker.postMessage(item.msg, item.transfer));
                }
            })();
            return proxy;
        };

        window.Worker.prototype = NativeWorker.prototype;
        window.Worker.toString = NativeWorker.toString.bind(NativeWorker);

        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            if (event.data && event.data.type === 'PAL_UPDATE') {
                window.__PAL_CACHE__ = event.data.detail;
                try { sessionStorage.setItem('__PAL_CACHE__', JSON.stringify(event.data.detail)); } catch (e) { }
                if (window.__PAL_STATS && window.__PAL_STATS.realm) {
                    // window.__PAL_STATS.realm.persona_id = event.data.detail.seed; // Deprecated
                }
            }
        });

        installHooks(window, window.__PAL_CACHE__);
        try {
            Telemetry.log('init', 'system', 'success', Date.now() - INJECT_START);

            // 8. BREAKAGE METRICS
            // Capture errors that might be caused by our injection
            window.addEventListener('error', (event) => {
                try {
                    Telemetry.record('Breakage.error', 0, event.message || "Script Error");
                } catch (e) { }
            }, true);

            window.addEventListener('unhandledrejection', (event) => {
                try {
                    Telemetry.record('Breakage.rejection', 0, event.reason ? event.reason.toString() : "Unhandled Rejection");
                } catch (e) { }
            }, true);

            document.addEventListener('securitypolicyviolation', (event) => {
                try {
                    const report = `CSP: ${event.violatedDirective} blocked ${event.blockedURI}`;
                    Telemetry.record('Breakage.csp', 0, report);
                } catch (e) { }
            }, true);

        } catch (e) { }

    }) ();
