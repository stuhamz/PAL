# PAL — Privacy via Adversarial Layer

*Chrome MV3 extension + automation to measure Canvas/WebGL fingerprint changes (OFF vs ON) and evaluate anonymity/overhead.*

---

## 🚀 TL;DR (Windows)
1. **Make two Chrome profiles:**
    - `C:\tmp\pal_on` (install + enable the extension)
    - `C:\tmp\pal_off` (no extension)

2. **Set the Chrome executable path in your terminal:**
    ```
    $env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
    ```

3. **Collect data and analyze the results:**
    ```
    # Collect data with the extension ON
    npm run collect:on

    # Collect data with the extension OFF
    npm run collect:off

    # Analyze and compare the results
    npm run analyze
    ```
---

## 📁 Repo Layout

``` text
pal/
├── ext/                 # Chrome MV3 extension (loader.js, patch.js, diag.js, manifest.json, ...)
├── tools/
│   ├── collect.js       # Profile-based collector (reuses real Chrome profiles you control)
│   ├── analyze.py       # Analyzer & paper-ready summary / figures
│   └── sites_default.txt# List of seed URLs (one per line)
├── data/
│   ├── sessions_on.csv  # Collected sessions (extension ON)
│   ├── sessions_off.csv # Collected sessions (extension OFF)
│   └── run-*.ndjson     # Per-run diagnostics
├── package.json         # Node.js dependencies
├── requirements.txt     # Python dependencies (optional)
└── README.md            # This file!
```

## ✅ Requirements

- **OS**: Windows 10/11
- **Node.js**: 20.x recommended (`puppeteer-core@21`)
- **Python**: 3.10+ (`tools/analyze.py`)
- **Browser**: Google Chrome (Stable) — or Canary
- **Node dependencies** (in `package.json`):
    - `puppeteer-core@21`
    - `minimist@1`
    - `csv-parse@5`
- **Python dependencies** (optional, in `requirements.txt`):
    - `pandas>=2.0`
    - `numpy>=1.26`
    - `matplotlib>=3.8`

---

## 🛠️ Install

### 1. Install Node.js dependencies
Inside your repository folder
```npm install```

### 2. (Optional) Set up a Python environment:
Create a virtual environment
```python -m venv .venv

Activate it
..venv\Scripts\Activate.ps1

Install required packages
pip install -r requirements.txt
```

---

## 🔧 Prepare the Chrome Profiles (One-Time Setup)

You must manually prepare two separate Chrome profiles. The collector reuses these profiles; **it does not load the extension for you**.

### 1. Create ON Profile & Install the Extension
```chrome.exe --user-data-dir=C:\tmp\pal_on```

- Go to `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**, select `ext/` folder
- Ensure the extension is **enabled**
- (Optional) Pin to toolbar for visibility

### 2. Create OFF Profile (No Extension)
```chrome.exe --user-data-dir=C:\tmp\pal_off```


- **Do not** install the extension in this profile.

---

## 🎯 Configuration

### Tell Puppeteer which Chrome to use:
Set the path to your Chrome binary before collecting data.

```
For Stable Chrome
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

For Canary, use:
$env:PUPPETEER_EXECUTABLE_PATH="C:\Users<you>\AppData\Local\Google\Chrome SxS\Application\chrome.exe"
```


---

### Site List

Edit URLs in `tools/sites_default.txt` (one URL per line):

https://threejs.org/examples/
https://browserleaks.com/canvas
https://example.com

...more

**Note:** include at least one WebGL-heavy page.

---

## 📊 Collect Data
```
### Quick npm scripts (use default profile paths):
npm run collect:on
npm run collect:off
npm run analyze
```

### Direct usage for more control:
```node tools/collect.js
--userDataDir C:\tmp\pal_on
--mode on
--sites default
--reps 2
--sessions data/sessions_on.csv
```

```node tools/collect.js
--userDataDir C:\tmp\pal_off
--mode off
--sites default
--reps 2
--sessions data/sessions_off.csv
```


**Key Arguments:**
- `--userDataDir`: Path to Chrome profile folder
- `--mode on|off`: Labels rows/controls diagnostics (**does not** toggle the extension!)
- `--sites default`: Reads sites from `tools/sites_default.txt`
- `--personas 0,1,2`: Persona IDs (use `0` if not used)
- `--reps 2`: Visits per (site × persona × mode)
- `--sessions <file.csv>`: Output CSV file

---

## 📈 Analyze
```
python tools/analyze.py data/sessions_on.csv data/sessions_off.csv
```
You’ll get a summary including change rates, hook activity, and overhead.

---

## 📄 Data Schema

**CSV (`sessions_*.csv`):**

| Column            | Type    | Notes                                             |
|-------------------|---------|---------------------------------------------------|
| ts                | number  | Unix ms timestamp                                 |
| mode              | string  | `on` or `off`                                     |
| persona           | number  | Persona ID                                        |
| seed              | number  | Run seed (if used)                                |
| url               | string  | Visited URL                                       |
| calls_toDataURL   | number  | Count of `toDataURL` calls during visit           |
| calls_toBlob      | number  | Count of `toBlob` calls                           |
| calls_getImageData| number  | Count of `getImageData` calls                     |
| calls_readPixels  | number  | WebGL/WebGL2: count                               |
| probe2d_hash      | string  | Canvas 2D signal hash                             |
| probewebgl_hash   | string  | WebGL signal hash                                 |
| load_ms           | number  | Page load timing sample                           |
| ablation          | string  | Optional: e.g. `none`, `audio`, `font`            |

**NDJSON (`run-*.ndjson`):**
Contains per-run diagnostics for hook-activity and sanity checks.

---

## ✨ What "Good" Runs Look Like

- **Hashes:** Extension ON rows have non-empty `probe2d_hash` and `probewebgl_hash`
- **Hook Activity:** At least 60% of ON rows show hooks active
- **Fingerprint Change Rate:** Paired OFF→ON change rate high (≥95% for 2D, ≥90% for WebGL)
- **Overhead:** ON median `load_ms` not much worse than OFF

_Add more WebGL-heavy URLs if coverage is too low._

---

## 🔍 Troubleshooting

| Problem                                             | Cause / Fix                                    |
|-----------------------------------------------------|------------------------------------------------|
| Extension not visible during automation             | Collector reuses profile, check `C:\tmp\pal_on`|
| Missing fields: `probe2d_hash`, `probewebgl_hash`   | Page didn’t call APIs or patch didn’t run      |
| "CSP blocked inline/script …" in logs               | CSP blocks diagnostics, hashes are enough      |
| `createIncognitoBrowserContext is not a function`   | Puppeteer version mismatch, reinstall          |
| "An executablePath or channel must be specified"    | Env var not set; run path export above         |
| No WebGL changes                                   | Add more WebGL-heavy test URLs                 |

---

## 🔬 Repro Recipe for the Paper

1. **Verify Profiles:**  
    - `C:\tmp\pal_on` has extension **enabled**
    - `C:\tmp\pal_off` has **no extension**

2. **Set Environment (Chrome path):**
    ```
    $env:PUPPETEER_EXECUTABLE_PATH="...chrome.exe"
    ```

3. **Collect Data:**  
    Run both ON and OFF modes with identical sites/personas.

4. **Analyze:**  
    ```
    python tools/analyze.py data/sessions_on.csv data/sessions_off.csv
    ```

5. **Inspect Summary:**  
    - 2D/WebGL change rates
    - hook-activity
    - performance overhead

---











