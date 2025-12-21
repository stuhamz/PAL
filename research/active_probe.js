// Active Probe for Research Data Collection v3
// Injected by crawler to force fingerprint generation.

(async function runActiveProbe() {
    const results = {
        canvas: { toDataURL: null, getImageData: null },
        webgl: { readPixels: null, renderer: null },
        audio: { hash: null },
        webrtc: { candidates: [] },
        iframe: { created: false, probed: false },
        error: null
    };

    function simpleHash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
        return (hash >>> 0).toString(16);
    }

    try {
        // 1. CANVAS (Warmup + Measurement)
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = "rgb(255,0,255)"; ctx.fillRect(10, 10, 100, 30);
        ctx.fillStyle = "rgb(0,255,0)"; ctx.font = "20px Arial"; ctx.fillText("PAL Probe 🧐", 15, 30);

        // Warmup (Cold Start)
        canvas.toDataURL("image/png");

        // Steady State Loop
        for (let i = 0; i < 20; i++) {
            const res = canvas.toDataURL("image/png");
            if (i === 0) results.canvas.toDataURL = simpleHash(res);
        }

        // GetImageData
        const idata = ctx.getImageData(0, 0, 50, 50);
        results.canvas.getImageData = simpleHash(idata.data.slice(0, 100).join(","));


        // 2. WEBGL (New)
        try {
            const glCanvas = document.createElement('canvas');
            const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) results.webgl.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

                // Draw simple scene
                gl.clearColor(0.2, 0.4, 0.6, 1.0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                const px = new Uint8Array(4);
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                results.webgl.readPixels = simpleHash(px.join(","));
            }
        } catch (e) { }


        // 3. AUDIO (Warmup + Measurement)
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (OfflineContext) {
            // Warmup (Separate context)
            try {
                const warm = new OfflineContext(1, 44100, 44100);
                warm.startRendering();
            } catch (e) { }

            // Measurement (2 passes)
            const promises = [];
            for (let i = 0; i < 2; i++) {
                promises.push((async () => {
                    try {
                        const actx = new OfflineContext(1, 44100, 44100);
                        const osc = actx.createOscillator();
                        osc.type = 'triangle';
                        osc.frequency.setValueAtTime(440, 0);
                        osc.connect(actx.destination);
                        osc.start(0);
                        const buffer = await actx.startRendering();
                        const data = buffer.getChannelData(0);

                        if (i === 0) {
                            let s = "";
                            for (let k = 0; k < Math.min(100, data.length); k++) s += data[k].toFixed(4);
                            results.audio.hash = simpleHash(s);
                        }
                    } catch (e) { }
                })());
            }
            await Promise.all(promises);
        }


        // 4. WEBRTC
        const rtcPromise = new Promise(resolve => {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            pc.onicecandidate = (e) => {
                if (e.candidate) results.webrtc.candidates.push(e.candidate.candidate);
            };
            pc.createDataChannel("");
            pc.createOffer().then(o => pc.setLocalDescription(o));
            setTimeout(() => { pc.close(); resolve(); }, 1500);
        });
        await rtcPromise;


        // 5. IFRAME CONTROL (New)
        if (window === top) { // Only do this in main frame
            try {
                const f = document.createElement('iframe');
                f.srcdoc = "<html><body><h1>Probe Frame</h1><script>window.__PAL_IS_PROBE_FRAME=true;</script></body></html>";
                document.body.appendChild(f);
                results.iframe.created = true;
                // Crawler will verify injection in this frame by checking window.__PAL_IS_PROBE_FRAME
            } catch (e) { }
        }

    } catch (e) { results.error = e.message; }

    return results;
})()
