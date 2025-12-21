# PAL: Privacy & Linkability Framework

**PAL** is a research-grade browser extension and crawler framework designed to evaluate privacy drift and linkability in modern web environments. It implements a novel "Epoch-Coupled Noise" strategy to achieve unlinkability while maintaining compatibility.

## 🚀 Features
- **Epoch-Coupled Noise**: Deterministic noise injection seeded by `(Identity + Epoch + Content)`, ensuring consistency within a session but drift across sessions.
- **Multi-Mode Operation**:
  - `vanilla`: Baseline browser behavior (High Linkability).
  - `compat`: Stability mode (Noise OFF, specific overrides).
  - `privacy`: Unlinkability mode (Noise ON, Epoch-Drifting).
- **Context Coverage**: Supports Top-level frames, Cross-origin Iframes, and Web Workers.
- **Vectors**: Canvas (2D), WebGL, AudioContext, Navigator, Screen.

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/stuhamz/PAL.git
cd PAL

# Install dependencies
npm install
```

## 🏃‍♂️ Usage

### Running a Research Crawl
The crawler runs a structured experiment across defined sites, modes, and epochs.

```bash
# Run the crawler (Defaults to Mini-Run: 3 Sites)
node research/crawler_research.js
```

**Configuration:**
- Edit `research/crawler_research.js` to change `TARGET_COUNT` (e.g., set to `100` for a full run).
- Sites list is in `research/sites_structured.json`.

### Output
Results are saved to `data/runs/<RUN_ID>/run_<RUN_ID>.jsonl`.
Logs are printed to stdout.

## 📊 Data & Analysis

### Schema V2
The project enforces **Schema V2** for all telemetry events.

| Field | Description |
| :--- | :--- |
| `event_type` | `fingerprint_vector` |
| `site_url` | Target Domain |
| `mode` | `vanilla`, `compat`, `privacy` |
| `epoch` | Integer (1, 2, 3...) |
| `context` | `top`, `iframe`, `worker` |
| `components` | Object containing hashes (`canvas_imagedata_hash`, `webgl_hash`, etc.) |

### Sample Data
A small sample of the output format is provided in `data/sample_run.jsonl`.
**Note:** The full 100-site dataset is available upon request (or check the releases page).

### Reproducing a Mini Run
1. Ensure `TARGET_COUNT = 3` in `research/crawler_research.js`.
2. Run `node research/crawler_research.js`.
3. Check `data/runs/` for the new folder.
4. Run analysis script (provided in `research/data_analysis.js`) against the new file.

```bash
# Analyze a specific run
node research/data_analysis.js data/runs/<YOUR_RUN_ID>/run_<YOUR_RUN_ID>.jsonl
```

## ⚠️ Status
This project is Research Code.
- **Debug flags** are OFF by default.
- **Strict Mode** is enforced for Schema V2.
