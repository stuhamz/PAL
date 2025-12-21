// src/lib/blueprints.js
// Research-Grade Device Profiles (Blueprints)
// These bundles define "Valid Identity States" to prevent impossible fingerprints.

export const BLUEPRINTS = [
    {
        id: "win10_performance_desktop",
        name: "Windows 10 Performance Desktop",
        marketShareWeight: 30,
        navigator: {
            platform: "Win32",
            userAgentTemplate: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chromeVersion}.0.0.0 Safari/537.36",
            hardwareConcurrencyOptions: [8, 12, 16, 24], // High-end CPUs
            deviceMemoryOptions: [16, 32],
        },
        screen: {
            // 1920x1080 is standard, but gamers might have 1440p
            resolutions: [
                { width: 1920, height: 1080 },
                { width: 2560, height: 1440 }
            ]
        },
        webgl: {
            vendors: [
                { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11) [PAL]" },
                { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11) [PAL]" }
            ]
        }
    },
    {
        id: "mac_m1_laptop",
        name: "MacBook Air/Pro (M1/M2)",
        marketShareWeight: 20,
        navigator: {
            platform: "MacIntel", // M1 still reports MacIntel mostly in standard browsers, or distinct?
            // "MacIntel" is the standard for web compatibility even on Apple Silicon.
            userAgentTemplate: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chromeVersion}.0.0.0 Safari/537.36",
            hardwareConcurrencyOptions: [8], // M1/M2 are usually 8 core exposed
            deviceMemoryOptions: [8, 16],
        },
        screen: {
            // Retina scaling is complex. 
            // Logical resolution (CSS pixels) for 13" Air is usually 1440x900 or 1470x956 depending on display zoom
            resolutions: [
                { width: 1440, height: 900 },
                { width: 1536, height: 960 }
            ]
        },
        webgl: {
            vendors: [
                // Apple Silicon WebGL is remarkably consistent
                { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M1, OpenGL 4.1) [PAL]" },
                { vendor: "Google Inc. (Apple)", renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1) [PAL]" }
            ]
        }
    },
    {
        id: "win10_budget_laptop",
        name: "Windows 10 Budget Laptop",
        marketShareWeight: 40,
        navigator: {
            platform: "Win32",
            userAgentTemplate: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chromeVersion}.0.0.0 Safari/537.36",
            hardwareConcurrencyOptions: [4, 8],
            deviceMemoryOptions: [4, 8],
        },
        screen: {
            resolutions: [
                { width: 1366, height: 768 },
                { width: 1536, height: 864 } // Common 15.6" scaling
            ]
        },
        webgl: {
            vendors: [
                { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11) [PAL]" },
                { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) Iris Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11) [PAL]" }
            ]
        }
    }
];
