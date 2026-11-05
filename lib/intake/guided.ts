/**
 * Guided mode: the follow-up flow without a model. Picks the highest-value
 * empty brief fields and asks a role-appropriate question for each, then
 * writes answers straight into the brief. Used when Gemini isn't configured
 * or the API can't be reached, so Discovery always works.
 *
 * Also populates `systems[]`, `accessRequests[]`, `audience`, `riskTier`, and
 * `nextSteps[]` deterministically using keyword heuristics.
 */

import type {
  AccessRequest,
  AnalyzeRequest,
  AnalyzeResponse,
  Brief,
  BriefField,
  DiscoverySystem,
  FollowUpQuestion,
  FollowUpRequest,
  FollowUpResponse,
  IntakeRole,
  MaterialInsight,
  Plan,
  RiskTier,
} from "@/contracts/intake";
import { TECHNOLOGIES } from "@/lib/kit/technologies";
import { synthesizeAdkFromBrief } from "@/lib/adk/catalog";
import { completeness, mergeAnswers, missingFields } from "./brief";

type Variant = {
  question: string;
  why: string;
  suggestions: string[];
  multi?: boolean;
};

/** Business users get plain language; developers get technical framing; managers get delivery framing. */
const BANK: Record<
  BriefField,
  Partial<Record<IntakeRole, Variant>> & { default: Variant }
> = {
  problem: {
    default: {
      question: "What is going wrong today, and who feels it most?",
      why: "A concrete pain point keeps the agents focused on the real problem.",
      suggestions: [
        "Manual, error-prone process",
        "Slow or unreliable system",
        "Missing capability",
        "Legacy system to replace",
      ],
    },
  },
  goals: {
    default: {
      question: "What should be true once this is done?",
      why: "Goals become the acceptance bar for every task the agents pick up.",
      suggestions: [
        "Cut manual effort",
        "Faster delivery",
        "Better user experience",
        "Lower running cost",
        "Meet a compliance requirement",
      ],
      multi: true,
    },
    developer: {
      question:
        "What are the technical goals: new features, refactor, performance, or migration?",
      why: "Technical goals decide which agents and rules the kit enables.",
      suggestions: [
        "New feature set",
        "Refactor for maintainability",
        "Improve performance",
        "Migrate platform",
        "Raise test coverage",
      ],
      multi: true,
    },
  },
  users: {
    default: {
      question: "Who will use or be affected by this?",
      why: "Knowing the users shapes stories, permissions and UX decisions.",
      suggestions: [
        "Just me",
        "My team",
        "Department",
        "Whole company",
        "Operations team",
      ],
      multi: true,
    },
  },
  inScope: {
    default: {
      question: "Which capabilities must the first release include?",
      why: "A clear first slice gives a quick turnaround instead of a big-bang project.",
      suggestions: [
        "Core workflow end to end",
        "Reporting / dashboards",
        "Admin settings",
        "Notifications",
        "Data import",
      ],
      multi: true,
    },
    manager: {
      question:
        "What is the minimum the first release must deliver to count as a success?",
      why: "Defines the MVP the team commits to.",
      suggestions: [
        "One end-to-end workflow",
        "Pilot for one team",
        "Replace the most painful step",
        "Read-only view first",
      ],
      multi: true,
    },
  },
  outOfScope: {
    default: {
      question: "Is anything explicitly not part of this work?",
      why: "Stating exclusions early prevents scope creep later.",
      suggestions: [
        "Mobile app",
        "Data migration",
        "Third-party integrations",
        "Billing",
        "Nothing excluded yet",
      ],
      multi: true,
    },
  },
  stack: {
    default: {
      question: "Do you have systems or technology this must use or fit into?",
      why: "The stack drives which skills, rules and agents are recommended.",
      suggestions: [
        "SharePoint / Microsoft 365",
        "ServiceNow",
        "Salesforce",
        "SAP / Workday",
        "BigQuery / Google Cloud",
      ],
      multi: true,
    },
    developer: {
      question: "Which languages, frameworks and databases are in play?",
      why: "Maps directly onto the kit's technology selection.",
      suggestions: [
        "TypeScript + React",
        "Next.js",
        "Python + FastAPI",
        "Java + Spring Boot",
        ".NET",
        "PostgreSQL",
      ],
      multi: true,
    },
  },
  integrations: {
    default: {
      question: "Which other systems does this need to talk to?",
      why: "Integrations add connectors, connection checklists, and governance scope.",
      suggestions: [
        "SharePoint",
        "ServiceNow",
        "Salesforce",
        "Workday",
        "SAP",
        "Jira / Confluence",
      ],
      multi: true,
    },
  },
  dataCompliance: {
    default: {
      question: "Does it handle sensitive data or fall under any regulation?",
      why: "Decides the governance tier and the guardrails the kit enforces.",
      suggestions: [
        "Personal data (GDPR)",
        "Confidential internal records",
        "Financial / SOX",
        "Regulated / regional residency",
        "No sensitive data",
      ],
      multi: true,
    },
  },
  constraints: {
    default: {
      question: "Are there constraints the solution must respect?",
      why: "Constraints rule out approaches before effort is spent on them.",
      suggestions: [
        "Fixed budget",
        "Small team",
        "Read-only access to source systems",
        "Approved connectors only",
        "Human approval before changes",
      ],
      multi: true,
    },
  },
  timeline: {
    default: {
      question: "When do you need a first usable version?",
      why: "Sets the size of the first slice and the milestone plan.",
      suggestions: [
        "Within days",
        "2–4 weeks",
        "1–3 months",
        "This quarter",
        "Exploring for now",
      ],
    },
  },
  successMetrics: {
    default: {
      question: "How will you measure success?",
      why: "Measurable outcomes let the team prove the work paid off.",
      suggestions: [
        "Time saved per week",
        "Error rate",
        "User adoption",
        "Cost reduction",
        "Faster response time",
      ],
      multi: true,
    },
  },
  risks: {
    default: {
      question: "What could stop this from succeeding?",
      why: "Known risks get a mitigation step in the plan.",
      suggestions: [
        "Unclear requirements",
        "System access delays",
        "Key person dependency",
        "Data quality issues",
        "Security review delays",
      ],
      multi: true,
    },
  },
};

interface SystemCatalogEntry {
  name: string;
  keywords: RegExp;
  purpose: string;
  dataAccessed: string;
  defaultClassification: string;
  ownerTeam: string;
  connectionMethod: string;
  nonSecretName: string;
  nonSecretWhere: string;
  secretName: string;
  secretStorage: string;
}

const SYSTEM_HEURISTIC_CATALOG: SystemCatalogEntry[] = [
  {
    name: "SharePoint",
    keywords: /\b(sharepoint|onedrive|office\s*365|m365)\b/i,
    purpose: "Read or search team documents, policies, and spreadsheets.",
    dataAccessed: "Document libraries, lists, and shared folders",
    defaultClassification: "Internal",
    ownerTeam: "Microsoft 365 / Collaboration Platform Team",
    connectionMethod: "Pre-approved Microsoft Graph connector (Entra App Registration)",
    nonSecretName: "SHAREPOINT_SITE_URL",
    nonSecretWhere: "Copy the SharePoint site URL from your browser address bar",
    secretName: "SHAREPOINT_CLIENT_SECRET",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/SHAREPOINT_CLIENT_SECRET)",
  },
  {
    name: "ServiceNow",
    keywords: /\b(servicenow|snow|incident\s+queue|service\s+desk|it\s+ticket)\b/i,
    purpose: "Look up or triage support tickets, incidents, and service requests.",
    dataAccessed: "Incident records, assignment queues, and knowledge articles",
    defaultClassification: "Internal / Confidential",
    ownerTeam: "IT Service Management (ServiceNow Platform Team)",
    connectionMethod: "ServiceNow REST API via OAuth integration account",
    nonSecretName: "SERVICENOW_INSTANCE_AND_QUEUE",
    nonSecretWhere: "Your ServiceNow instance hostname and assignment group name",
    secretName: "SERVICENOW_OAUTH_CLIENT_SECRET",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/SERVICENOW_OAUTH_CLIENT_SECRET)",
  },
  {
    name: "Salesforce",
    keywords: /\b(salesforce|sfdc|crm|opportunities|customer\s+accounts)\b/i,
    purpose: "Retrieve customer account context, cases, and sales opportunity status.",
    dataAccessed: "Accounts, Contacts, Opportunities, and Cases",
    defaultClassification: "Confidential / Customer PII",
    ownerTeam: "CRM / Commercial Systems Team",
    connectionMethod: "Salesforce Connected App (OAuth 2.0 JWT Bearer flow)",
    nonSecretName: "SALESFORCE_INSTANCE_URL",
    nonSecretWhere: "Your company Salesforce domain URL",
    secretName: "SALESFORCE_CONNECTED_APP_KEY",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/SALESFORCE_CONNECTED_APP_KEY)",
  },
  {
    name: "Workday",
    keywords: /\b(workday|hris|employee\s+records|onboarding|pto|leave\s+request)\b/i,
    purpose: "Check HR policies, org structure, or onboarding status.",
    dataAccessed: "Worker profiles, org hierarchy, and HR policy documents",
    defaultClassification: "Confidential / Employee Personal Data",
    ownerTeam: "HR Technology (Workday Admin Team)",
    connectionMethod: "Workday Integration System User (ISU) via pre-approved connector",
    nonSecretName: "WORKDAY_TENANT_NAME",
    nonSecretWhere: "Provided by the HR Technology team",
    secretName: "WORKDAY_ISU_CREDENTIALS",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/WORKDAY_ISU_CREDENTIALS)",
  },
  {
    name: "SAP",
    keywords: /\b(sap|erp|invoices?|purchase\s+orders?|vendor\s+list|general\s+ledger)\b/i,
    purpose: "Validate purchase orders, supplier records, and invoice status.",
    dataAccessed: "Vendor master, purchase orders, and invoice posting records",
    defaultClassification: "Confidential / Financial (SOX)",
    ownerTeam: "Enterprise ERP / Finance Systems Team",
    connectionMethod: "SAP OData / BAPI gateway with service principal",
    nonSecretName: "SAP_SYSTEM_ID_AND_COMPANY_CODE",
    nonSecretWhere: "Your finance operations lead or SAP Basis team",
    secretName: "SAP_OAUTH_CLIENT_SECRET",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/SAP_OAUTH_CLIENT_SECRET)",
  },
  {
    name: "Jira",
    keywords: /\b(jira|backlog|sprint|issue\s+tracker)\b/i,
    purpose: "Read or update project issues, backlog items, and blockers.",
    dataAccessed: "Jira projects, issues, comments, and workflow states",
    defaultClassification: "Internal",
    ownerTeam: "Atlassian / Developer Productivity Team",
    connectionMethod: "Jira REST API v3 service account token",
    nonSecretName: "JIRA_PROJECT_KEY",
    nonSecretWhere: "The short prefix on your team's Jira tickets (e.g. OPS, FIN)",
    secretName: "JIRA_SERVICE_TOKEN",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/JIRA_SERVICE_TOKEN)",
  },
  {
    name: "Confluence",
    keywords: /\b(confluence|wiki|runbook|knowledge\s+base)\b/i,
    purpose: "Search internal runbooks, SOPs, and team wiki pages.",
    dataAccessed: "Confluence space pages and attachments",
    defaultClassification: "Internal",
    ownerTeam: "Atlassian / Knowledge Management Team",
    connectionMethod: "Confluence REST API read-only service account",
    nonSecretName: "CONFLUENCE_SPACE_KEY",
    nonSecretWhere: "The space key in your Confluence URL",
    secretName: "CONFLUENCE_API_TOKEN",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/CONFLUENCE_API_TOKEN)",
  },
  {
    name: "BigQuery",
    keywords: /\b(bigquery|bq|data\s+warehouse|analytics\s+dataset)\b/i,
    purpose: "Query governed analytical tables and reporting views.",
    dataAccessed: "BigQuery dataset tables and reporting views",
    defaultClassification: "Internal / Confidential",
    ownerTeam: "Enterprise Data Platform Team",
    connectionMethod: "Workload Identity / Runtime Service Account IAM (`roles/bigquery.dataViewer`)",
    nonSecretName: "BIGQUERY_DATASET_AND_TABLE",
    nonSecretWhere: "Data catalog or your analytics team lead",
    secretName: "RUNTIME_SA_IAM_BINDING",
    secretStorage: "GitLab Protected CI Variable / Google IAM binding (keyless)",
  },
  {
    name: "Internal Database (PostgreSQL / SQL)",
    keywords: /\b(postgres|postgresql|mysql|sql\s+server|oracle|internal\s+database)\b/i,
    purpose: "Query application records from the internal relational database.",
    dataAccessed: "Application tables and read-only views",
    defaultClassification: "Confidential",
    ownerTeam: "Database Engineering / Application Owner Team",
    connectionMethod: "Cloud SQL IAM database authentication or read-replica user",
    nonSecretName: "DB_INSTANCE_AND_SCHEMA",
    nonSecretWhere: "Application technical contact or DBA team",
    secretName: "DB_READONLY_PASSWORD",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/DB_READONLY_PASSWORD)",
  },
  {
    name: "Email / Exchange Online",
    keywords: /\b(email|outlook|mailbox|inbox|shared\s+mailbox)\b/i,
    purpose: "Read incoming requests from a shared mailbox or draft email replies.",
    dataAccessed: "Shared mailbox messages and attachments",
    defaultClassification: "Internal / Confidential",
    ownerTeam: "Messaging / Microsoft 365 Admin Team",
    connectionMethod: "Microsoft Graph Mail API scoped to a single shared mailbox",
    nonSecretName: "SHARED_MAILBOX_ADDRESS",
    nonSecretWhere: "The shared mailbox address your team monitors",
    secretName: "GRAPH_MAIL_CLIENT_SECRET",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/GRAPH_MAIL_CLIENT_SECRET)",
  },
  {
    name: "Microsoft Teams",
    keywords: /\b(microsoft\s+teams|teams\s+channel|chat\s+notification)\b/i,
    purpose: "Post notifications, summaries, or approval requests to a team channel.",
    dataAccessed: "Team channel messages and adaptive cards",
    defaultClassification: "Internal",
    ownerTeam: "Microsoft 365 / Collaboration Platform Team",
    connectionMethod: "Entra-authenticated Teams Bot / Graph Channel API",
    nonSecretName: "TEAMS_CHANNEL_ID",
    nonSecretWhere: "In Teams, click '...' next to the channel name -> Get link to channel",
    secretName: "TEAMS_BOT_CLIENT_SECRET",
    secretStorage: "Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/TEAMS_BOT_CLIENT_SECRET)",
  },
];

export function enrichDiscoveryBriefHeuristics(brief: Brief): Brief {
  const next = structuredClone(brief);
  const corpus = [
    next.title,
    next.summary,
    next.problem,
    next.goals.join(" "),
    next.users.join(" "),
    next.inScope.join(" "),
    next.stack.join(" "),
    next.integrations.join(" "),
    next.dataCompliance,
    next.constraints.join(" "),
  ].join("\n");

  if (!corpus.trim()) return next;

  const wantsWrite = /\b(create|update|post|write|send|approve|modify|delete|change|submit)\b/i.test(
    `${next.problem} ${next.goals.join(" ")} ${next.inScope.join(" ")}`,
  );

  // Audience heuristic
  if (!next.audience) {
    if (/\bwhole\s+company|all\s+employees|company[-\s]wide\b/i.test(corpus)) {
      next.audience = "whole company";
    } else if (/\bdepartment|division|finance\s+org|hr\s+org|sales\s+org\b/i.test(corpus)) {
      next.audience = "department";
    } else if (/\bjust\s+me|myself|personal\b/i.test(corpus)) {
      next.audience = "just me";
    } else if (next.users.length > 0 || next.problem.trim().length > 0) {
      next.audience = "my team";
    }
  }

  // Systems heuristic
  const existingByName = new Map(
    (next.systems ?? []).map((s) => [s.name.toLowerCase(), s]),
  );
  const detectedSystems: DiscoverySystem[] = [...(next.systems ?? [])];
  const accessRequests: AccessRequest[] = [...(next.accessRequests ?? [])];

  for (const entry of SYSTEM_HEURISTIC_CATALOG) {
    if (!entry.keywords.test(corpus)) continue;
    if (existingByName.has(entry.name.toLowerCase())) continue;

    const accessMode: "read" | "write" = wantsWrite ? "write" : "read";
    const system: DiscoverySystem = {
      name: entry.name,
      purpose: entry.purpose,
      dataAccessed: entry.dataAccessed,
      access: accessMode,
      dataClassification: next.dataCompliance.trim() || entry.defaultClassification,
      ownerTeam: entry.ownerTeam,
      connectionMethod: entry.connectionMethod,
      requiredValues: [
        {
          name: entry.nonSecretName,
          isSecret: false,
          whereToGet: entry.nonSecretWhere,
          whoProvides: "Your team lead or business system key user",
          howToRequest: "Look up in your team's existing workspace or ask your system key user.",
        },
        {
          name: entry.secretName,
          isSecret: true,
          whereToGet: "Generated by the system owning team (never shared in chat or code)",
          whoProvides: entry.ownerTeam,
          howToRequest: `Submit an internal access request to ${entry.ownerTeam} asking them to store the credential in ${entry.secretStorage}.`,
        },
      ],
      storageLocation: entry.secretStorage,
      status: "needs_request",
    };

    detectedSystems.push(system);
    existingByName.set(entry.name.toLowerCase(), system);

    if (
      !accessRequests.some(
        (ar) => ar.ownerTeam === entry.ownerTeam && ar.item.includes(entry.name),
      )
    ) {
      accessRequests.push({
        item: `${entry.name} (${accessMode === "write" ? "Read/Write" : "Read-only"} service connection)`,
        ownerTeam: entry.ownerTeam,
        suggestedWording: `Hi ${entry.ownerTeam}, our team is building a governed internal AI agent ("${next.title || "Team Assistant"}"). Could you provision a ${accessMode === "write" ? "read/write" : "read-only"} connection (${entry.connectionMethod}) and place the secret directly in ${entry.secretStorage}?`,
      });
    }
  }

  next.systems = detectedSystems.slice(0, 16);
  next.accessRequests = accessRequests.slice(0, 16);

  // Risk tier heuristic
  const hasSensitive =
    /\b(gdpr|pii|personal\s+data|hipaa|pci|sox|confidential|regulated|salary|payroll)\b/i.test(
      corpus,
    );
  let riskTier: RiskTier = "low";
  let riskReason = "Read-only access to internal information with no external actions.";
  if (wantsWrite && hasSensitive) {
    riskTier = "high";
    riskReason =
      "Accesses confidential/personal data and performs write or external actions — human confirmation is required before changes.";
  } else if (wantsWrite || hasSensitive) {
    riskTier = "medium";
    riskReason = wantsWrite
      ? "Creates or updates records in internal systems — human confirmation is recommended."
      : "Reads confidential or personal data — requires strict role-based access control.";
  }
  next.riskTier = riskTier;
  next.riskReason = riskReason;

  // Next steps for the business user
  if (next.systems.length > 0 && (!next.nextSteps || next.nextSteps.length === 0)) {
    next.nextSteps = [
      `Confirm the non-secret identifiers (${next.systems.map((s) => s.requiredValues[0]?.name).filter(Boolean).join(", ")}) with your team.`,
      `Send the suggested access request wording to ${[...new Set(next.systems.map((s) => s.ownerTeam))].join(", ")} so they can store credentials in Google Secret Manager.`,
      "Review the Systems & Connections panel and proceed to Organisation & Project setup.",
    ];
  }

  return next;
}

const PER_ROUND = 4;
const MAX_ROUNDS = 6;

export function guidedQuestions(
  req: Pick<FollowUpRequest, "role" | "brief" | "asked">,
): FollowUpQuestion[] {
  return missingFields(req.brief)
    .filter((f) => !req.asked.includes(`guided-${f}`))
    .slice(0, PER_ROUND)
    .map((field) => {
      const v = BANK[field][req.role] ?? BANK[field].default;
      return {
        id: `guided-${field}`,
        field,
        question: v.question,
        why: v.why,
        suggestions: v.suggestions,
        multi: Boolean(v.multi),
      };
    });
}

/**
 * Without a model, free text can't be interpreted. Questions are kept as open
 * questions; anything else is treated as problem context.
 */
function absorbMessage(
  brief: Brief,
  message: string,
): { brief: Brief; note: string } {
  const text = message.trim();
  if (!text) return { brief, note: "" };
  const next = structuredClone(brief);
  if (text.endsWith("?")) {
    if (!next.openQuestions.includes(text))
      next.openQuestions = [...next.openQuestions, text].slice(0, 15);
    return {
      brief: next,
      note: "I can't answer questions in guided mode, so I've added yours to the open questions for the delivery team.",
    };
  }
  if (!next.problem) {
    next.problem = text.slice(0, 2_000);
    if (!next.title) next.title = text.split(/[.!?\n]/)[0].slice(0, 80);
    return {
      brief: next,
      note: "Thanks, I've captured that as the problem statement.",
    };
  }
  if (!next.summary.includes(text))
    next.summary = `${next.summary}${next.summary ? "\n" : ""}${text}`.slice(
      0,
      1_200,
    );
  return { brief: next, note: "Noted, I've added that to the brief summary." };
}

export function guidedFollowUp(req: FollowUpRequest): FollowUpResponse {
  const absorbed = absorbMessage(
    mergeAnswers(req.brief, req.answers),
    req.message,
  );
  const brief = enrichDiscoveryBriefHeuristics(absorbed.brief);
  const questions =
    req.round >= MAX_ROUNDS ? [] : guidedQuestions({ ...req, brief });
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
  const hay = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\.+(?=\s|$)/g, " ")} `;
  return TECHNOLOGIES.filter((t) =>
    [t.label, ...(t.aliases ?? [])].some(
      (n) => n.length > 1 && hay.includes(` ${n.toLowerCase()} `),
    ),
  ).map((t) => t.label);
}

/** Guided material analysis: first sentence as summary, bullet/number lines as facts, named technologies. */
export function guidedAnalyze(req: AnalyzeRequest): AnalyzeResponse {
  const freshMaterials = req.materials.filter((m) =>
    req.analyze.includes(m.id),
  );
  const insights: MaterialInsight[] = freshMaterials.map((m) => {
    const lines = m.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
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
          : (first.split(/(?<=[.!?])\s/)[0] ?? "").slice(0, 600) ||
            `${m.name} (${m.text.length.toLocaleString()} characters)`,
      facts,
      technologies: techMentions(m.text).slice(0, 12),
      gaps: [],
    };
  });
  let brief = structuredClone(req.brief);
  for (const tech of insights.flatMap((i) => i.technologies))
    if (!brief.stack.includes(tech)) brief.stack.push(tech);
  brief.stack = brief.stack.slice(0, 20);

  // Also scan material text for business systems
  const combinedMaterialText = freshMaterials.map((m) => m.text).join("\n");
  for (const entry of SYSTEM_HEURISTIC_CATALOG) {
    if (
      entry.keywords.test(combinedMaterialText) &&
      !brief.integrations.includes(entry.name)
    ) {
      brief.integrations.push(entry.name);
    }
  }
  brief.integrations = brief.integrations.slice(0, 12);
  brief = enrichDiscoveryBriefHeuristics(brief);

  const found = insights.flatMap((i) => i.technologies);
  return {
    insights,
    brief,
    message: `I skimmed ${insights.length} item${insights.length === 1 ? "" : "s"}${
      found.length
        ? ` and spotted ${[...new Set(found)].slice(0, 5).join(", ")}`
        : ""
    }. Guided mode only extracts key lines; connect Gemini for a full read.`,
    mode: "guided",
  };
}

/** Guided plan: deterministic blueprint + synthesized Google ADK multi-agent system from the brief. */
export function guidedPlan(
  technologies: string[],
  skills: Plan["skills"],
  brief?: Brief,
): Plan {
  return {
    summary:
      "Generated deterministically from your Discovery brief: matched technologies, recommended skills, and a runnable Google ADK multi-agent flow wired to your detected enterprise systems. Connect Gemini to further tailor milestones and custom instructions.",
    projectType: "greenfield",
    technologies,
    milestones: brief
      ? [
          {
            title: "Phase 1 — Discovery & Governed Sandbox",
            detail: `Validate the ${brief.title || "ADK workflow"} flow locally with adk web and synthetic data.`,
          },
          {
            title: "Phase 2 — Enterprise Connections & Eval Gate",
            detail: "Bind Secret Manager credentials, run agents-cli eval, and verify before_tool_guardrail callbacks.",
          },
          {
            title: "Phase 3 — Governed Vertex AI Deployment",
            detail: "Promote via GitLab CI + Workload Identity Federation to Vertex AI Agent Engine or Cloud Run.",
          },
        ]
      : [],
    skills,
    customAgents: [],
    customSkills: [],
    adk: brief ? synthesizeAdkFromBrief(brief) : null,
  };
}
