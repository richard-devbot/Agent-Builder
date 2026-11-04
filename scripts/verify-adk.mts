/**
 * Checks the ADK blueprint pipeline: a deliberately messy design is repaired
 * by normalizeAdkProject and generated into a governed GitLab ADK package.
 * With an output dir argument the package is written there, so it can be
 * imported by real google-adk:  npx tsx scripts/verify-adk.mts /tmp/adk-out
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AdkProjectSchema } from "../contracts/adk";
import { normalizeAdkProject } from "../lib/adk/normalize";
import { agentTree, generateAdkProject, safeInstruction } from "../lib/adk/generate";

const messy = normalizeAdkProject({
  packageName: "Invoice Automation!",
  title: "Invoice automation",
  description: "Reads supplier invoices and stages them for SAP.",
  rootAgent: "Coordinator",
  agents: [
    { name: "Coordinator", type: "llm_agent", description: "Routes requests", instruction: "Route invoice work. Use {invoice_summary} and {missing_key}.", subAgents: ["InvoicePipeline", "ghost"], tools: ["google_search"] },
    { name: "InvoicePipeline", type: "sequential", description: "Extract then validate", subAgents: ["extractor", "Validator"], tools: ["lookup_po"] },
    { name: "extractor", type: "llm", description: "Extracts fields", instruction: "Extract header fields.", tools: ["parse invoice", "nope"], outputKey: "invoice_summary" },
    { name: "Validator", type: "loop", description: "Re-checks until valid", subAgents: ["checker"], maxIterations: 50 },
    { name: "checker", type: "llm", description: "Checks VAT", instruction: "Check VAT; call exit_loop when valid.", tools: ["lookup_po", "exit_loop"], subAgents: ["Coordinator"] },
    { name: "orphan", type: "parallel", description: "Never used", subAgents: [] },
    { name: "def", type: "llm", description: "Keyword name", subAgents: [] },
  ],
  tools: [
    { name: "parse invoice", kind: "function", description: "Parse invoice text", code: 'def parse(text: str) -> dict:\n    """Parse invoice text into fields."""\n    return {"status": "ok", "chars": len(text)}', imports: ["import json", "rm -rf /"], dependencies: ["pypdf>=4", "google-adk==1.0", "bad;pkg"] },
    { name: "lookup_po", kind: "function", description: "Look up a purchase order" },
    { name: "google_search", kind: "builtin", description: "Search the web" },
    { name: "exit_loop", kind: "builtin", description: "Stop the loop" },
    { name: "unused_tool", kind: "builtin", builtin: "load_memory", description: "never referenced" },
  ],
  envVars: [{ name: "sap base url", example: "https://sap.example.com", description: "SAP OData endpoint" }, { name: "GOOGLE_API_KEY", example: "secret" }],
});

AdkProjectSchema.parse(messy);
assert.equal(messy.packageName, "invoice_automation");
assert.equal(messy.rootAgent, "coordinator");
assert.deepEqual(messy.agents.map((a) => a.name).sort(), ["checker", "coordinator", "extractor", "invoice_pipeline", "validator"], "orphan + keyword agent dropped (unreachable)");
const by = Object.fromEntries(messy.agents.map((a) => [a.name, a]));
assert.deepEqual(by.coordinator.subAgents, ["invoice_pipeline"], "unknown sub-agent removed");
assert.deepEqual(by.invoice_pipeline.tools, [], "workflow agents carry no tools");
assert.deepEqual(by.checker.subAgents, [], "cycle back to the root is cut");
assert.equal(by.validator.maxIterations, 10, "loop iterations clamped");
assert.deepEqual(by.extractor.tools, ["parse_invoice"], "tool reference resolved through rename, unknown dropped");
const parse = messy.tools.find((t) => t.name === "parse_invoice")!;
assert.match(parse.code!, /^def parse_invoice\(/, "function renamed to match tool");
assert.deepEqual(parse.imports, ["import json"], "non-import lines dropped");
assert.deepEqual(parse.dependencies, ["pypdf>=4"], "google-adk pin and invalid spec dropped");
assert.match(messy.tools.find((t) => t.name === "lookup_po")!.code!, /def lookup_po\(query: str\) -> dict:/, "stub generated");
assert.ok(!messy.tools.some((t) => t.name === "unused_tool" || t.name === "load_memory"), "unused tool dropped");
assert.deepEqual(messy.envVars.map((e) => e.name), ["SAP_BASE_URL"], "Google credential vars never emitted from the model");
assert.ok(messy.warnings.length > 0);

assert.equal(safeInstruction("Use {a} and {b?} and {{literal}}"), "Use {a?} and {b?} and {{literal?}}");

const files = generateAdkProject(messy);
const agentPy = files.find((f) => f.path === "invoice_automation/agent.py")!.contents;
assert.ok(agentPy.includes("{invoice_summary?}") && agentPy.includes("{missing_key?}"), "state placeholders made optional");
assert.ok(agentPy.indexOf("checker = LlmAgent(") < agentPy.indexOf("validator = LoopAgent("), "children defined before parents");
assert.ok(agentPy.includes("before_model_callback=before_model_guardrail") && agentPy.includes("before_tool_callback=before_tool_guardrail"), "safety callbacks attached");
assert.ok(agentPy.trimEnd().endsWith("root_agent = coordinator"));
assert.match(
  files.find((f) => f.path === "invoice_automation/requirements.txt")!.contents,
  /^google-adk==2\.13\.0\ngoogle-cloud-aiplatform==1\.85\.0\npypdf>=4\n$/,
);
assert.ok(files.some((f) => f.path === ".gitlab-ci.yml"), ".gitlab-ci.yml emitted");
assert.ok(files.some((f) => f.path === "scripts/check_mandatory_files.py"), "check_mandatory_files.py emitted");
assert.ok(files.some((f) => f.path === "deploy/deploy_gcp.py"), "deploy_gcp.py emitted");
assert.ok(!files.some((f) => f.path.startsWith(".github/")), "no .github/ files emitted");
console.log(agentTree(messy));

const out = process.argv[2];
if (out) {
  for (const f of files) {
    mkdirSync(dirname(join(out, f.path)), { recursive: true });
    writeFileSync(join(out, f.path), f.contents);
  }
  console.log(`wrote ${files.length} files to ${out}`);
}
console.log("PASS: ADK normalisation (names, tree, tools, env) and code generation");
