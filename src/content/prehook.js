
(function () {
    // Safe Global Scope
    const globalScope = (typeof globalThis !== 'undefined') ? globalThis : (typeof self !== 'undefined' ? self : window);

    try { globalScope.__PAL_CHECK = 'alive'; } catch (e) { }
    // Idempotency: Hard Guard against Runaway Injection
    if (globalScope.__PAL_INSTALLED__) return;
    globalScope.__PAL_INSTALLED__ = true;
    console.log("[PAL] SKELETON Inject");
    const INJECT_START = Date.now();

    // Double Injection Guard
    if (globalScope.__PAL_ACTIVE) return;
    globalScope.__PAL_ACTIVE = true;

    // 0. SHARED CONFIG
    const GLOBAL_CONFIG = (globalScope.__PAL_CONFIG || {});

    // REAL LOGGER IMPLEMENTATION (Schema V2 - Research Grade)
    class TelemetryLogger {
        constructor() {
            this.events = [];
            this.machineId = this.getMachineId();
            this.config = GLOBAL_CONFIG;
            this.siteVisitId = (this.config && this.config.site_visit_id) ? this.config.site_visit_id : this.generateUUID();
            this.callIndex = 0;
            this.frameUuid = this.generateUUID();
        }

        generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                try { return crypto.randomUUID(); } catch (e) { }
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        getMachineId() {
            try {
                if (typeof localStorage === 'undefined') return "worker_nomem";
                let mid = localStorage.getItem('__PAL_MID__');
                if (!mid) { mid = 'mid_' + Math.random().toString(36).substring(2, 15); localStorage.setItem('__PAL_MID__', mid); }
                return mid;
            } catch (e) { return "restricted_context"; }
        }

        isCross(scope) {
            try {
                if (!scope) scope = globalScope;
                if (scope.self !== scope.top) {
                    try {
                        return scope.parent.location.origin !== scope.location.origin;
                    } catch (e) { return true; }
                }
                return false;
            } catch (e) { return true; }
        }

        getFrameType(scope) {
            try {
                if (typeof WorkerGlobalScope !== 'undefined' && scope instanceof WorkerGlobalScope) return 'worker';
                if (scope.constructor && scope.constructor.name && scope.constructor.name.includes('WorkerGlobalScope')) return 'worker';
                if (typeof SharedWorkerGlobalScope !== 'undefined' && scope instanceof SharedWorkerGlobalScope) return 'shared_worker';
                if (typeof ServiceWorkerGlobalScope !== 'undefined' && scope instanceof ServiceWorkerGlobalScope) return 'service_worker';
                if (scope.document && scope.top === scope) return 'top';
            } catch (e) { }
            return 'iframe';
        }

        // V2 Log Signature: Explicit separation of output and error
        log(api, surface, outputHash, errorMsg, duration, isLie, scope) {
            try {
                this.callIndex++;
                const event = {
                    event_type: 'api_call',
                    run_id: (this.config && this.config.run_id) ? this.config.run_id : "unknown",
                    epoch_id: (this.config && this.config.epoch_id) || 0,
                    persona_id: (this.config && this.config.persona_id) || "unknown",
                    top_level_site: (this.config && this.config.top_level_site) || "unknown",
                    full_origin: (scope.location) ? scope.location.href : "unknown",
                    frame_type: this.getFrameType(scope),

                    is_cross_origin_frame: this.isCross(scope),

                    // API Details
                    surface_name: surface || "unknown", // Renamed from api_surface
                    api_name: api || "unknown",         // Renamed from api_method
                    call_index: this.callIndex,

                    // Output & Error (Strict Types)
                    arguments_hash: null,
                    output_hash: (typeof outputHash === "object" && outputHash && outputHash.spoofed) ? outputHash.spoofed : outputHash,
                    output_class: (errorMsg) ? "THREW_EXCEPTION" :
                        ((typeof outputHash === "object" && outputHash && outputHash.spoofed) || (outputHash && typeof outputHash === "string")) ? "VALUE_HASHED" :
                            (api === "init") ? "SYSTEM_SIGNAL" : "UNSUPPORTED",

                    raw_output_sample: null,
                    error_flag: !!errorMsg,
                    error_message: errorMsg ? String(errorMsg).substring(0, 100) : null,

                    timing_ms: duration, // Renamed from execution_time_ms
                    lie_probability: (this.config.mode === 'privacy') ? 1.0 : 0.0,
                    lie_method: (this.config.mode === 'privacy') ? "noise" : "none",

                    trace_id: this.generateUUID(),

                    // V3 Fields: Hash Consistecy & Drift
                    top_level_site_etld1: (this.config && this.config.top_level_site_etld1) ? this.config.top_level_site_etld1 : "unknown",
                    clean_output_hash: (typeof outputHash === "object" && outputHash && outputHash.clean) ? outputHash.clean : null,
                    stimulus_hash: (typeof outputHash === "object" && outputHash && outputHash.stimulus) ? outputHash.stimulus : null,

                    // V3: Run Metadata
                    ablation_mode: (this.config && this.config.mode) || "unknown",
                    webrtc_policy: (this.config && this.config.features_enabled && this.config.features_enabled.webrtc) ? "active" : "unknown",

                    // V4: Encirclement Fields (Phase 12)
                    lie_flags: (isLie && this.config.mode === 'privacy') ? ["noise_injected"] : [],
                    policy_decision: (this.config && this.config.policy_decision) || "seeded",
                    context_join_key: (this.config && this.config.context_join_key) || "unknown"
                };

                this.events.push(event);
                if (this.events.length >= 1) this.flush();
            } catch (e) {
                // Failsafe
            }
        }

        logEvasion(results) {
            try {
                this.callIndex++;
                const scope = globalScope;
                const cache = (scope.__PAL_CACHE__ || globalScope.__PAL_CACHE__ || {});

                const event = {
                    event_type: "evasion_result",
                    timestamp: new Date().toISOString(),
                    site_visit_id: this.siteVisitId,
                    run_id: (this.config && this.config.run_id) ? this.config.run_id : "unknown",
                    machine_id: this.machineId,
                    persona_id: (this.config && this.config.persona_id) || cache.id || "unknown",
                    blueprint_id: (this.config && this.config.blueprint_id) || cache.blueprint_id || "unknown",
                    epoch_id: (this.config && this.config.epoch_id) || cache.epoch_id || 0,
                    seed_derivation_version: (this.config && this.config.seed_derivation_version) || cache.seed_derivation_version || 0,

                    lie_flags: [],
                    policy_decision: (this.config && this.config.policy_decision) || "seeded",
                    context_join_key: (this.config && this.config.context_join_key) || "unknown",

                    frame_id: this.frameUuid,
                    frame_type: this.getFrameType(scope),
                    url: scope.location ? scope.location.href : "unknown",
                    frame_type: this.getFrameType(scope),
                    url: scope.location ? scope.location.href : "unknown",
                    top_level_site: (this.config && this.config.top_level_site) || "unknown",
                    top_level_site_etld1: (this.config && this.config.top_level_site_etld1) || "unknown",
                    full_origin: scope.location ? scope.location.origin : "unknown",
                    call_index: this.callIndex,

                    // Structured Results
                    overall_pass: results.overall_pass,
                    vectors: results.vectors
                };

                this.events.push(event);
                if (this.events.length >= 1) this.flush();
            } catch (e) { }
        }

        record(name, startTime, val) {
            // Legacy -> V2 Adapter
            // Assume val IS the hash if string, or create hash if not.
            // But wait, existing code passes 'val' which might be raw.
            // Ideally record() should be deprecated or upgraded.
            // For now, if val looks like a hash, use it.
            const parts = name.split('.');
            const api = parts.length > 1 ? parts[parts.length - 1] : name;
            const surface = parts.length > 1 ? parts[0] : 'system';

            // Simple heuristics
            let hash = null;
            if (typeof val === 'string' && val.length > 20) hash = val; // Assuming already hashed or long string

            this.log(api, surface, hash, null, performance.now() - startTime, false, globalScope);
        }

        logHook(path) { }

        flush() {
            if (this.events.length === 0) return;
            try {
                const batchStr = JSON.stringify(this.events);
                const msg = "__PAL_TELEM__:" + batchStr;
                console.log(msg);
                if (typeof postMessage === 'function') {
                    try { postMessage(msg); } catch (e) { }
                }
                this.events = [];
            } catch (e) { }
        }
    }
    const Telemetry = new TelemetryLogger();
    globalScope.__PAL_TELEMETRY = Telemetry;

    // CACHE INIT (V3: Merge Injected Config)
    globalScope.__PAL_CACHE__ = Object.assign({ seed: null }, GLOBAL_CONFIG);

    // Seed Derivation Logic (Research Grade)
    if (GLOBAL_CONFIG.seed) {
        globalScope.__PAL_CACHE__.seed = GLOBAL_CONFIG.seed;
    } else if (GLOBAL_CONFIG.persona_id) {
        // Deterministic derivation for Compat/Privacy
        const base = GLOBAL_CONFIG.persona_id;
        if (GLOBAL_CONFIG.mode === 'privacy') {
            // Privacy: Seed MUST change with Epoch (Unlinkability)
            // If Epoch is missing, default to 0 (Static).
            // But strict Schema V2 says epoch is mandatory.
            const ep = GLOBAL_CONFIG.epoch_id || 0;
            // Remix persona with epoch to get unique seed per session
            // Using internal sha256 or simple string concat hashed later manually
            globalScope.__PAL_CACHE__.seed = "priv_" + base + "_" + ep;
        } else {
            // Compat: Seed MUST be stable across Epochs (Stability)
            globalScope.__PAL_CACHE__.seed = "compat_" + base;
        }
    }
    console.log(`[PAL DEBUG] Init Seed=${globalScope.__PAL_CACHE__.seed} Mode=${GLOBAL_CONFIG.mode} Epoch=${GLOBAL_CONFIG.epoch_id} Persona=${GLOBAL_CONFIG.persona_id}`);


    // EMPTY HOOKS
    function installHooks(scope, forcedCache) {
        if (!scope) return;
        Telemetry.log('init', 'system', null, null, 0, false, scope);

        // V3: Structured Anti-Evasion Test (Once per context)
        try {
            const toStringSafe = Function.prototype.toString;
            const toStringCheck = (toStringSafe.call(toStringSafe) === "function toString() { [native code] }");
            const descCheck = !!Object.getOwnPropertyDescriptor(Function.prototype, "toString");

            Telemetry.logEvasion({
                overall_pass: toStringCheck && descCheck,
                vectors: [
                    { name: "toString_integrity", pass: toStringCheck, score: toStringCheck ? 1 : 0 },
                    { name: "descriptor_integrity", pass: descCheck, score: descCheck ? 1 : 0 }
                ]
            });
        } catch (e) { }
        // UTILS
        // ROBUST ANTI-EVASION (User Point 2)
        const NATIVE_TOSTRING_STR = Function.prototype.toString.call(Function.prototype.toString);
        const HOOK_MAP = new WeakMap();

        function protectFunction(fn, original, nameOverride) {
            const name = nameOverride || original.name;
            const nativeString = Function.prototype.toString.call(original);

            // 1. Map for toString
            HOOK_MAP.set(fn, nativeString);

            // 2. Descriptors (Metadata parity)
            Object.defineProperty(fn, 'name', { value: name, configurable: true, writable: false, enumerable: false });
            Object.defineProperty(fn, 'length', { value: original.length, configurable: true, writable: false, enumerable: false });

            // 3. Arguments/Caller (Poison)
            // 'arguments' and 'caller' are strictly forbidden in strict mode, but some engines might expose them. 
            // Best practice: Do not touch unless needed.

            return fn;
        }

        // Hardened Function.prototype.toString
        if (!Function.prototype.__PAL_TOSTRING_HOOKED) {
            const originalToString = Function.prototype.toString;

            // Define the hook
            const toStringHook = function () {
                // If called on a hooked function, return the native string
                if (HOOK_MAP.has(this)) {
                    return HOOK_MAP.get(this);
                }
                // If called on the hook itself, return native string for toString
                if (this === toStringHook) {
                    return NATIVE_TOSTRING_STR;
                }
                return originalToString.apply(this, arguments);
            };

            // Protect the hook itself
            HOOK_MAP.set(toStringHook, NATIVE_TOSTRING_STR);
            Object.defineProperty(toStringHook, 'name', { value: "toString", configurable: true, writable: true, enumerable: false }); // V8 standard

            Function.prototype.toString = toStringHook;
            Object.defineProperty(Function.prototype, 'toString', { enumerable: false }); // Standard
            Function.prototype.__PAL_TOSTRING_HOOKED = true;
        }

        function safeHook(proto, methodName, handler) {
            try {
                if (!proto || !proto[methodName]) return;
                const original = proto[methodName];
                protectFunction(handler, original);

                const desc = Object.getOwnPropertyDescriptor(proto, methodName);
                Object.defineProperty(proto, methodName, {
                    value: handler,
                    configurable: true,
                    enumerable: desc ? desc.enumerable : true,
                    writable: true
                });
            } catch (e) { }
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
        }

        function applyNoise(imageData, seed, width, height, contextName) {
            if (!imageData) return imageData;

            // 1. Resolve Config Explicitly (No heuristic)
            const globalConfig = globalScope.__PAL_CONFIG || (typeof self !== 'undefined' ? self.__PAL_CONFIG : {}) || (typeof window !== 'undefined' ? window.__PAL_CONFIG : {}) || {};

            // 2. Check Mode Check (Compat/Monitor -> Hard Off)
            if (globalConfig.mode !== 'privacy') return imageData;
            if (!seed) return imageData;

            // 3. Robust Seed Derivation (User Rule: H(seed + epoch + content + surface))
            // Note: 'seed' already contains base+epoch in Privacy mode strings (e.g. "priv_BASE_EPOCH").
            // We mix it with Content and Context to ensure "Epoch-coupled noise" that is unique per image/surface.

            // Content Hash (Partial for perf, but sufficient for drift if seed varies)
            const contentSnippet = imageData.data.slice(0, 100).join(",");
            const derivationInput = seed + "_" + contentSnippet + "_" + (contextName || "Unknown");

            const derivedSeed = sha256(derivationInput);

            // 4. Apply Noise
            const seedFn = xmur3(derivedSeed);
            const rand = mulberry32(seedFn());

            // Privacy -> Noise Rate 32 (High Density)
            const noiseRate = 32;

            const data = imageData.data;
            // Iterate and flip bits
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

                safeHook(OffscreenProto, "convertToBlob", async function (options) {
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
                        // Noise already applied via ctx.getImageData if hooked? No, this is internal helper. 
                        // Actually, if we hook OffscreenCanvasRenderingContext2D, then ctx.getImageData calls HERE will loop?
                        // No, safeHook wraps the prototype. 
                        // Logic below applies noise manually.
                        const noisy = applyNoise(imgData, c.seed, bmp.width, bmp.height);
                        ctx.putImageData(noisy, 0, 0);
                        Telemetry.record('Canvas.convertToBlob', performance.now(), 'triggered_by_call');
                        return nativeConvertToBlob.call(canvas, options);
                    } catch (e) { return blob; }
                });

                if (scope.OffscreenCanvasRenderingContext2D) {
                    const OffscreenCtxProto = scope.OffscreenCanvasRenderingContext2D.prototype;
                    const nativeGetImageDataOffscreen = OffscreenCtxProto.getImageData;

                    safeHook(OffscreenCtxProto, "getImageData", function (sx, sy, sw, sh) {
                        const _start = performance.now();
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});
                        let clean = null;

                        try {
                            clean = nativeGetImageDataOffscreen.apply(this, arguments);
                            const cleanBytes = clean.data;
                            const stimulusHash = sha256(cleanBytes);

                            if (!c.seed) {
                                Telemetry.log('getImageData', 'Canvas', { clean: stimulusHash, stimulus: stimulusHash }, null, performance.now() - _start, false, scope);
                                return clean;
                            }

                            const noisy = applyNoise(clean, c.seed, sw, sh);
                            const spoofedHash = sha256(noisy.data);

                            Telemetry.log('getImageData', 'Canvas', {
                                clean: stimulusHash,
                                spoofed: spoofedHash,
                                stimulus: stimulusHash
                            }, null, performance.now() - _start, true, scope);
                            return noisy;
                        } catch (e) {
                            Telemetry.log('getImageData', 'Canvas', null, e.message, performance.now() - _start, false, scope);
                            return nativeGetImageDataOffscreen.apply(this, arguments);
                        }
                    });
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
                    let clean = null;

                    try {
                        clean = nativeToDataURL.apply(this, arguments);
                        // STIMULUS CORRECTION (User Point 3): Hash of clean content
                        const stimulusHash = sha256(clean);

                        if (!c.seed) {
                            Telemetry.log('toDataURL', 'Canvas', { clean: stimulusHash, stimulus: stimulusHash }, null, performance.now() - _start, false, scope);
                            return clean;
                        } else {
                            // Noise Mode
                            const shadow = scope.document.createElement('canvas');
                            shadow.width = this.width; shadow.height = this.height;
                            const ctx = shadow.getContext("2d");
                            ctx.drawImage(this, 0, 0);
                            const imgData = nativeGetImageData.call(ctx, 0, 0, this.width, this.height);

                            const noisy = applyNoise(imgData, c.seed, this.width, this.height);
                            ctx.putImageData(noisy, 0, 0);

                            const spoofed = nativeToDataURL.apply(shadow, arguments);

                            Telemetry.log('toDataURL', 'Canvas', {
                                clean: stimulusHash,
                                spoofed: sha256(spoofed),
                                stimulus: stimulusHash // Invariant: stimulus == clean hash
                            }, null, performance.now() - _start, (stimulusHash !== sha256(spoofed)), scope);
                            return spoofed;
                        }
                    } catch (e) {
                        Telemetry.log('toDataURL', 'Canvas', null, e.message, performance.now() - _start, false, scope);
                        return nativeToDataURL.apply(this, arguments);
                    }
                });

                safeHook(CtxProto, "getImageData", function (sx, sy, sw, sh) {
                    const _start = performance.now();
                    const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                    const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});
                    let clean = null;

                    try {
                        clean = nativeGetImageData.apply(this, arguments);
                        // STIMULUS CORRECTION (User Point 3): Hash of FULL clean bytes
                        // Note: Full hash is expensive but required for rigorous drift proof.
                        // Can optimize to subsample if performance tanks, but user requested invariant.
                        const cleanBytes = clean.data;
                        const stimulusHash = sha256(cleanBytes);

                        if (!c.seed) {
                            Telemetry.log('getImageData', 'Canvas', { clean: stimulusHash, stimulus: stimulusHash }, null, performance.now() - _start, false, scope);
                            return clean;
                        }

                        const noisy = applyNoise(clean, c.seed, sw, sh);
                        const spoofedHash = sha256(noisy.data);

                        Telemetry.log('getImageData', 'Canvas', {
                            clean: stimulusHash,
                            spoofed: spoofedHash,
                            stimulus: stimulusHash
                        }, null, performance.now() - _start, (stimulusHash !== spoofedHash), scope);
                        return noisy;
                    } catch (e) {
                        Telemetry.log('getImageData', 'Canvas', null, e.message, performance.now() - _start, false, scope);
                        return nativeGetImageData.apply(this, arguments);
                    }
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

        // OFFSCREEN CANVAS HOOK (Expanded for Privacy Drift)
        try {
            if (scope.OffscreenCanvas && scope.OffscreenCanvas.prototype) {
                Telemetry.logHook('OffscreenCanvas');
                console.log('[PAL DEBUG] Hooking OffscreenCanvas.prototype');
                const OffscreenProto = scope.OffscreenCanvas.prototype;
                const nativeGetContext = OffscreenProto.getContext;

                OffscreenProto.getContext = function (type, options) {
                    console.log(`[PAL DEBUG] OffscreenCanvas.getContext(${type})`);
                    const ctx = nativeGetContext.apply(this, arguments);
                    if (!ctx) return ctx;

                    // Intercept 2D Context
                    if (type === '2d' || type === 'offscreencanvasrenderingcontext2d') {
                        console.log('[PAL DEBUG] Intercepting Offscreen 2D Context');
                        // Hook instance method if not already hooked
                        if (ctx.getImageData && !ctx.getImageData.__PAL_HOOKED) {
                            const nativeGetImageData = ctx.getImageData;
                            ctx.getImageData = function (sx, sy, sw, sh) {
                                console.log('[PAL DEBUG] Offscreen getImageData');
                                const _start = performance.now();
                                const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                                const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                                try {
                                    const clean = nativeGetImageData.apply(this, arguments);
                                    if (clean && clean.data) {
                                        // Fix Hash: Use slice and join
                                        const cleanStr = clean.data.slice(0, 100).join(",");
                                        const stimulusHash = sha256(cleanStr);

                                        if (!c.seed) {
                                            Telemetry.log('getImageData', 'OffscreenCanvas', { clean: stimulusHash, stimulus: stimulusHash }, null, performance.now() - _start, false, scope);
                                            return clean;
                                        }

                                        const ctxName = (scope.HTMLCanvasElement && ctx.canvas instanceof scope.HTMLCanvasElement) ? 'Canvas2D' : 'OffscreenCanvas2D';
                                        const noisy = applyNoise(clean, c.seed, sw, sh, ctxName);
                                        // Hash noisy data
                                        const noisyStr = noisy.data.slice(0, 100).join(",");
                                        const spoofedHash = sha256(noisyStr);

                                        Telemetry.log('getImageData', 'OffscreenCanvas', {
                                            clean: stimulusHash,
                                            spoofed: spoofedHash,
                                            stimulus: stimulusHash
                                        }, null, performance.now() - _start, (stimulusHash !== spoofedHash), scope);
                                        return noisy;
                                    }
                                    return clean;
                                } catch (e) {
                                    Telemetry.log('getImageData', 'OffscreenCanvas', null, e.message, performance.now() - _start, false, scope);
                                    return nativeGetImageData.apply(this, arguments);
                                }
                            };
                            Object.defineProperty(ctx.getImageData, '__PAL_HOOKED', { value: true, enumerable: false });
                        }
                    }
                    return ctx;
                };
            }
        } catch (e) { console.log('[PAL DEBUG] Error hooking Offscreen:', e.message); }



        // AUDIO
        try {
            if (scope.AudioBuffer) {
                Telemetry.logHook('audio');
                const BufferProto = scope.AudioBuffer.prototype;
                const nativeGetChannelData = BufferProto.getChannelData;
                const nativeCopyFromChannel = BufferProto.copyFromChannel;

                BufferProto.getChannelData = function (channel) {
                    const _start = performance.now();
                    const clean = nativeGetChannelData.apply(this, arguments);
                    const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                    const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                    // Stimulus: Length + SampleRate + Channel Index
                    const stimulus = this.length + "_" + this.sampleRate + "_" + channel;

                    // Capture Clean (Slice to avoid huge strings)
                    const cleanStr = clean.slice(0, 500).join(",");

                    // Threat Model: Compat -> No Noise
                    // Explicitly check for 'privacy' mode or 'noise' lie method
                    // Also ensure we have a seed.
                    const shouldSpoof = (c.seed && (c.mode === 'privacy' || c.mode === 'protect'));

                    if (!shouldSpoof || (this.__PAL_NOISY)) {
                        Telemetry.log('getChannelData', 'AudioBuffer', sha256(cleanStr), null, performance.now() - _start, false, scope);
                        return clean;
                    }

                    // Apply Noise (In-Place)
                    this.__PAL_NOISY = true;

                    try {
                        const seedFn = xmur3(c.seed + "_" + channel); // Vary by channel
                        const rand = mulberry32(seedFn());
                        // Noise magnitude
                        const mag = 1e-4;

                        // Optimize: Don't loop entire buffer if huge, but we must for realism.
                        // For performance, maybe stride? No, full buffer.
                        for (let j = 0; j < clean.length; j++) {
                            // Deterministic noise per sample index?
                            // To be fast: add constant offset? unique per channel?
                            // User wants drift across sessions.
                            // c.seed changes -> offset changes.
                            clean[j] += (rand() - 0.5) * mag;
                        }
                    } catch (e) { }

                    const noisyStr = clean.slice(0, 500).join(",");

                    Telemetry.log('getChannelData', 'AudioBuffer', {
                        clean: sha256(cleanStr),
                        spoofed: sha256(noisyStr),
                        stimulus: sha256(stimulus)
                    }, null, performance.now() - _start, (sha256(cleanStr) !== sha256(noisyStr)), scope);

                    return clean;
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
                        const globalCache = (typeof window !== 'undefined') ? window.__PAL_CACHE__ : {};
                        const c = (forcedCache && forcedCache.seed) ? forcedCache : (scope.__PAL_CACHE__ || globalCache || {});

                        // Capture Clean State
                        let sClean = "";
                        // Hash clean data (partial)
                        if (pixels && pixels.length > 0) {
                            const snip = pixels.slice(0, 100).join(",");
                            sClean = snip; // Just snippet for debug/stimulus? No, we used full hash before? 
                            // Wait. Previous code looped 500.
                            // Let's stick to simple hashing. 
                            for (let k = 0; k < Math.min(500, pixels.length); k++) sClean += pixels[k] + ",";
                        }
                        const cleanHash = sha256(sClean);

                        const stimulus = contextName + "_" + x + "_" + y + "_" + width + "_" + height;
                        const stimulusHash = sha256(stimulus);

                        // Threat Model: Compat -> No Noise
                        // applyNoise handles checks.

                        // Wrap pixels compatible with applyNoise logic
                        const fakeImageData = { data: pixels };
                        // Note: applyNoise returns 'imageData'.
                        // Apply noise in place on 'pixels' (passed by reference inside object).

                        applyNoise(fakeImageData, c.seed, width, height, contextName);

                        let sSpoofed = "";
                        for (let k = 0; k < Math.min(500, pixels.length); k++) sSpoofed += pixels[k] + ",";
                        const spoofedHash = sha256(sSpoofed);

                        const outputObj = {
                            clean: cleanHash,
                            spoofed: spoofedHash,
                            stimulus: stimulusHash
                        };

                        Telemetry.log('readPixels', 'WebGL', outputObj, null, performance.now() - _start, (cleanHash !== spoofedHash), scope);

                    } catch (e) {
                        Telemetry.log('readPixels', 'WebGL', null, e.message, performance.now() - _start, false, scope);
                    }
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
            safeHook(ScreenProto, 'availLeft', 'screen.availLeft');
            safeHook(ScreenProto, 'availTop', 'screen.availTop');
        } catch (e) { }

        // WebGL (getParameter)
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

        // EXPANDED SURFACES (Requirement D)
        // NavigatorUAData
        try {
            if (scope.navigator && scope.navigator.userAgentData) {
                // userAgentData might be on navigator instance or prototype? Usually instance.
                // But getHighEntropyValues is on NavigatorUAData.prototype
                const uaData = scope.navigator.userAgentData;
                const proto = Object.getPrototypeOf(uaData);
                const nativeGetHighEntropy = proto.getHighEntropyValues;

                safeHook(proto, 'getHighEntropyValues', async function (hints) {
                    const _start = performance.now();
                    try {
                        const res = await nativeGetHighEntropy.apply(this, arguments);
                        Telemetry.log('getHighEntropyValues', 'NavigatorUAData', JSON.stringify(res), null, performance.now() - _start, false, scope);
                        return res;
                    } catch (e) {
                        Telemetry.log('getHighEntropyValues', 'NavigatorUAData', null, e.message, performance.now() - _start, false, scope);
                        throw e;
                    }
                });
            }
        } catch (e) { }

        // Intl
        try {
            if (scope.Intl && scope.Intl.DateTimeFormat) {
                const DTProto = scope.Intl.DateTimeFormat.prototype;
                const nativeResolved = DTProto.resolvedOptions;
                safeHook(DTProto, 'resolvedOptions', function () {
                    const _start = performance.now();
                    try {
                        const res = nativeResolved.apply(this, arguments);
                        Telemetry.log('resolvedOptions', 'Intl.DateTimeFormat', JSON.stringify(res), null, performance.now() - _start, false, scope);
                        return res;
                    } catch (e) {
                        return nativeResolved.apply(this, arguments);
                    }
                });
            }
        } catch (e) { }

    }

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
                if (doc && doc.defaultView) installHooks(doc.defaultView, globalScope.__PAL_CACHE__);
                return doc;
            }
        });

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.tagName === 'IFRAME') {
                        try {
                            const win = node.contentWindow;
                            if (win) installHooks(win, globalScope.__PAL_CACHE__);
                        } catch (e) { }

                        node.addEventListener('load', () => {
                            try {
                                const win = node.contentWindow;
                                if (win) installHooks(win, globalScope.__PAL_CACHE__);
                            } catch (e) { }
                        });
                    }
                }
            }
        });
        observer.observe(document.documentElement || document, { childList: true, subtree: true });

    } catch (e) { }

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

    if (typeof window !== 'undefined' && window.Worker) {
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
                    const cacheString = JSON.stringify(globalScope.__PAL_CACHE__ || {});
                    const configString = JSON.stringify(globalScope.__PAL_CONFIG || {});

                    const hookSource = `
                const globalScope = self;
                const GLOBAL_CONFIG = ${configString};
                globalScope.__PAL_CONFIG = GLOBAL_CONFIG;
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
                    const cacheString = JSON.stringify(globalScope.__PAL_CACHE__ || {});
                    const configString = JSON.stringify(globalScope.__PAL_CONFIG || {});

                    const hookSource = `
                const globalScope = self;
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

        if (window.Worker) {
            window.Worker.prototype = NativeWorker.prototype;
            window.Worker.toString = NativeWorker.toString.bind(NativeWorker);
        }
    }

    if (globalScope.addEventListener) {
        globalScope.addEventListener('message', (event) => {
            // In Worker, source check might be different or unavailable.
            // If window exists, stricter check.
            if (typeof window !== 'undefined' && event.source !== window) return;

            if (event.data && event.data.type === 'PAL_UPDATE') {
                globalScope.__PAL_CACHE__ = event.data.detail;
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('__PAL_CACHE__', JSON.stringify(event.data.detail));
                    }
                } catch (e) { }
            }
        });
    }

    // V3: Worker Support for Hooks
    installHooks(globalScope, globalScope.__PAL_CACHE__);

    try {
        Telemetry.log('init', 'system', null, null, Date.now() - INJECT_START, false, globalScope);

        // 8. BREAKAGE METRICS
        // Capture errors that might be caused by our injection
        if (typeof globalScope.addEventListener !== 'undefined') {
            globalScope.addEventListener('error', (event) => {
                try {
                    Telemetry.log('error', 'Breakage', null, event.message || "Script Error", 0, false, globalScope);
                } catch (e) { }
            }, true);

            globalScope.addEventListener('unhandledrejection', (event) => {
                try {
                    Telemetry.log('rejection', 'Breakage', null, event.reason ? event.reason.toString() : "Unhandled Rejection", 0, false, globalScope);
                } catch (e) { }
            }, true);
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('securitypolicyviolation', (event) => {
                try {
                    const report = `CSP: ${event.violatedDirective} blocked ${event.blockedURI}`;
                    Telemetry.log('csp', 'Breakage', null, report, 0, false, globalScope);
                } catch (e) { }
            }, true);
        }

    } catch (e) { }

})();
