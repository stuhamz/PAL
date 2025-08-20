// diag.js — drop-in
// Purpose: deterministically exercise 2D + WebGL so the collector always gets
// probe2d_hash + probewebgl_hash, and WebGL path *explicitly* uses gl.readPixels.

(function () {
  // --- tiny helpers ---------------------------------------------------------
  function djb2(buf) {
    let h = 5381 >>> 0;
    for (let i = 0; i < buf.length; i++) h = ((h << 5) + h + (buf[i] & 0xff)) >>> 0;
    // 8-hex like your earlier CSV (e.g., d8bc72a8)
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function toUint8FromImageData(img) {
    // ImageData.data is already Uint8ClampedArray; copy to Uint8Array for hashing
    return new Uint8Array(img.data.buffer.slice(img.data.byteOffset,
                                                img.data.byteOffset + img.data.byteLength));
  }

  // --- 2D probe -------------------------------------------------------------
  function probe2D() {
    const W = 220, H = 30;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    // deterministic draw
    ctx.fillStyle = "#f3f3f3"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#222"; ctx.font = "16px Arial";
    ctx.fillText("PAL-2D", 8, 20);
    // a few lines/rects for anti-aliased edges
    ctx.strokeStyle = "#555"; ctx.beginPath(); ctx.moveTo(0.5, 0.5); ctx.lineTo(W - 0.5, H - 0.5); ctx.stroke();
    ctx.fillStyle = "#0a84ff"; ctx.fillRect(140, 6, 70, 18);

    const img = ctx.getImageData(0, 0, W, H);
    return djb2(toUint8FromImageData(img));
  }

  // --- WebGL probe (explicit readPixels) ------------------------------------
  function probeWebGL() {
    const W = 64, H = 32;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;

    // preserveDrawingBuffer ensures pixels are readable after draw
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false
    }) || canvas.getContext("experimental-webgl", {
      preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false
    });

    if (!gl) return "00000000";

    const vs = `
      attribute vec2 p;
      void main() { gl_Position = vec4(p, 0.0, 1.0); }
    `;
    const fs = `
      precision mediump float;
      // simple deterministic gradient; tiny trig to touch ALU
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(${W.toFixed(1)}, ${H.toFixed(1)});
        float r = fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453);
        gl_FragColor = vec4(uv.x, uv.y, r, 1.0);
      }
    `;
    function compile(type, src) {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); }
      return sh;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    // full-screen triangle strip
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,   1,  1
    ]), gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish(); // make sure rendering is done

    // *** This is the key path your patch hooks ***
    const pixels = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Hash the raw pixels
    return djb2(pixels);
  }

  // --- Expose a stable dumper used by the collector -------------------------
  async function dump() {
    try {
      const twoD = probe2D();
      const gl = probeWebGL();
      return {
        url: location.href,
        probe2d_hash: twoD,
        probewebgl_hash: gl,
      };
    } catch (e) {
      console.error("[PAL diag] dump failed", e);
      return null;
    }
  }

  // Expose both a function and a promise to be flexible
  // (Collector looks for __pal_dump())
  window.__pal_dump = dump;
})();
