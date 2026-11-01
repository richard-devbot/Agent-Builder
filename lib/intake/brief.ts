/**
 * The discovery brief: labels, completeness scoring, answer merging (guided
 * mode) and Markdown export. Pure, so server routes and the browser share it.
 */

import type { Answer, Brief, BriefField, IntakeRole, Material, Plan } from "@/contracts/intake";

export const EMPTY_BRIEF: Brief = {
  title: "",
  summary: "",
  problem: "",
  goals: [],
  users: [],
  inScope: [],
  outOfScope: [],
  stack: [],
  integrations: [],
  dataCompliance: "",
  constraints: [],
  timeline: "",
  successMetrics: [],
  risks: [],
  openQuestions: [],
  assumptions: [],
};

/** Display order, labels and completeness weight per field (weights sum to 100). */
export const FIELD_META: Record<BriefField, { label: string; weight: number }> = {
  problem: { label: "Problem", weight: 16 },
  goals: { label: "Goals", weight: 12 },
  users: { label: "Users & stakeholders", weight: 10 },
  inScope: { label: "In scope", weight: 10 },
  outOfScope: { label: "Out of scope", weight: 4 },
  stack: { label: "Technology", weight: 10 },
  integrations: { label: "Integrations", weight: 6 },
  dataCompliance: { label: "Data & compliance", weight: 8 },
  constraints: { label: "Constraints", weight: 6 },
  timeline: { label: "Timeline", weight: 8 },
  successMetrics: { label: "Success metrics", weight: 6 },
  risks: { label: "Risks", weight: 4 },
};

export const ROLE_LABEL: Record<IntakeRole, string> = {
  developer: "Developer",
  business: "Business user",
  manager: "Manager",
};

export function isFilled(brief: Brief, field: BriefField): boolean {
  const v = brief[field];
  return Array.isArray(v) ? v.length > 0 : v.trim().length > 0;
}

/** 0–100, weighted by how much each field matters for scoping the work. */
export function completeness(brief: Brief): number {
  let score = 0;
  for (const [field, meta] of Object.entries(FIELD_META) as [BriefField, { weight: number }][]) {
    if (isFilled(brief, field)) score += meta.weight;
  }
  return score;
}

/** Fields still empty, highest weight first. */
export function missingFields(brief: Brief): BriefField[] {
  return (Object.entries(FIELD_META) as [BriefField, { weight: number }][])
    .filter(([f]) => !isFilled(brief, f))
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([f]) => f);
}

const splitList = (s: string) =>
  s
    .split(/\n|;|,(?![^(]*\))/)
    .map((x) => x.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);

/** Guided mode: write each answer straight into its field without interpretation. Safe to re-run. */
export function mergeAnswers(brief: Brief, answers: Answer[]): Brief {
  const next: Brief = structuredClone(brief);
  for (const a of answers) {
    const text = a.answer.trim();
    if (!text) continue;
    const cur = next[a.field];
    if (Array.isArray(cur)) {
      const merged = [...cur];
      for (const item of splitList(text)) if (!merged.some((m) => m.toLowerCase() === item.toLowerCase())) merged.push(item);
      (next[a.field] as string[]) = merged.slice(0, 20);
    } else if (!cur.includes(text)) {
      // Idempotent: the full answer history is re-merged every round.
      (next[a.field] as string) = cur ? `${cur}\n${text}` : text;
    }
  }
  return next;
}

/** Seed a brief from the opening form before any follow-up round. */
export function seedBrief(brief: Brief, opening: { problem: string; outcome: string; timeline: string }): Brief {
  const next = structuredClone(brief);
  if (opening.problem.trim() && !next.problem) next.problem = opening.problem.trim();
  if (opening.outcome.trim() && next.goals.length === 0) next.goals = splitList(opening.outcome).slice(0, 12);
  if (opening.timeline && !next.timeline) next.timeline = opening.timeline;
  if (!next.title && next.problem) next.title = next.problem.split(/[.!?\n]/)[0].slice(0, 80);
  return next;
}

const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "_Not captured yet._");
const para = (s: string) => s.trim() || "_Not captured yet._";

/** discovery-brief.md: the shareable handoff for managers and the agent's ground truth. */
export function briefMarkdown(input: {
  brief: Brief;
  role: IntakeRole;
  materials: Material[];
  answers: Answer[];
  plan: Plan | null;
}): string {
  const { brief, role, materials, answers, plan } = input;
  const out = [
    `# ${brief.title || "Discovery brief"}`,
    "",
    `> Captured by ${ROLE_LABEL[role].toLowerCase()} intake · ${completeness(brief)}% complete · ${new Date().toISOString().slice(0, 10)}`,
    "",
    brief.summary ? `${brief.summary}\n` : "",
    "## Problem",
    para(brief.problem),
    "",
    "## Goals",
    bullets(brief.goals),
    "",
    "## Users & stakeholders",
    bullets(brief.users),
    "",
    "## Scope",
    "**In scope**",
    bullets(brief.inScope),
    "",
    "**Out of scope**",
    bullets(brief.outOfScope),
    "",
    "## Technology & integrations",
    bullets([...brief.stack, ...brief.integrations.map((i) => `Integration: ${i}`)]),
    "",
    "## Data & compliance",
    para(brief.dataCompliance),
    "",
    "## Constraints",
    bullets(brief.constraints),
    "",
    "## Timeline",
    para(brief.timeline),
    "",
    "## Success metrics",
    bullets(brief.successMetrics),
    "",
    "## Risks",
    bullets(brief.risks),
    "",
    "## Open questions",
    bullets(brief.openQuestions),
    "",
    ...(brief.assumptions.length ? ["## Assumptions", bullets(brief.assumptions), ""] : []),
  ];
  if (plan) {
    out.push("## Proposed plan", "", plan.summary, "");
    if (plan.milestones.length) {
      out.push("### Milestones", ...plan.milestones.map((m, i) => `${i + 1}. **${m.title}**: ${m.detail}`), "");
    }
    if (plan.customAgents.length || plan.customSkills.length) {
      out.push(
        "### Custom agents & skills",
        ...plan.customAgents.map((a) => `- Agent \`${a.name}\`: ${a.description}`),
        ...plan.customSkills.map((s) => `- Skill \`${s.name}\`: ${s.description}`),
        "",
      );
    }
  }
  if (materials.length) out.push("## Materials provided", ...materials.map((m) => `- ${m.name} (${m.kind})`), "");
  if (answers.length) {
    out.push("## Follow-up Q&A", ...answers.map((a) => `- **${a.question}**\n  ${a.answer.replace(/\n/g, "\n  ")}`), "");
  }
  return out.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim() + "\n";
}
