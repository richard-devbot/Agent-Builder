/** Checks the deterministic parts of Discovery intake: brief scoring, merging, guided rounds, Systems & Connections heuristics, Markdown. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PlanSchema } from "../contracts/intake";
import { toGeminiSchema } from "../lib/intake/gemini";
import { FollowUpModelSchema, PlanModelSchema, normalizeFollowUp, normalizePlan } from "../lib/intake/prompts";
import { BriefSchema, FollowUpResponseSchema, type Answer } from "../contracts/intake";
import { EMPTY_BRIEF, briefMarkdown, completeness, mergeAnswers, seedBrief } from "../lib/intake/brief";
import { guidedAnalyze, guidedFollowUp } from "../lib/intake/guided";
import { DISCOVERY_AGENT_PROMPT } from "../lib/intake/instructions";

// Phase F: Verify prompts/discovery-agent.md matches DISCOVERY_AGENT_PROMPT
const promptFile = readFileSync(join(process.cwd(), "prompts/discovery-agent.md"), "utf8").trim();
assert.equal(DISCOVERY_AGENT_PROMPT.trim(), promptFile, "DISCOVERY_AGENT_PROMPT matches prompts/discovery-agent.md");

const seeded = seedBrief(EMPTY_BRIEF, { problem: "Invoices are re-keyed by hand. It takes days.", outcome: "Cut manual effort, fewer errors", timeline: "2–4 weeks" });
assert.equal(seeded.title, "Invoices are re-keyed by hand");
assert.deepEqual(seeded.goals, ["Cut manual effort", "fewer errors"]);
assert.equal(completeness(seeded), 16 + 12 + 8);

const r0 = guidedFollowUp({ role: "business", brief: seeded, materials: [], answers: [], asked: [], transcript: [], message: "", round: 0 });
FollowUpResponseSchema.parse(r0);
assert.equal(r0.questions.length, 4);
assert.ok(!r0.questions.some((q) => ["problem", "goals", "timeline"].includes(q.field)), "filled fields are not asked");
assert.ok(r0.brief.systems.some((s) => s.name === "SAP"), "SAP detected from invoice problem heuristic");
assert.ok(r0.brief.accessRequests.length >= 1, "access request generated for detected system");
assert.equal(r0.brief.audience, "my team", "default audience populated");

const answers: Answer[] = r0.questions.map((q) => ({ questionId: q.id, field: q.field, question: q.question, answer: q.suggestions.slice(0, 2).join(", ") }));
const r1 = guidedFollowUp({ role: "business", brief: r0.brief, materials: [], answers, asked: r0.questions.map((q) => q.id), transcript: [], message: "", round: 1 });
assert.ok(completeness(r1.brief) > completeness(seeded));
assert.ok(r1.questions.every((q) => !r0.questions.some((p) => p.id === q.id)), "no question repeats");

// Re-merging the same history must not duplicate anything.
const twice = mergeAnswers(mergeAnswers(seeded, answers), answers);
assert.deepEqual(twice, mergeAnswers(seeded, answers));
BriefSchema.parse(twice);

const md = briefMarkdown({ brief: r1.brief, role: "business", materials: [{ id: "1", name: "spec.pdf", kind: "file", text: "x" }], answers, plan: null });
assert.ok(md.startsWith("# Invoices are re-keyed by hand"));
assert.ok(md.includes("## Follow-up Q&A") && md.includes("spec.pdf"));
assert.ok(md.includes("## Systems & connection checklist"), "markdown includes Systems & connection checklist");
assert.ok(!/\n\n\n/.test(md), "no blank-line runs");
console.log("PASS: intake brief scoring, guided rounds, idempotent merge, systems checklist, markdown");

// ── model-facing pieces (no network) ─────────────────────────────────────────

for (const schema of [FollowUpModelSchema, PlanModelSchema]) {
  const g = JSON.stringify(toGeminiSchema(z.toJSONSchema(schema)));
  assert.ok(!g.includes("$schema") && !g.includes("additionalProperties"), "unsupported keywords stripped");
  assert.ok(g.includes('"properties"') && g.includes('"required"'), "structure kept");
}

const long = "x".repeat(5_000);
const fu = normalizeFollowUp(
  {
    brief: { ...r1.brief, title: long, goals: Array(30).fill("goal") },
    message: "ok",
    questions: Array(8).fill({ field: "risks", question: long, why: "w", suggestions: Array(9).fill("s"), multi: true }),
    done: false,
  },
  2,
  [],
);
FollowUpResponseSchema.parse(fu);
assert.equal(fu.questions.length, 5);
assert.equal(fu.questions[0].id, "ai-r2-0");

const plan = normalizePlan(
  {
    summary: "s",
    projectType: "greenfield",
    technologies: ["Python", "python", "cobol-9000"],
    milestones: [{ title: "m", detail: "d" }],
    skillNeeds: [],
    customAgents: [{ name: "Invoice Reconciler!", title: "t", description: "d", tools: ["Read"], handoffsTo: ["ghost-agent", "invoice-reconciler"], skills: ["SAP posting rules", "nope"], body: "b" }, { name: "invoice reconciler", title: "dup", description: "d", tools: [], handoffsTo: [], skills: [], body: "b" }],
    customSkills: [{ name: "SAP posting rules", title: "t", description: "d", body: long }],
    adkSystem: {
      packageName: "",
      title: "Invoice desk",
      description: "d",
      rootAgent: "desk",
      agents: [{ name: "desk", type: "llm", description: "d", model: "", instruction: "Help.", tools: [], subAgents: [], outputKey: "", maxIterations: 0 }],
      tools: [],
      envVars: [],
    },
  },
  new Set(["python"]),
  [],
);
PlanSchema.parse(plan);
assert.deepEqual(plan.technologies, ["python"], "unknown tech dropped, case-folded, de-duplicated");
assert.deepEqual(plan.customAgents.map((a) => a.name), ["invoice-reconciler"], "slugified and de-duplicated");
assert.equal(plan.customSkills[0].name, "sap-posting-rules");
assert.equal(plan.adk?.packageName, "invoice_desk", "package name from title");
assert.equal(plan.adk?.agents[0].model, "gemini-3.8-flash", "empty model -> default");
assert.deepEqual(plan.customAgents[0].handoffsTo, [], "edges to unknown agents and to itself are dropped");
assert.deepEqual(plan.customAgents[0].skills, ["sap-posting-rules"], "skill edges resolve to custom skills only");
console.log("PASS: gemini schema conversion, follow-up and plan normalisation");

// ── guided chat + material analysis ──────────────────────────────────────────
const ctx = { role: "developer" as const, materials: [], answers: [], asked: [], transcript: [], round: 0 };
const asked = guidedFollowUp({ ...ctx, brief: EMPTY_BRIEF, message: "Who approves the budget?" });
assert.deepEqual(asked.brief.openQuestions, ["Who approves the budget?"], "questions become open questions");
const told = guidedFollowUp({ ...ctx, brief: EMPTY_BRIEF, message: "Support tickets in ServiceNow are triaged by hand. It takes hours." });
assert.equal(told.brief.problem, "Support tickets in ServiceNow are triaged by hand. It takes hours.");
assert.equal(told.brief.title, "Support tickets in ServiceNow are triaged by hand");
assert.ok(told.brief.systems.some((s) => s.name === "ServiceNow" && s.requiredValues.some((rv) => rv.isSecret)), "ServiceNow system and secret checklist detected");

const an = guidedAnalyze({
  role: "developer",
  brief: EMPTY_BRIEF,
  materials: [
    { id: "a", name: "spec.md", kind: "file", text: "# Spec\nThe portal is built on Next.js and PostgreSQL and reads SharePoint lists.\n- 400 invoices a week\n- Approvals over 5k need a manager" },
    { id: "b", name: "old.md", kind: "file", text: "ignored" },
  ],
  analyze: ["a"],
});
assert.equal(an.insights.length, 1, "only requested materials are analysed");
assert.deepEqual(an.insights[0].technologies, ["Next.js", "PostgreSQL"]);
assert.ok(an.insights[0].facts.includes("400 invoices a week"));
assert.deepEqual(an.brief.stack, ["Next.js", "PostgreSQL"]);
assert.ok(an.brief.systems.some((s) => s.name === "SharePoint"), "SharePoint detected from material text");
console.log("PASS: guided free-form messages and material analysis");
