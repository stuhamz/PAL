
// Preflight Probe
// Returns a comprehensive fingerprint object for verification.

(async function () {
    const result = {
        url: window.location.href,
        origin: window.location.origin,
        is_main: window === top,
        navigator: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            webdriver: navigator.webdriver
        },
        screen: {
            width: screen.width,
            height: screen.height
        },
        webgl: {
            renderer: "unavailable",
            vendor: "unavailable"
        },
        audio: "unavailable",
        canvas: "unavailable",
        tamper: {
            toString_native: true,
            descriptors_valid: true
        },
        webrtc: {
            leaks: false,
            candidates: []
        }
    };

    // WebGL
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                result.webgl.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                result.webgl.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            }
        }
    } catch (e) { }

    // Audio Hash
    try {
        const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, 0);
        osc.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        let hash = 0;
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 100) hash += Math.abs(data[i]);
        result.audio = hash.toString();
    } catch (e) { }

    // Canvas Hash
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 100, 100);
        result.canvas = canvas.toDataURL().substring(0, 50); // Just a prefix slice
    } catch (e) { }

    // Tamper Checks (Basic)
    try {
        if (Function.prototype.toString.call(HTMLCanvasElement.prototype.toDataURL).includes('native code') === false) {
            result.tamper.toString_native = false;
        }
        // Check descriptor (is it configurable?)
        const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toDataURL');
        if (!desc || desc.configurable !== true) { // We set configurable: true
            // Wait, native is configurable? Yes.
            // If we set it to false, that's a tell.
        }
    } catch (e) { result.tamper.checked = false; }

    return result;
})();
