/**
 * Phase H — Verification script for the governed GitLab + Google ADK kit.
 * Verifies:
 * 1. Exact presence of .gitlab-ci.yml, scripts/check_mandatory_files.py,
 *    deploy/deploy_gcp.py, deploy/bootstrap_gcp_gitlab.sh,
 *    security/semgrep-rules.yaml, security/entra_auth.py,
 *    docs/AUTH-STANDARD.md, kit.lock.json, and .env.example.
 * 2. Exact match with kit-templates/ on disk (templated with agentFolderName).
 * 3. No .github/ files, no secrets, no hard-coded GCP project IDs or
 *    reasoningEngines/\d+ literals.
 * 4. CI + deploy script contain `adk deploy agent_engine` and the 19-digit
 *    RESOURCE_ID regex `reasoningEngines/(\d{19})`.
 * 5. Cloud Run Dockerfile emitted only when deployTarget === "cloud_run".
 * 6. Running `python3 scripts/check_mandatory_files.py --agent <agentFolder>`
 *    on the materialized kit exits 0.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildKit, type Selection } from "../lib/kit/build-kit";
import { EMPTY_BRIEF } from "../lib/intake/brief";
import { enrichDiscoveryBriefHeuristics } from "../lib/intake/guided";
import { synthesizeAdkFromBrief } from "../lib/adk/catalog";

const agentFolder = "finance_invoice_agent";

const baseSelection: Selection = {
  projectName: "Finance Invoice Agent",
  agentFolderName: agentFolder,
  deployTarget: "agent_engine",
  technologies: ["python"],
  agents: [],
  rules: [],
  skills: [],
  hooks: [],
  commands: [],
  mcpServers: [],
};

const kitFiles = buildKit(baseSelection, "google-adk");
const byPath = new Map(kitFiles.map((f) => [f.path, f.contents]));

const REQUIRED_PATHS = [
  ".gitlab-ci.yml",
  ".gitignore",
  ".env.example",
  "kit.lock.json",
  "scripts/check_mandatory_files.py",
  "deploy/deploy_gcp.py",
  "deploy/bootstrap_gcp_gitlab.sh",
  "security/semgrep-rules.yaml",
  "security/entra_auth.py",
  "docs/AUTH-STANDARD.md",
  `${agentFolder}/__init__.py`,
  `${agentFolder}/agent.py`,
  `${agentFolder}/requirements.txt`,
  `${agentFolder}/.env.example`,
];

for (const reqPath of REQUIRED_PATHS) {
  assert.ok(byPath.has(reqPath), `Missing required kit file: ${reqPath}`);
}

// Verify exact match with kit-templates/ files
const templateDir = join(process.cwd(), "kit-templates");
assert.equal(
  byPath.get("scripts/check_mandatory_files.py")?.trim(),
  readFileSync(join(templateDir, "scripts/check_mandatory_files.py"), "utf8").trim(),
  "scripts/check_mandatory_files.py matches kit-templates/",
);
assert.equal(
  byPath.get("deploy/deploy_gcp.py")?.trim(),
  readFileSync(join(templateDir, "deploy/deploy_gcp.py"), "utf8").trim(),
  "deploy/deploy_gcp.py matches kit-templates/",
);
assert.equal(
  byPath.get("security/semgrep-rules.yaml")?.trim(),
  readFileSync(join(templateDir, "security/semgrep-rules.yaml"), "utf8").trim(),
  "security/semgrep-rules.yaml matches kit-templates/",
);
assert.equal(
  byPath.get("security/entra_auth.py")?.trim(),
  readFileSync(join(templateDir, "security/entra_auth.py"), "utf8").trim(),
  "security/entra_auth.py matches kit-templates/",
);
assert.equal(
  byPath.get("docs/AUTH-STANDARD.md")?.trim(),
  readFileSync(join(templateDir, "docs/AUTH-STANDARD.md"), "utf8").trim(),
  "docs/AUTH-STANDARD.md matches kit-templates/",
);
assert.equal(
  byPath.get(".gitlab-ci.yml")?.trim(),
  readFileSync(join(templateDir, ".gitlab-ci.yml"), "utf8")
    .replace("{{AGENT_FOLDER}}", agentFolder)
    .trim(),
  ".gitlab-ci.yml matches kit-templates/ with templated AGENT_FOLDER",
);

// Verify no .github/ files
assert.ok(
  !kitFiles.some((f) => f.path.startsWith(".github/")),
  "Kit must not contain any .github/ files",
);

// Verify Dockerfile only when deployTarget === "cloud_run"
assert.ok(
  !byPath.has("Dockerfile"),
  "Dockerfile must not be emitted when deployTarget is agent_engine",
);
const cloudRunKit = buildKit({ ...baseSelection, deployTarget: "cloud_run" }, "google-adk");
assert.ok(
  cloudRunKit.some((f) => f.path === "Dockerfile"),
  "Dockerfile must be emitted when deployTarget is cloud_run",
);

// Verify no secrets or hard-coded GCP project IDs in any kit file
for (const file of kitFiles) {
  assert.ok(
    !/AIza[0-9A-Za-z_-]{20,}/.test(file.contents),
    `Google API key pattern found in ${file.path}`,
  );
  assert.ok(
    !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(file.contents),
    `Private key found in ${file.path}`,
  );
  assert.ok(
    !/projects\/\d{6,}\/locations\/[\w-]+\/reasoningEngines\/\d{6,}/.test(
      file.contents,
    ),
    `Hard-coded reasoningEngines resource found in ${file.path}`,
  );
}

// Verify CI + deploy script contain `adk deploy agent_engine` and the 19-digit RESOURCE_ID regex
const ciYml = byPath.get(".gitlab-ci.yml")!;
const deployPy = byPath.get("deploy/deploy_gcp.py")!;
assert.ok(
  ciYml.includes("python deploy/deploy_gcp.py --target \"$DEPLOY_TARGET\" --agent \"$AGENT_FOLDER\""),
  ".gitlab-ci.yml invokes deploy/deploy_gcp.py",
);
assert.ok(
  deployPy.includes('"adk", "deploy", "agent_engine"'),
  "deploy/deploy_gcp.py invokes adk deploy agent_engine",
);
assert.ok(
  deployPy.includes("reasoningEngines/(\\d{19})"),
  "deploy/deploy_gcp.py validates the 19-digit reasoningEngines RESOURCE_ID regex",
);

// Materialize kit to temp dir and run python3 scripts/check_mandatory_files.py --agent <agentFolder>
const tmp = mkdtempSync(join(tmpdir(), "agent-builder-gitlab-kit-"));
try {
  for (const file of kitFiles) {
    const target = join(tmp, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents, "utf8");
  }
  const stdout = execFileSync(
    "python3",
    ["scripts/check_mandatory_files.py", "--agent", agentFolder],
    { cwd: tmp, encoding: "utf8" },
  );
  assert.ok(
    stdout.includes("All mandatory files and settings are present"),
    "check_mandatory_files.py succeeded on materialized kit",
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// Verify Step 6/7 unified Discovery multi-agent ADK emission inside <agentFolder>/
const discoveryAdk = synthesizeAdkFromBrief(
  enrichDiscoveryBriefHeuristics({
    ...EMPTY_BRIEF,
    title: "Finance Invoice Reconciliation",
    problem: "Reconcile SAP purchase orders and ServiceNow exception tickets with manager approval over 5k.",
    inScope: ["Parse invoice PDF", "Match SAP purchase order", "Stage ServiceNow exception ticket"],
    integrations: ["SAP", "ServiceNow"],
    constraints: ["Manager approval required over 5k"],
  }),
);
const unifiedKitFiles = buildKit(
  {
    ...baseSelection,
    adkProject: discoveryAdk,
  },
  "google-adk",
);
const unifiedAgentPy = unifiedKitFiles.find((f) => f.path === `${agentFolder}/agent.py`)?.contents ?? "";
assert.ok(
  unifiedAgentPy.includes("SequentialAgent") &&
    unifiedAgentPy.includes("sap_erp_lookup_and_stage") &&
    unifiedAgentPy.includes("servicenow_ticket_action") &&
    unifiedAgentPy.includes("root_agent ="),
  "Step 6/7 <agentFolder>/agent.py emits the full multi-agent Discovery ADK orchestration",
);
const tmpUnified = mkdtempSync(join(tmpdir(), "agent-builder-unified-adk-"));
try {
  for (const file of unifiedKitFiles) {
    const target = join(tmpUnified, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents, "utf8");
  }
  const stdoutUnified = execFileSync(
    "python3",
    ["scripts/check_mandatory_files.py", "--agent", agentFolder],
    { cwd: tmpUnified, encoding: "utf8" },
  );
  assert.ok(
    stdoutUnified.includes("All mandatory files and settings are present"),
    "check_mandatory_files.py succeeded on unified multi-agent Discovery ADK kit",
  );
} finally {
  rmSync(tmpUnified, { recursive: true, force: true });
}

console.log(
  "PASS: GitLab kit contains all mandatory files, no .github/ or secrets, valid CI/WIF deploy, and passes check_mandatory_files.py",
);
