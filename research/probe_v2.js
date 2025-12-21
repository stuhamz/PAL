
(function () {
    const globalScope = (typeof window !== 'undefined') ? window : self;
    const PROBE_VERSION = "0.9.1";

    // --- Utils ---
    function logEvent(eventType, payload) {
        const config = globalScope.__PAL_CONFIG || {};
        const telemetry = globalScope.__PAL_TELEMETRY || {};

        const event = {
            event_type: eventType,
            timestamp: new Date().toISOString(),
            run_id: (telemetry.config && telemetry.config.run_id) || config.run_id || "unknown",
            site_visit_id: telemetry.siteVisitId || config.site_visit_id || "unknown",
            machine_id: telemetry.machineId || config.machine_id || "unknown",
            persona_id: (telemetry.config && telemetry.config.persona_id) || config.persona_id || "unknown",
            blueprint_id: (telemetry.config && telemetry.config.blueprint_id) || config.blueprint_id || "unknown",
            epoch_id: (telemetry.config && telemetry.config.epoch_id) || config.epoch_id || 0,
            seed_derivation_version: (telemetry.config && telemetry.config.seed_derivation_version) || config.seed_derivation_version || 0,

            // V4: Encirclement Fields (Phase 12)
            lie_flags: [],
            policy_decision: (telemetry.config && telemetry.config.policy_decision) || config.policy_decision || "seeded",
            context_join_key: (telemetry.config && telemetry.config.context_join_key) || config.context_join_key || "unknown",

            url: (globalScope.location) ? globalScope.location.href : "unknown",
            top_level_site: config.top_level_site || "unknown",
            top_level_site_etld1: config.top_level_site_etld1 || "unknown",
            full_origin: globalScope.location ? globalScope.location.origin : "unknown",
            policy_scope: "origin", // STRICT: session, domain, origin

            frame_uuid: telemetry.frameUuid || "probe_" + Math.random().toString(36).slice(2),
            frame_type: (telemetry.getFrameType) ? telemetry.getFrameType(globalScope) : ((typeof window !== 'undefined') ? 'top' : 'worker'),
            is_cross_origin_frame: false,


            call_index: 0,
            ...payload
        };
        console.log("__PAL_TELEM__:" + JSON.stringify([event]));
    }

    // --- Surfaces ---
    async function probeCanvas() {
        if (typeof HTMLCanvasElement === 'undefined') return; // Might be undefined in worker? OffscreenCanvas exists.
        // If Worker, use OffscreenCanvas if available
        let c;
        if (typeof OffscreenCanvas !== 'undefined') {
            c = new OffscreenCanvas(200, 50);
        } else if (typeof document !== 'undefined') {
            c = document.createElement('canvas');
            c.width = 200; c.height = 50;
        } else {
            return;
        }

        const ctx = c.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = "rgb(200,0,0)";
        ctx.fillRect(10, 10, 50, 50);
        ctx.fillStyle = "rgb(0,0,200)";
        ctx.fillText("PAL_PROBE", 60, 40);

        // 1. toDataURL (Only on HTMLCanvasElement usually, Offscreen has convertToBlob)
        // Check if toDataURL exists
        if (c.toDataURL) {
            c.toDataURL();
        } else if (c.convertToBlob) {
            // Offscreen
            await c.convertToBlob();
        }

        // 2. getImageData
        ctx.getImageData(0, 0, 50, 50);
    }

    async function probeWebGL() {
        // WebGL in Worker? 
        if (typeof WebGLRenderingContext === 'undefined') return;

        let gl;
        if (typeof OffscreenCanvas !== 'undefined') {
            const c = new OffscreenCanvas(200, 200);
            gl = c.getContext('webgl');
        } else if (typeof document !== 'undefined') {
            const c = document.createElement('canvas');
            gl = c.getContext('webgl');
        }
        if (!gl) return;

        // 1. getParameter
        gl.getParameter(gl.RENDERER);
        gl.getParameter(gl.VENDOR);

        // 2. readPixels
        gl.clearColor(0.5, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    }

    async function probeAudio() {
        const AC = globalScope.OfflineAudioContext || globalScope.webkitOfflineAudioContext;
        if (!AC) return;

        const ctx = new AC(1, 44100, 44100);
        const osc = ctx.createOscillator();
        osc.frequency.value = 440;
        osc.connect(ctx.destination);
        osc.start(0);
        const renderedBuffer = await ctx.startRendering();
        renderedBuffer.getChannelData(0);
    }

    // Explicit AudioBuffer Probe
    async function probeAudioBuffer() {
        if (typeof AudioBuffer === 'undefined') return;
        const b = new AudioBuffer({ length: 1000, sampleRate: 44100, numberOfChannels: 1 });
        b.getChannelData(0);
    }

    async function probeWebRTC() {
        if (typeof RTCPeerConnection === 'undefined') return;
        try {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
            pc.createDataChannel("probe");
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await new Promise(r => setTimeout(r, 1000));
            pc.close();
        } catch (e) { }
    }

    async function probeEvasion() {
        const check = (root, path) => {
            try {
                const target = path.split('.').reduce((o, i) => o[i], root);
                if (target) {
                    Function.prototype.toString.call(target);
                }
            } catch (e) { }
        };

        if (typeof HTMLCanvasElement !== 'undefined') {
            check(globalScope, "HTMLCanvasElement.prototype.toDataURL");
        }
        if (typeof CanvasRenderingContext2D !== 'undefined') {
            check(globalScope, "CanvasRenderingContext2D.prototype.getImageData");
        }

        // Descriptor checks
        try {
            if (typeof HTMLCanvasElement !== 'undefined') {
                Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toDataURL");
            }
        } catch (e) { }
    }

    // Attacker Model: Repeated Reads (30x)
    async function probeRepeatedReads() {
        if (typeof HTMLCanvasElement === 'undefined' && typeof OffscreenCanvas === 'undefined') return;

        // Setup specialized canvas
        let c, ctx;
        if (typeof OffscreenCanvas !== 'undefined') {
            c = new OffscreenCanvas(50, 50);
        } else {
            c = document.createElement('canvas');
            c.width = 50; c.height = 50;
        }
        ctx = c.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = "rgb(128,128,128)"; // Deterministic gray
        ctx.fillRect(0, 0, 50, 50);

        // Burst Fire
        for (let i = 0; i < 30; i++) {
            ctx.getImageData(0, 0, 50, 50); // Should log 30 events
            // Optional: Small yield to prevent main thread blocking, though 30 is fast.
            // await new Promise(r => setTimeout(r, 0)); 
        }
    }

    // --- Main Runner ---
    globalScope.__PAL_RUN_PROBE = async function () {
        const start = Date.now();
        logEvent("page_start", { action: "probe_sequence_start", version: PROBE_VERSION, scope: (typeof window !== 'undefined') ? 'window' : 'worker' });

        try {
            await probeCanvas();
            await probeWebGL();
            await probeAudioBuffer(); // Simpler one
            await probeAudio();       // Complex one
            await probeWebRTC();
            await probeWebRTC();
            await probeEvasion();
            await probeRepeatedReads(); // Attacker Data

            logEvent("probe_summary", {
                status: "complete",
                timing_ms: Date.now() - start, // Renamed from duration_ms
                surfaces: ["Canvas", "WebGL", "Audio", "WebRTC", "AntiEvasion"]
            });
        } catch (e) {
            logEvent("probe_summary", { status: "error", error: e.message, stack: e.stack });
        }
    };

    // Auto-Run in Worker
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        setTimeout(globalScope.__PAL_RUN_PROBE, 100);
    }
    // Auto-Run in Main Thread
    else if (typeof window !== 'undefined') {
        if (document.readyState === 'complete') {
            setTimeout(globalScope.__PAL_RUN_PROBE, 100);
        } else {
            window.addEventListener('load', () => setTimeout(globalScope.__PAL_RUN_PROBE, 100));
        }
    }

})();
