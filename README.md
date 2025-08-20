# PAL (Privacy via Adversarial Layer)

## Layout
- \ext/\ — Chrome MV3 extension (Canvas/WebGL perturbation)
- \	ools/\ — \collect.js\ (profile-based collector), \nalyze.py\ (metrics)
- \data/sample/\ — tiny sample dataset for smoke tests
- \igures/\ — paper figures

## Quick reproduce
1) Make two Chrome profiles:
   - \C:\tmp\pal_on\  (install & enable the extension)
   - \C:\tmp\pal_off\ (clean; no extension)
2) Collect:
\\\powershell
node tools\collect.js --userDataDir "C:\tmp\pal_on"  --mode on  --sites default --personas 0,1,2 --reps 2 --sessions sessions_on.csv
node tools\collect.js --userDataDir "C:\tmp\pal_off" --mode off --sites default --personas 0,1,2 --reps 2 --sessions sessions_off.csv
\\\
3) Analyze:
\\\powershell
python tools\analyze.py sessions_on.csv sessions_off.csv run-*.ndjson
\\\
"@ | Set-Content -Encoding UTF8 (Join-Path C:\Users\hamza\Documents\pal "README.md")

# === Node setup (package.json + deps) ===
Set-Location C:\Users\hamza\Documents\pal
if (-not (Test-Path "package.json")) { npm init -y | Out-Null }
# pin basic metadata
npm pkg set name="pal" description="PAL: Canvas/WebGL perturbation toolkit" license="MIT" type="module" | Out-Null
# deps (these match the collector you’re using)
npm install puppeteer-core@21 minimist@1 csv-parse@5 | Out-Null

# === optional: node version pin ===
"20.12.2" | Set-Content -Encoding UTF8 (Join-Path C:\Users\hamza\Documents\pal ".nvmrc")

# === Git init (leave remote add for you) ===
git init
git add .
git commit -m "PAL: extension, collector, analyzer, sample data & figures"
Write-Host "
All set at C:\Users\hamza\Documents\pal"
# README (you can overwrite later with the full text below)
@"
# PAL (Privacy via Adversarial Layer)
See detailed setup steps in README below (paths, packages, Chrome channel).
