# Deployment — Azure App Service

Agent Builder ships as a Next.js **standalone** bundle and runs on Azure App Service for Linux (Node.js 20 LTS). Two deployment paths are supported:

1. **Pipeline-driven** (recommended) — Azure DevOps Pipeline builds and deploys on every push to `main`.
2. **Manual zip deploy** — useful for one-off deploys or breaking-glass.

## Example deployment

| Field | Value |
|-------|-------|
| Subscription | `<your-subscription>` |
| Resource group | `<your-resource-group>` |
| App Service plan | `<your-plan>` (Linux, B2 or higher) |
| Web app | `agent-builder` |
| URL | `https://agent-builder.azurewebsites.net` |

## Prerequisites

- Azure subscription
- App Service plan: **Linux**, B1 or higher (Standard if you want Always On)
- App Service runtime: **Node 20 LTS**
- Azure DevOps project with the repo connected (pipeline option only)

## Repo layout (relevant bits)

```
azure-pipelines.yml         ← Azure DevOps pipeline
next.config.ts              ← output: 'standalone'
.next/standalone/server.js  ← created by `pnpm build`; this is the entry point
```

`output: 'standalone'` is set in `next.config.ts`. After `pnpm build`, `.next/standalone/` is a self-contained Node app: it has its own `server.js`, the traced `node_modules`, and all server bundles. **It does not include `public/` or `.next/static/`** — the deploy step copies those in.

---

## Option 1 — Deploy from Azure DevOps Pipeline (recommended)

The pipeline (`azure-pipelines.yml` at repo root) does:

1. Triggers on push to `main` (and validates PRs targeting `main`)
2. Installs Node 20 + pnpm 9 via corepack
3. Caches the pnpm store keyed on `pnpm-lock.yaml`
4. `pnpm install --frozen-lockfile`
5. `pnpm build` (with `SITE_URL` and `NODE_ENV=production` from variables)
6. Assembles a deployable folder by copying:
   - `.next/standalone/*` → root
   - `.next/static` → `.next/static`
   - `public` → `public`
7. Zips it as a build artifact
8. In the `Deploy` stage (gated to `main`), uses `AzureWebApp@1` to push the zip to App Service

### One-time setup

#### 1. Create the App Service

The current app already exists; the commands below are for reference if you ever need to provision a fresh environment. Adjust names as needed.

```bash
SUB=<your-subscription-id>
RG=<your-resource-group>
PLAN=<your-plan>           # reuse existing B2 Linux plan
APP=agent-builder

# az group create -n $RG -l eastus  # if RG doesn't exist
# az appservice plan create -n $PLAN -g $RG --is-linux --sku B1  # if no plan to reuse
az webapp create --subscription $SUB -n $APP -g $RG -p $PLAN --runtime "NODE:20-lts"
```

Then harden the defaults:

```bash
az webapp config set --subscription $SUB -g $RG -n $APP \
  --startup-file "node server.js" \
  --always-on false \
  --min-tls-version "1.2" \
  --http20-enabled true

az webapp update --subscription $SUB -g $RG -n $APP --https-only true
```

Make a note of the resulting URL: `https://<APP>.azurewebsites.net`.

#### 2. Configure App Service settings

In the Azure Portal: **App Service → Configuration → Application settings**, add:

| Name | Value |
|------|-------|
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |
| `SITE_URL` | `https://<APP>.azurewebsites.net` (or your custom domain) |
| `NODE_ENV` | `production` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` |

`SCM_DO_BUILD_DURING_DEPLOYMENT=false` is critical: we already built in the pipeline. Letting App Service rebuild wastes time and can fail on missing dev deps.

In **General settings**, set:

| Field | Value |
|-------|-------|
| **Startup Command** | `node server.js` |
| **Stack** | Node 20 LTS |
| **Always On** | On (Standard tier+ only — eliminates cold starts) |

#### 3. Create an Azure Resource Manager service connection

In Azure DevOps: **Project Settings → Service connections → New → Azure Resource Manager → Workload Identity (recommended) or Service principal**.

- Scope: subscription containing the App Service
- Name it something memorable, e.g. `azure-sdlc-deploy`

#### 4. Set pipeline variables

In Azure DevOps: **Pipelines → Edit pipeline → Variables** (or attach a variable group). The pipeline expects:

| Variable | Example |
|----------|---------|
| `azureServiceConnection` | `azure-sdlc-deploy` |
| `azureAppName` | `sdlc-playbook` |
| `azureResourceGroup` | `agent-builder-rg` |
| `siteUrl` | `https://sdlc-playbook.azurewebsites.net` |

#### 5. Run the pipeline

Push to `main`. The first run also creates the `production` environment in Azure DevOps; you can add manual approvals to it later if you want a gate before deploy.

---

## Option 2 — Manual zip deploy

When you can't or don't want to use the pipeline. **Read "Windows-specific gotchas" below before running this on Windows** — there are two non-obvious traps.

### From Linux / WSL / macOS

```bash
SUB=<your-subscription-id>
RG=<your-resource-group>
APP=agent-builder

# 1. Build locally
pnpm install --frozen-lockfile
SITE_URL=https://$APP.azurewebsites.net NODE_ENV=production pnpm build

# 2. Assemble the deployable layout (standalone is incomplete on its own)
rm -rf dist && mkdir -p dist/.next
cp -R .next/standalone/. dist/
cp -R .next/static dist/.next/static
cp -R public dist/public

# 3. Zip from inside the folder so paths are flat
cd dist && zip -rq ../app.zip . && cd ..

# 4. Push to App Service
az webapp deploy --subscription $SUB \
  --resource-group $RG --name $APP \
  --src-path app.zip --type zip
```

App Service unpacks the zip, sees `server.js` at the root, runs `node server.js`.

### From Windows (Git Bash / PowerShell)

The naive recipe above breaks on Windows for two reasons (see "Windows-specific gotchas" further down). Use this hardened recipe instead:

```bash
# 0. Pre-flight: never deploy from a OneDrive-synced path
# If the repo lives under "OneDrive\...", stage it to %LOCALAPPDATA%\Temp first.

SUB=<your-subscription-id>
RG=<your-resource-group>
APP=agent-builder
STAGE="$LOCALAPPDATA/Temp/sdlc-deploy"

# 1. Build (same as Linux)
pnpm install --frozen-lockfile
SITE_URL=https://$APP.azurewebsites.net NODE_ENV=production pnpm build

# 2. Assemble dist (same as Linux)
rm -rf dist && mkdir -p dist/.next
cp -R .next/standalone/. dist/
cp -R .next/static dist/.next/static
cp -R public dist/public

# 3. Hoist the pnpm virtual store so peer deps resolve on Linux.
#    Without this, container fails with: Cannot find module '@swc/helpers/_/_interop_require_default'
node scripts/hoist-pnpm.cjs   # see "Hoist script" below

# 4. Mirror dist off OneDrive (avoids OneDrive filesystem-filter slowdown)
mkdir -p "$STAGE"
powershell -NoProfile -Command "robocopy '$PWD/dist' '$STAGE/dist' /MIR /NFL /NDL /NJH /NJS /MT:16" >/dev/null

# 5. Build a Linux-compatible zip (forward slashes, no compression).
#    PowerShell's Compress-Archive and .NET CreateFromDirectory write Windows
#    backslashes which Linux unzip treats as filename characters — DO NOT use them.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/zip-for-deploy.ps1   # see below

# 6. Push to App Service
az webapp deploy --subscription $SUB \
  --resource-group $RG --name $APP \
  --src-path "$LOCALAPPDATA/Temp/sdlc-deploy/app.zip" --type zip
```

#### `scripts/hoist-pnpm.cjs`

pnpm's standalone output keeps transitive deps in `node_modules/.pnpm/<pkg>@<ver>/node_modules/`, reachable only via symlinks that don't survive a Windows→Linux zip. This script flattens those into top-level `node_modules/` so Node's standard resolution works.

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve('dist/node_modules');
const pnpmRoot = path.join(root, '.pnpm');
if (!fs.existsSync(pnpmRoot)) { console.error('no .pnpm dir'); process.exit(1); }

let hoisted = 0, skipped = 0;
for (const pkg of fs.readdirSync(pnpmRoot)) {
  const inner = path.join(pnpmRoot, pkg, 'node_modules');
  if (!fs.existsSync(inner)) continue;
  for (const name of fs.readdirSync(inner)) {
    if (name.startsWith('.')) continue;
    if (name.startsWith('@')) {
      const scopeDir = path.join(inner, name);
      if (!fs.statSync(scopeDir).isDirectory()) continue;
      for (const sub of fs.readdirSync(scopeDir)) {
        const target = path.join(root, name, sub);
        if (fs.existsSync(target)) { skipped++; continue; }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.cpSync(path.join(scopeDir, sub), target, { recursive: true, dereference: true });
        hoisted++;
      }
    } else {
      const target = path.join(root, name);
      if (fs.existsSync(target)) { skipped++; continue; }
      fs.cpSync(path.join(inner, name), target, { recursive: true, dereference: true });
      hoisted++;
    }
  }
}
console.log(`hoisted=${hoisted} skipped=${skipped}`);
```

After running, sanity-check by booting the bundle locally:

```bash
cd dist && node server.js   # should print "▲ Next.js 16.x.x ... Ready in <n>ms"
```

If you see `Cannot find module '@swc/helpers/...'` or any other `MODULE_NOT_FOUND`, the hoist didn't include that package — re-run with the missing package logged.

#### `scripts/zip-for-deploy.ps1`

```powershell
$src = "$env:LOCALAPPDATA\Temp\sdlc-deploy\dist"
$zip = "$env:LOCALAPPDATA\Temp\sdlc-deploy\app.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$srcFull = (Resolve-Path $src).Path.TrimEnd('\') + '\'
$prefixLen = $srcFull.Length

$fs = [System.IO.File]::Create($zip)
try {
  $archive = [System.IO.Compression.ZipArchive]::new(
    $fs, [System.IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    Get-ChildItem -LiteralPath $src -Recurse -File -Force | ForEach-Object {
      # CRITICAL: replace backslashes with forward slashes in entry names
      $rel = $_.FullName.Substring($prefixLen).Replace('\','/')
      $entry = $archive.CreateEntry($rel,
        [System.IO.Compression.CompressionLevel]::NoCompression)
      $estream = $entry.Open()
      try {
        $fileStream = [System.IO.File]::OpenRead($_.FullName)
        try { $fileStream.CopyTo($estream) }
        finally { $fileStream.Dispose() }
      } finally { $estream.Dispose() }
    }
  } finally { $archive.Dispose() }
} finally { $fs.Dispose() }

"size_MB=$(((Get-Item $zip).Length/1MB).ToString('F1'))"
```

`NoCompression` is intentional — node_modules already contains incompressible binaries, and skipping CPU compression shaves ~3–5 minutes off the prep on a B2 plan with thousands of small files.

---

## App Service configuration reference

| Setting | Value | Why |
|---------|-------|-----|
| Stack | Node 20 LTS | Matches `nodeVersion` in `package.json` engines |
| Startup Command | `node server.js` | Entry point that Next standalone produces |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` | Pins the Node major across restarts |
| `SITE_URL` | `https://<host>` | Used in OG image URLs, sitemap, robots |
| `NODE_ENV` | `production` | Disables dev-only behavior |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | We build in CI, not on the server |
| Always On | On | Keeps the worker warm; eliminates cold starts |
| HTTPS Only | On | Force-redirect HTTP to HTTPS |
| Minimum TLS Version | 1.2 | Safe default |

### Discovery intake agent (Gemini)

Kit Studio's Discovery step calls `/api/intake/*` on this server. These settings are read at request time, so changing them needs a restart, not a rebuild. Without them the step runs in guided mode (no AI).

| Setting | Value | Why |
|---------|-------|-----|
| `GOOGLE_API_KEY` | Google Cloud API key (`AQ.…`, e.g. free trial; store as a Key Vault reference) | Vertex AI express mode. Keys in this format are detected automatically |
| `GEMINI_API_KEY` | AI Studio key (`AIza…`) | Gemini API (generativelanguage.googleapis.com); needs that API enabled |
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` | Use Vertex AI instead of an API key |
| `GOOGLE_CLOUD_PROJECT` | GCP project id | Required with Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | `global` (default) | Vertex AI location; current Gemini models are served from `global` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account key JSON (Key Vault reference) | OAuth to Vertex AI without a key file |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a credentials file, or a workload identity federation config | OAuth to Vertex AI from Azure via ADC |
| `GEMINI_MODEL` | `gemini-3.8-flash` (default) | Model for the Discovery agent team. `gemini-2.5-*` returned 404 for a 2026 free-trial project |

Each client IP is limited to 40 intake calls per 10 minutes (in memory, per instance). Check the setup with `npx tsx --env-file=.env scripts/check-gemini.mts`.
---

## Custom domain + SSL

1. **App Service → Custom domains → Add custom domain**
2. Add the CNAME / A record at your DNS provider as instructed
3. After validation, **Add binding → App Service Managed Certificate** (free, auto-renewing)
4. Update `SITE_URL` to the custom domain and redeploy so OG images and the sitemap use the canonical origin

---

## Common gotchas

- **Standalone omits `public/` and `.next/static/`.** This is the most common deploy bug — the app boots but every static asset 404s. The pipeline (and the manual recipe above) copy them explicitly.
- **App Service injects `PORT`.** Don't hardcode a port. Next.js standalone reads `process.env.PORT` automatically.
- **First request after idle is slow** ("cold start"). Turn on **Always On** (Standard tier+).
- **Don't let App Service rebuild.** Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=false`. Rebuilding on the server is slow, fragile, and discards the standalone optimization.
- **Server-side env reads happen at build time for static content.** `SITE_URL` is read by `lib/site-config.ts` at build, so it's baked into prerendered HTML and the sitemap. Set it in the pipeline (`env: SITE_URL: $(siteUrl)`), not just on the App Service — runtime-only changes won't update the prerendered output until the next build.
- **Lockfile drift.** The pipeline uses `--frozen-lockfile`; if you change deps locally, commit the updated `pnpm-lock.yaml` or the pipeline will fail.

## Windows-specific gotchas

These only bite the manual zip recipe on Windows. The Azure DevOps pipeline runs on Ubuntu so it sidesteps them all.

- **pnpm symlinks don't survive a Windows zip.** pnpm puts transitive deps in `node_modules/.pnpm/<pkg>@<ver>/node_modules/`, with `node_modules/<pkg>` as a symlink that lets Node's "walk-up" resolution find them. When PowerShell or .NET zip a directory tree on Windows, those symlinks get serialized either as broken stubs or as full copies of the symlink *target*, but the surrounding sibling layout is lost. On Linux, Node then can't resolve packages like `@swc/helpers/_/_interop_require_default` (a Next.js compiler runtime dep) and the container crashes with `MODULE_NOT_FOUND` during `require('next')`. **Fix:** run the `hoist-pnpm.cjs` script above before zipping, which flattens `.pnpm/<pkg>/node_modules/<dep>` into top-level `node_modules/<dep>`. Always sanity-check with `cd dist && node server.js` locally before deploying — if it boots on Windows with `Ready in Xms`, it'll boot on Linux too.
- **Windows zip writers use backslashes.** PowerShell's `Compress-Archive` and `[System.IO.Compression.ZipFile]::CreateFromDirectory` write entry names like `.next\static\foo.js`. Linux `unzip` (and the Kudu One Deploy extractor) treat that as a single 26-character filename, not a path — so files end up in a flat dump and `node server.js` can't find anything. **Fix:** build the archive entry-by-entry via `ZipArchive.CreateEntry(...)` and explicitly `.Replace('\\','/')` each entry name (see the PowerShell script above), OR use Git Bash's `zip` (writes forward slashes natively, but is slow on OneDrive — see next bullet).
- **OneDrive-synced repo paths are pathologically slow for large directory trees.** Reading `node_modules` (~300 MB, ~20 k files) through OneDrive's filesystem filter can take 5–10× longer than a local SSD. A `zip -rq dist/ app.zip` from a OneDrive path that should take 30 seconds can hang for 5+ minutes. **Fix:** stage `dist/` into a non-synced folder (e.g. `%LOCALAPPDATA%\Temp\sdlc-deploy\`) with `robocopy /MT:16` first, then zip from there.
- **Kudu One Deploy returns 504 on large uploads, but the deploy keeps running.** A ~300 MB zip can exceed the SCM front-end's request timeout, which surfaces as `ERROR: An error occurred during deployment. Status Code: 504, Details: 504.0 GatewayTimeout`. The deploy itself usually completes anyway — check `az rest GET …/deployments` and look for `properties.status: 4` (Succeeded). If it shows `4` and `active: true`, the bundle is in `wwwroot`; if the site still 503s, that's the next gotcha (container startup) not the deploy.
- **`az webapp deploy` can false-fail at the 10-minute mark.** For large bundles, the CLI polls `…/scm/api/deployments/latest` and gives up after 600 s with `Deployment failed because the site failed to start within 10 mins`. Meanwhile Kudu happily finishes and the site comes up healthy a minute or two later. **Trust ARM, not the CLI exit code:** if `az rest GET …/deployments` shows `status: 4` and `curl https://<app>.azurewebsites.net/` returns 200, the deploy is good — ignore the CLI error.
- **Container startup probe times out at 230 s.** If `node server.js` keeps crashing on launch, App Service retries the container several times and eventually marks the deploy itself as failed (`Deployment failed because the site failed to start within 10 mins`) even though the bundle uploaded fine. The actionable signal is in the *runtime* container log (not the deployment log) — fetch it with `az webapp log tail … --provider application` and look for `Error: Cannot find module '<X>'`. Fix the missing module (usually a hoist issue), redeploy.

---

## Rollback

Two options, pick whichever matches your urgency:

### Fast: redeploy a previous pipeline run

1. Azure DevOps → **Pipelines → SDLC Playbook**
2. Pick the last known-good run
3. **… → Rerun (with same code)** or use **Deploy** stage's "Rerun stage"

This redeploys the previously-built artifact — no new build needed.

### Safer: deployment slots (Standard tier+)

The current `<your-plan>` plan is **Basic (B2)** which does not support deployment slots. To use slots you'd first need to scale the plan to Standard or higher (`S1`+).

One-time setup, after upgrading the plan:

```bash
az webapp deployment slot create \
  --subscription <your-subscription-id> \
  --resource-group <your-resource-group> \
  --name agent-builder \
  --slot staging
```

Then in `azure-pipelines.yml`, point `AzureWebApp@1` at `--slot staging`, and add a manual swap step:

```yaml
- task: AzureAppServiceManage@0
  inputs:
    azureSubscription: $(azureServiceConnection)
    Action: "Swap Slots"
    WebAppName: $(azureAppName)
    ResourceGroupName: $(azureResourceGroup)
    SourceSlot: staging
    SwapWithProduction: true
```

To roll back, swap again — production goes back to what staging used to hold.
