/**
 * Guided mode: the follow-up flow without a model. Picks the highest-value
 * empty brief fields and asks a role-appropriate question for each, then
 * writes answers straight into the brief. Used when Gemini isn't configured
 * or the API can't be reached, so Discovery always works.
 */

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Brief,
  BriefField,
  FollowUpQuestion,
  FollowUpRequest,
  FollowUpResponse,
  IntakeRole,
  MaterialInsight,
  Plan,
} from "@/contracts/intake";
import { TECHNOLOGIES } from "@/lib/kit/technologies";
import { completeness, mergeAnswers, missingFields } from "./brief";

type Variant = { question: string; why: string; suggestions: string[]; multi?: boolean };

/** Business users get plain language; developers get technical framing; managers get delivery framing. */
const BANK: Record<BriefField, Partial<Record<IntakeRole, Variant>> & { default: Variant }> = {
  problem: {
    default: {
      question: "What is going wrong today, and who feels it most?",
      why: "A concrete pain point keeps the agents focused on the real problem.",
      suggestions: ["Manual, error-prone process", "Slow or unreliable system", "Missing capability", "Legacy system to replace"],
    },
  },
  goals: {
    default: {
      question: "What should be true once this is done?",
      why: "Goals become the acceptance bar for every task the agents pick up.",
      suggestions: ["Cut manual effort", "Faster delivery", "Better user experience", "Lower running cost", "Meet a compliance requirement"],
      multi: true,
    },
    developer: {
      question: "What are the technical goals: new features, refactor, performance, or migration?",
      why: "Technical goals decide which agents and rules the kit enables.",
      suggestions: ["New feature set", "Refactor for maintainability", "Improve performance", "Migrate platform", "Raise test coverage"],
      multi: true,
    },
  },
  users: {
    default: {
      question: "Who will use or be affected by this?",
      why: "Knowing the users shapes stories, permissions and UX decisions.",
      suggestions: ["Customers", "Internal staff", "Operations team", "Partners / vendors", "Administrators"],
      multi: true,
    },
  },
  inScope: {
    default: {
      question: "Which capabilities must the first release include?",
      why: "A clear first slice gives a quick turnaround instead of a big-bang project.",
      suggestions: ["Core workflow end to end", "Reporting / dashboards", "Admin settings", "Notifications", "Data import"],
      multi: true,
    },
    manager: {
      question: "What is the minimum the first release must deliver to count as a success?",
      why: "Defines the MVP the team commits to.",
      suggestions: ["One end-to-end workflow", "Pilot for one team", "Replace the most painful step", "Read-only view first"],
      multi: true,
    },
  },
  outOfScope: {
    default: {
      question: "Is anything explicitly not part of this work?",
      why: "Stating exclusions early prevents scope creep later.",
      suggestions: ["Mobile app", "Data migration", "Third-party integrations", "Billing", "Nothing excluded yet"],
      multi: true,
    },
  },
  stack: {
    default: {
      question: "Do you have systems or technology this must use or fit into?",
      why: "The stack drives which skills, rules and agents are recommended.",
      suggestions: ["Microsoft / Azure", "Google Cloud", "AWS", "Salesforce", "No preference"],
      multi: true,
    },
    developer: {
      question: "Which languages, frameworks and databases are in play?",
      why: "Maps directly onto the kit's technology selection.",
      suggestions: ["TypeScript + React", "Next.js", "Python + FastAPI", "Java + Spring Boot", ".NET", "PostgreSQL"],
      multi: true,
    },
  },
  integrations: {
    default: {
      question: "Which other systems does this need to talk to?",
      why: "Integrations add MCP servers, credentials and test scope.",
      suggestions: ["Jira / Azure DevOps", "Identity provider (SSO)", "Payment provider", "CRM", "Data warehouse", "None"],
      multi: true,
    },
  },
  dataCompliance: {
    default: {
      question: "Does it handle sensitive data or fall under any regulation?",
      why: "Decides the governance tier and the guardrails the kit enforces.",
      suggestions: ["Personal data (GDPR)", "Health data (HIPAA)", "Payment data (PCI DSS)", "Financial / SOX", "No sensitive data"],
      multi: true,
    },
  },
  constraints: {
    default: {
      question: "Are there constraints the solution must respect?",
      why: "Constraints rule out approaches before effort is spent on them.",
      suggestions: ["Fixed budget", "Small team", "Must run on-premises", "Approved vendors only", "Accessibility (WCAG)"],
      multi: true,
    },
  },
  timeline: {
    default: {
      question: "When do you need a first usable version?",
      why: "Sets the size of the first slice and the milestone plan.",
      suggestions: ["Within days", "2–4 weeks", "1–3 months", "This quarter", "Exploring for now"],
    },
  },
  successMetrics: {
    default: {
      question: "How will you measure success?",
      why: "Measurable outcomes let the team prove the work paid off.",
      suggestions: ["Time saved per week", "Error rate", "User adoption", "Cost reduction", "Customer satisfaction"],
      multi: true,
    },
  },
  risks: {
    default: {
      question: "What could stop this from succeeding?",
      why: "Known risks get a mitigation step in the plan.",
      suggestions: ["Unclear requirements", "Legacy data quality", "Key person dependency", "Vendor lock-in", "Security review delays"],
      multi: true,
    },
  },
};

const PER_ROUND = 4;
const MAX_ROUNDS = 6;

export function guidedQuestions(req: Pick<FollowUpRequest, "role" | "brief" | "asked">): FollowUpQuestion[] {
  return missingFields(req.brief)
    .filter((f) => !req.asked.includes(`guided-${f}`))
    .slice(0, PER_ROUND)
    .map((field) => {
      const v = BANK[field][req.role] ?? BANK[field].default;
      return { id: `guided-${field}`, field, question: v.question, why: v.why, suggestions: v.suggestions, multi: Boolean(v.multi) };
    });
}

/**
 * Without a model, free text can't be interpreted. Questions are kept as open
 * questions; anything else is treated as problem context.
 */
function absorbMessage(brief: Brief, message: string): { brief: Brief; note: string } {
  const text = message.trim();
  if (!text) return { brief, note: "" };
  const next = structuredClone(brief);
  if (text.endsWith("?")) {
    if (!next.openQuestions.includes(text)) next.openQuestions = [...next.openQuestions, text].slice(0, 15);
    return { brief: next, note: "I can't answer questions in guided mode, so I've added yours to the open questions for the delivery team." };
  }
  if (!next.problem) {
    next.problem = text.slice(0, 2_000);
    if (!next.title) next.title = text.split(/[.!?\n]/)[0].slice(0, 80);
    return { brief: next, note: "Thanks, I've captured that as the problem statement." };
  }
  if (!next.summary.includes(text)) next.summary = `${next.summary}${next.summary ? "\n" : ""}${text}`.slice(0, 1_200);
  return { brief: next, note: "Noted, I've added that to the brief summary." };
}

export function guidedFollowUp(req: FollowUpRequest): FollowUpResponse {
  const absorbed = absorbMessage(mergeAnswers(req.brief, req.answers), req.message);
  const brief = absorbed.brief;
  const questions = req.round >= MAX_ROUNDS ? [] : guidedQuestions({ ...req, brief });
  const score = completeness(brief);
  const done = questions.length === 0 || score >= 85;
  const next = done
    ? `The brief is ${score}% complete and ready for a plan. Build it whenever you like, or keep adding detail.`
    : req.round === 0
      ? "A few questions to fill the biggest gaps in the brief. Pick an answer or type your own."
      : `The brief is ${score}% complete. Here are the next gaps.`;
  return {
    brief,
    questions: done ? [] : questions,
    message: absorbed.note ? `${absorbed.note} ${next}` : next,
    done,
    mode: "guided",
  };
}

/** Technologies named in a text, matched on whole words against the kit's catalog. */
export function techMentions(text: string): string[] {
  // Keep dots inside names (Next.js, ASP.NET) but drop sentence-ending ones.
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\.+(?=\s|$)/g, " ")} `;
  return TECHNOLOGIES.filter((t) =>
    [t.label, ...(t.aliases ?? [])].some((n) => n.length > 1 && hay.includes(` ${n.toLowerCase()} `)),
  ).map((t) => t.label);
}

/** Guided material analysis: first sentence as summary, bullet/number lines as facts, named technologies. */
export function guidedAnalyze(req: AnalyzeRequest): AnalyzeResponse {
  const insights: MaterialInsight[] = req.materials
    .filter((m) => req.analyze.includes(m.id))
    .map((m) => {
      const lines = m.text.split("\n").map((l) => l.trim()).filter(Boolean);
      const first = lines.find((l) => !/^#/.test(l)) ?? "";
      const facts = lines
        .filter((l) => /^([-*•]|\d+[.)])\s/.test(l) || /\d/.test(l))
        .map((l) => l.replace(/^([-*•]|\d+[.)])\s*/, "").slice(0, 300))
        .slice(0, 6);
      return {
        materialId: m.id,
        summary:
          m.kind === "link" || m.kind === "repo"
            ? `Reference to ${m.name}. Its contents aren't read in guided mode.`
            : (first.split(/(?<=[.!?])\s/)[0] ?? "").slice(0, 600) || `${m.name} (${m.text.length.toLocaleString()} characters)`,
        facts,
        technologies: techMentions(m.text).slice(0, 12),
        gaps: [],
      };
    });
  const brief = structuredClone(req.brief);
  for (const tech of insights.flatMap((i) => i.technologies)) if (!brief.stack.includes(tech)) brief.stack.push(tech);
  brief.stack = brief.stack.slice(0, 20);
  const found = insights.flatMap((i) => i.technologies);
  return {
    insights,
    brief,
    message: `I skimmed ${insights.length} item${insights.length === 1 ? "" : "s"}${
      found.length ? ` and spotted ${[...new Set(found)].slice(0, 5).join(", ")}` : ""
    }. Guided mode only extracts key lines; connect Gemini for a full read.`,
    mode: "guided",
  };
}

/** Guided plan: no drafting without a model, only what can be derived deterministically. */
export function guidedPlan(technologies: string[], skills: Plan["skills"]): Plan {
  return {
    summary:
      "Generated without AI: technologies were matched from the brief and skills recommended by keyword. Connect Gemini to get a milestone plan and draft custom agents and skills.",
    projectType: "none",
    technologies,
    milestones: [],
    skills,
    customAgents: [],
    customSkills: [],
  };
}
