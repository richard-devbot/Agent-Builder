/**
 * Phase B verification: scans `app/`, `components/`, and `lib/` to ensure no
 * hard-coded environment literals exist:
 *  - GCP project-ID/number patterns (e.g. `projects/123456789012`, `.iam.gserviceaccount.com` emails)
 *  - `reasoningEngines/\d+`
 *  - `gitlab.com/<group>` or `github.com/<group>` paths
 *  - Email addresses (`user@domain.tld`)
 *  - `AIza` or `AQ.` API key prefixes
 *  - Literal Gemini model IDs (`gemini-\d...`) outside `lib/config/`
 * Also verifies that `loadServerConfig({})` and `validatePublicEnv({})` fail
 * fast with a readable error listing missing variables.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validatePublicEnv } from "../lib/config/public";
import { loadServerConfig } from "../lib/config/server";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface Rule {
  name: string;
  regex: RegExp;
  allowInConfig?: boolean;
}

const RULES: Rule[] = [
  {
    name: "GCP project number resource path (projects/<digits>)",
    regex: /projects\/\d{6,}/g,
  },
  {
    name: "Hard-coded GCP service account email",
    regex: /[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/gi,
  },
  {
    name: "Hard-coded Vertex AI reasoningEngines resource ID (reasoningEngines/<digits>)",
    regex: /reasoningEngines\/\d+/g,
  },
  {
    name: "Hard-coded gitlab.com or github.com group/repo path",
    regex: /https?:\/\/(?:www\.)?(?:gitlab|github)\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g,
  },
  {
    name: "Hard-coded email address",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    name: "API key prefix (AIza or AQ.)",
    regex: /\b(?:AIza[0-9A-Za-z_-]*|AQ\.[0-9A-Za-z_-]*)/g,
  },
  {
    name: "Literal Gemini model ID outside lib/config",
    regex: /\bgemini-\d+\.\d+[a-z0-9.-]*/g,
    allowInConfig: true,
  },
];

const violations: string[] = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const isConfigFile = rel.startsWith("lib/config/");
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, idx) => {
      for (const rule of RULES) {
        if (rule.allowInConfig && isConfigFile) continue;
        rule.regex.lastIndex = 0;
        const m = rule.regex.exec(line);
        if (m) {
          violations.push(`${rel}:${idx + 1} [${rule.name}] -> ${m[0]}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("FAIL: Hard-coded literals detected:\n" + violations.map((v) => `  • ${v}`).join("\n"));
  process.exit(1);
}
console.log("PASS: No hard-coded GCP IDs, reasoningEngines, repo paths, emails, key prefixes, or model IDs outside lib/config");

// Verify fast-fail readable errors on missing env vars
assert.throws(
  () => loadServerConfig({}),
  (err: unknown) =>
    err instanceof Error &&
    err.message.includes("AUTH_SECRET") &&
    err.message.includes("GITLAB_BASE_URL") &&
    err.message.includes("GOOGLE_CLOUD_PROJECT"),
  "loadServerConfig({}) must fail fast listing missing variables",
);

assert.throws(
  () => validatePublicEnv({}),
  (err: unknown) =>
    err instanceof Error &&
    err.message.includes("NEXT_PUBLIC_GITLAB_BASE_URL") &&
    err.message.includes("NEXT_PUBLIC_GCP_DEV_PROJECT_ID"),
  "validatePublicEnv({}) must fail fast listing missing variables",
);
console.log("PASS: lib/config/server.ts and lib/config/public.ts fail fast with readable missing-variable errors");
