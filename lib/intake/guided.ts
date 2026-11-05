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
  Material,
  MaterialInsight,
  Plan,
  RiskTier,
} from "@/contracts/intake";
import type { AdkProject } from "@/contracts/adk";
import { TECHNOLOGIES } from "@/lib/kit/technologies";
import { synthesizeAdkFromBrief } from "@/lib/adk/catalog";
import { FIELD_META, completeness, mergeAnswers, missingFields } from "./brief";

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

  // Dynamically synthesize connection checklist entries for any other systems named in brief.integrations
  for (const rawSysName of next.integrations) {
    const sysName = rawSysName.trim();
    if (!sysName || existingByName.has(sysName.toLowerCase())) continue;
    const envPrefix =
      sysName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 28) || "SYSTEM";
    const accessMode: "read" | "write" = wantsWrite ? "write" : "read";
    const ownerTeam = `${sysName} Platform / System Administration Team`;
    const secretName = `${envPrefix}_OAUTH_CLIENT_SECRET`;
    const secretStorage = `Google Secret Manager (projects/$GCP_PROJECT_ID/secrets/${secretName})`;
    const dynamicSystem: DiscoverySystem = {
      name: sysName,
      purpose: `Look up, validate, or stage workflow records in ${sysName}.`,
      dataAccessed: `${sysName} business records and transaction state`,
      access: accessMode,
      dataClassification: next.dataCompliance.trim() || "Internal / Confidential",
      ownerTeam,
      connectionMethod: `${sysName} REST API via OAuth 2.0 / Service Principal`,
      requiredValues: [
        {
          name: `${envPrefix}_INSTANCE_URL`,
          isSecret: false,
          whereToGet: `Your company ${sysName} base URL or tenant identifier`,
          whoProvides: "Your team lead or business system key user",
          howToRequest: "Look up in your team's existing workspace or ask your system key user.",
        },
        {
          name: secretName,
          isSecret: true,
          whereToGet: "Generated by the system owning team (never shared in chat or code)",
          whoProvides: ownerTeam,
          howToRequest: `Submit an internal access request to ${ownerTeam} asking them to store the credential in ${secretStorage}.`,
        },
      ],
      storageLocation: secretStorage,
      status: "needs_request",
    };
    detectedSystems.push(dynamicSystem);
    existingByName.set(sysName.toLowerCase(), dynamicSystem);
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

export function stripMarkdown(raw: string): string {
  return raw
    .replace(/^>+\s*/g, "")
    .replace(/^#{1,6}\s+/g, "")
    .replace(/^(?:[-*•+]|\d+[.)])\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[*_~`>|]+|[*_~`>|]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipWords(raw: string, maxLen: number): string {
  const clean = stripMarkdown(raw).replace(/[:;,]+$/, "").trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(" ");
  const base =
    lastSpace >= Math.floor(maxLen * 0.55) ? sliced.slice(0, lastSpace) : sliced;
  const trimmed = base
    .replace(/[\s,:;.\-–—/]+$/, "")
    .replace(
      /\s+\b(and|or|the|a|an|to|for|with|in|on|of|by|from|that|which|who|must|should|can|will|is|are)\b$/i,
      "",
    )
    .trim();
  return `${trimmed}…`;
}

function isDisclaimerOrMetaLine(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed) return true;
  if (/^[-=_*]{3,}$/.test(trimmed)) return true;
  const clean = stripMarkdown(trimmed);
  if (!clean) return true;
  if (
    /^>/.test(trimmed) &&
    /\b(status|disclaimer|note|warning|proposed\s+production\s+design|not\s+a\s+verified\s+description|must\s+be\s+confirmed|draft|confidential)\b/i.test(
      clean,
    )
  ) {
    return true;
  }
  if (
    /^(status|disclaimer|author|owners?|version|date|last\s+updated|confidential|classification|document\s+status)\s*:/i.test(
      clean,
    )
  ) {
    return true;
  }
  if (
    /\b(proposed\s+production\s+design|not\s+a\s+verified\s+description)\b/i.test(
      clean,
    )
  ) {
    return true;
  }
  if (/^built\s+with\s+google\s+adk\b/i.test(clean)) {
    return true;
  }
  return false;
}

const GENERIC_HEADING_RE =
  /^(?:\d+(?:\.\d+)*[.)]?\s*)?(?:spec|specification|notes?|document|readme|overview|introduction|summary|executive\s+summary|business\s+case|background|problem|problem\s+statement|goals?|objectives?|scope|in\s+scope|out\s+of\s+scope|requirements?|architecture|systems?|integrations?|constraints?|risks?|timeline|appendix|conclusion|next\s+steps|open\s+questions|context|purpose|status)$/i;

interface ExtractedDocContext {
  docNames: string[];
  headings: string[];
  facts: string[];
  workflowSteps: string[];
  rulesAndThresholds: string[];
  entities: string[];
  systems: string[];
}

function parseMaterialStructure(m: Material): {
  docTitle: string;
  headings: string[];
  firstSentence: string;
  facts: string[];
  workflowSteps: string[];
  rulesAndThresholds: string[];
  entities: string[];
  systems: string[];
} {
  const rawLines = m.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const lines = rawLines.filter((l) => !isDisclaimerOrMetaLine(l));

  const rawHeadings = lines
    .filter((l) => /^#{1,4}\s+/.test(l) || /^[A-Z][A-Za-z0-9\s/&,-]{3,48}:$/.test(l))
    .map((l) => stripMarkdown(l.replace(/^#{1,4}\s+/, "").replace(/:$/, "")))
    .filter((h) => h.length > 2);

  const docTitle =
    rawHeadings.find((h) => !GENERIC_HEADING_RE.test(h))?.replace(/^\d+(?:\.\d+)*[.)]?\s*/, "") ?? "";

  const headings = rawHeadings
    .map((h) => h.replace(/^\d+(?:\.\d+)*[.)]?\s*/, "").trim())
    .filter(
      (h) =>
        h.length > 2 &&
        !GENERIC_HEADING_RE.test(h) &&
        h.toLowerCase() !== docTitle.toLowerCase(),
    )
    .slice(0, 8);

  const firstBodyLine =
    lines.find(
      (l) =>
        !/^#/.test(l) &&
        !/^>/.test(l) &&
        !/^(?:[-*•]|\d+[.)])\s+/.test(l) &&
        !/^\*[^*]+\*\*?$/.test(l),
    ) ??
    lines.find((l) => !/^#/.test(l) && !/^>/.test(l)) ??
    "";
  const firstSentence = stripMarkdown(firstBodyLine.split(/(?<=[.!?])\s/)[0] ?? "").slice(0, 600);

  // Preserve bullet/number fact extraction while stripping noisy markdown
  const primaryFacts = lines
    .filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l) || (!/^#/.test(l) && /\d/.test(l)))
    .map((l) => stripMarkdown(l.replace(/^(?:[-*•]|\d+[.)])\s+/, "")).slice(0, 300))
    .filter((f) => f.length >= 4 && !GENERIC_HEADING_RE.test(f))
    .slice(0, 6);

  const actionStepRegex =
    /\b(extract|validate|triage|route|lookup|look\s+up|verify|check|approve|stage|create|update|reconcile|notify|sync|parse|read|write|send|ingest|classify|match|compare|calculate|escalate|fetch|post|review|resolve|missing|differs|insufficient)\b/i;

  const workflowSteps: string[] = [];
  for (const line of lines) {
    if (/^#/.test(line) || /^>/.test(line)) continue;
    const isBulletOrStep = /^(?:[-*•]|\d+[.)]|step\s*\d+[:.-]?)\s+/i.test(line);
    const clean = stripMarkdown(
      line.replace(/^(?:[-*•]|\d+[.)]|step\s*\d+[:.-]?)\s+/i, ""),
    )
      .replace(/\.$/, "")
      .trim();
    if (!clean || GENERIC_HEADING_RE.test(clean)) continue;
    if (docTitle && clean.toLowerCase() === docTitle.toLowerCase()) continue;
    if ((isBulletOrStep || actionStepRegex.test(clean)) && clean.length >= 6 && clean.length <= 180) {
      if (!workflowSteps.some((s) => s.toLowerCase() === clean.toLowerCase())) {
        workflowSteps.push(clean);
      }
    }
  }
  for (const h of headings) {
    if (!workflowSteps.some((s) => s.toLowerCase() === h.toLowerCase())) {
      workflowSteps.push(h);
    }
  }

  const ruleRegex =
    /\b(approv|over\s+\$?\d+|under\s+\$?\d+|threshold|limit|manager|sla|must|require|mandatory|gdpr|sox|pii|hipaa|confidential|audit|within\s+\d+|exception)\b/i;
  const rulesAndThresholds = lines
    .filter((l) => !/^#/.test(l) && !/^>/.test(l))
    .map((l) => stripMarkdown(l.replace(/^(?:[-*•]|\d+[.)])\s+/, "")).replace(/[:;]+$/, "").trim())
    .filter((l) => ruleRegex.test(l) && l.length >= 8 && l.length <= 200)
    .slice(0, 6);

  const cleanText = lines.map(stripMarkdown).join("\n");
  const quotedEntities = [...cleanText.matchAll(/["'`]([A-Za-z0-9][A-Za-z0-9\s_-]{2,40})["'`]/g)].map((match) => match[1].trim());
  const domainNouns = [
    ...cleanText.matchAll(
      /\b([A-Za-z0-9_-]+\s+(?:list|lists|queue|table|view|portal|form|report|invoice|invoices|ticket|tickets|order|orders|claim|claims|contract|contracts|vendor|vendors|policy|record|records|dataset|pipeline|exceptions?|receipts?))\b/gi,
    ),
  ].map((match) => match[1].trim());
  const entities = [...new Set([...quotedEntities, ...domainNouns])].slice(0, 8);

  const systems: string[] = [];
  for (const entry of SYSTEM_HEURISTIC_CATALOG) {
    if (entry.keywords.test(m.text) && !systems.includes(entry.name)) {
      systems.push(entry.name);
    }
  }
  const dynamicSysMatches = m.text.matchAll(
    /\b(?:integrated\s+with|connect(?:s|ed)?\s+to|sync(?:s|ed)?\s+with|integrations?\s*[:=-]|systems?\s*[:=-])\s*([A-Z][A-Za-z0-9/.&_-]*(?:(?:\s*,\s*|\s+and\s+)[A-Z][A-Za-z0-9/.&_-]*)*)/g,
  );
  const ignoredSysWords = new Set([
    "approved",
    "enterprise",
    "system",
    "systems",
    "internal",
    "external",
    "google",
    "cloud",
    "adk",
  ]);
  for (const match of dynamicSysMatches) {
    const rawGroup = match[1] ?? "";
    const parts = rawGroup
      .split(/(?:\s*,\s*|\s+and\s+)/i)
      .map((p) => stripMarkdown(p).replace(/[.!?;:]+$/, "").trim())
      .filter((p) => p.length >= 2 && p.length <= 36 && !ignoredSysWords.has(p.toLowerCase()));
    for (const part of parts) {
      if (!systems.some((s) => s.toLowerCase() === part.toLowerCase())) {
        systems.push(part);
      }
    }
  }

  return {
    docTitle,
    headings,
    firstSentence,
    facts: primaryFacts,
    workflowSteps: workflowSteps.slice(0, 8),
    rulesAndThresholds,
    entities,
    systems,
  };
}

function buildDocContext(brief: Brief, materials: Material[] = []): ExtractedDocContext {
  const parsed = materials.map(parseMaterialStructure);
  const docNames = materials.map((m) => m.name);
  const headings = [...new Set(parsed.flatMap((p) => p.headings))];
  const cleanAssumptions = brief.assumptions
    .filter((a) => !isDisclaimerOrMetaLine(a))
    .map((a) => stripMarkdown(a));
  const facts = [...new Set([...parsed.flatMap((p) => p.facts), ...cleanAssumptions])];
  const workflowSteps = [
    ...new Set([
      ...brief.inScope.filter((s) => !isDisclaimerOrMetaLine(s)).map((s) => stripMarkdown(s)),
      ...parsed.flatMap((p) => p.workflowSteps),
      ...cleanAssumptions,
      ...brief.goals.filter((g) => !isDisclaimerOrMetaLine(g)).map((g) => stripMarkdown(g)),
    ]),
  ].filter((s) => Boolean(s) && s.toLowerCase() !== brief.title.trim().toLowerCase());
  const rulesAndThresholds = [
    ...new Set([
      ...parsed.flatMap((p) => p.rulesAndThresholds),
      ...brief.constraints.filter((c) => !isDisclaimerOrMetaLine(c)).map((c) => stripMarkdown(c)),
      ...facts.filter((f) => /\b(approv|over\s+\$?\d+|manager|threshold|limit|sla|require|must|exception)\b/i.test(f)),
    ]),
  ];
  const entities = [
    ...new Set([
      ...parsed.flatMap((p) => p.entities),
      ...(brief.title ? [brief.title] : []),
    ]),
  ];
  const systems = [
    ...new Set([
      ...brief.systems.map((s) => s.name),
      ...brief.integrations,
      ...parsed.flatMap((p) => p.systems),
      ...brief.stack,
    ]),
  ];

  return {
    docNames,
    headings,
    facts,
    workflowSteps,
    rulesAndThresholds,
    entities,
    systems,
  };
}

function buildDynamicQuestionForField(
  field: BriefField,
  role: IntakeRole,
  brief: Brief,
  ctx: ExtractedDocContext,
): Variant {
  const hasDocs = ctx.docNames.length > 0;
  const hasSpecificContext =
    hasDocs ||
    brief.problem.trim().length > 0 ||
    brief.summary.trim().length > 0 ||
    brief.assumptions.length > 0 ||
    ctx.systems.length > 0;

  if (!hasSpecificContext) {
    return BANK[field][role] ?? BANK[field].default;
  }

  const docRef = hasDocs
    ? `"${ctx.docNames.slice(0, 2).join(", ")}"`
    : brief.title.trim()
      ? `"${brief.title.trim()}"`
      : "your workflow";
  const sysList = ctx.systems.slice(0, 3).join(", ");
  const primarySys = ctx.systems[0] || "your target systems";
  const primaryEntity = ctx.entities[0] || brief.title || "workflow records";
  const topFact =
    ctx.facts[0] ||
    ctx.workflowSteps[0] ||
    stripMarkdown(brief.problem.split(/[.!?\n]/)[0] ?? "") ||
    "";
  const topRule = ctx.rulesAndThresholds[0] || "";

  const uniqSuggestions = (items: string[], fallback: string[]): string[] => {
    const out: string[] = [];
    for (const item of [...items, ...fallback]) {
      const clean = clipWords(item, 105);
      if (clean && !out.some((x) => x.toLowerCase() === clean.toLowerCase())) {
        out.push(clean);
      }
      if (out.length >= 5) break;
    }
    return out.length >= 2 ? out : fallback.slice(0, 4);
  };

  switch (field) {
    case "problem": {
      const factQuote = topFact ? ` (which mentions "${clipWords(topFact, 75)}")` : "";
      return {
        question: `Based on ${docRef}${factQuote}, which specific workflow bottleneck should the root ADK orchestrator automate first, and what triggers each run?`,
        why: "Defines the root orchestrator's entry trigger (Chat/A2A, Schedule, Eventarc, or Webhook) and primary objective in the Blueprint.",
        suggestions: uniqSuggestions(
          [
            ...ctx.workflowSteps.slice(0, 2).map((s) => `Automate: ${clipWords(s, 80)}`),
            topRule ? `Enforce & route: ${clipWords(topRule, 80)}` : "",
            sysList ? `Eliminate manual lookups/re-keying across ${sysList}` : "",
            `Event-driven run whenever a new ${primaryEntity} arrives`,
          ],
          BANK.problem.default.suggestions,
        ),
      };
    }

    case "inScope": {
      const extractedSteps = [
        ...ctx.workflowSteps.slice(0, 4),
        ...ctx.headings.slice(0, 2),
      ];
      return {
        question: `Which specific steps from ${docRef} should become dedicated specialist agents in your ADK execution pipeline?`,
        why: "Each selected step is synthesized directly as a specialist LlmAgent (or Loop/Parallel stage) on the Blueprint canvas.",
        suggestions: uniqSuggestions(
          [
            ...extractedSteps.map((s) => clipWords(s, 90)),
            sysList ? `Validate & cross-check records in ${sysList}` : "",
            topRule ? `Approval & policy gate: ${clipWords(topRule, 75)}` : "Human-in-the-loop approval & exception routing",
          ],
          BANK.inScope[role]?.suggestions ?? BANK.inScope.default.suggestions,
        ),
        multi: true,
      };
    }

    case "goals": {
      return {
        question: `When the ${brief.title || primaryEntity} agentic workflow finishes a run${sysList ? ` across ${sysList}` : ""}, what structured outputs ({output_key}) and target outcomes must it deliver?`,
        why: "Sets each specialist agent's expectedOutput schema, state handoff keys, and evaluation criteria.",
        suggestions: uniqSuggestions(
          [
            sysList ? `Verified & staged ${primaryEntity} payload for ${primarySys}` : `Structured ${primaryEntity} decision payload`,
            topFact ? `Automate resolution for: ${clipWords(topFact, 75)}` : "",
            topRule ? `100% policy compliance on: ${clipWords(topRule, 70)}` : "",
            "Complete audit trail with source citations and confidence score",
            "Cut manual triage and turnaround time",
          ],
          BANK.goals[role]?.suggestions ?? BANK.goals.default.suggestions,
        ),
        multi: true,
      };
    }

    case "constraints": {
      const ruleClause = topRule
        ? `${docRef} states "${clipWords(topRule, 85)}" — `
        : "";
      return {
        question: `${ruleClause}Which actions or thresholds in this workflow must pause for human confirmation (get_user_choice) or run an iterative validation LoopAgent?`,
        why: "Wires ADK get_user_choice confirmation gates, LoopAgent retry rules, and before_tool_guardrail blocks in the Blueprint.",
        suggestions: uniqSuggestions(
          [
            topRule ? `Human approval gate: ${clipWords(topRule, 85)}` : "",
            sysList ? `Read-only lookups in ${sysList}; human sign-off before any write` : "Human confirmation before any external write",
            "Run a LoopAgent validation retry when fields or totals have variances",
            "Strict citation grounding from uploaded documents only",
          ],
          BANK.constraints.default.suggestions,
        ),
        multi: true,
      };
    }

    case "users": {
      const ownerTeams = brief.systems.map((s) => s.ownerTeam).filter(Boolean).slice(0, 2);
      return {
        question: `Who initiates or reviews the ${brief.title || primaryEntity} workflow from ${docRef}, and how should they interact with the agent?`,
        why: "Configures persona RBAC boundaries, human-in-the-loop approver routing, and Gemini Enterprise / A2A publishing.",
        suggestions: uniqSuggestions(
          [
            `Operations & analysts handling ${primaryEntity}`,
            topRule ? `Approving managers (${clipWords(topRule, 60)})` : "Team leads / approving managers for exceptions",
            ...ownerTeams.map((t) => `Stakeholders in ${t}`),
            "Automated background trigger (Schedule / Eventarc / Webhook)",
          ],
          BANK.users.default.suggestions,
        ),
        multi: true,
      };
    }

    case "integrations": {
      const sysPrompt = sysList
        ? `We detected ${sysList} in ${docRef} — what read/write operations must the ADK connector tools perform against ${sysList}, and are any other systems involved?`
        : `Which enterprise systems, APIs, or queues must the ${brief.title || primaryEntity} specialist agents read from or write to?`;
      return {
        question: sysPrompt,
        why: "Synthesizes typed Python connector tools, Secret Manager bindings, and ParallelAgent lookup stages.",
        suggestions: uniqSuggestions(
          [
            ...ctx.systems.slice(0, 3).map((s) => `${s} (Read-only lookup & validation)`),
            ...ctx.systems.slice(0, 2).map((s) => `${s} (Stage / create records with human approval)`),
            ...ctx.entities.slice(0, 2).map((e) => `Data source for "${e}"`),
          ],
          BANK.integrations.default.suggestions,
        ),
        multi: true,
      };
    }

    case "stack": {
      return {
        question: `For ${docRef}${sysList ? ` (${sysList})` : ""}, which grounding data stores, MCP servers, or Google Cloud runtimes should back the ADK agents?`,
        why: "Configures Vertex AI Search RAG data stores, MCP toolsets, and runtime dependencies in the Blueprint.",
        suggestions: uniqSuggestions(
          [
            hasDocs ? `Vertex AI Search (RAG grounding over ${ctx.docNames[0]})` : "Vertex AI Search (RAG grounding over internal docs)",
            ...ctx.systems.slice(0, 2),
            "Vertex AI Agent Engine (Managed ADK Runtime)",
            "Cloud Run + BigQuery analytical SQL toolset",
            "PostgreSQL / Cloud SQL read-only replica",
          ],
          BANK.stack[role]?.suggestions ?? BANK.stack.default.suggestions,
        ),
        multi: true,
      };
    }

    case "dataCompliance": {
      return {
        question: `What data sensitivity and compliance guardrails apply to the ${primaryEntity} records${sysList ? ` in ${sysList}` : ""} from ${docRef}?`,
        why: "Determines the governance riskTier, PII redaction in before_model_guardrail, and Secret Manager isolation.",
        suggestions: uniqSuggestions(
          [
            ...brief.systems.map((s) => `${s.name}: ${s.dataClassification}`).slice(0, 2),
            `Confidential internal ${primaryEntity} records`,
            "Financial / SOX audit trail & separation of duties",
            "Personal data (PII / GDPR masking before model calls)",
            "Internal operational data only (no PII)",
          ],
          BANK.dataCompliance.default.suggestions,
        ),
        multi: true,
      };
    }

    case "timeline": {
      return {
        question: `What is the target rollout cadence for the ${brief.title || primaryEntity} ADK workflow${topFact ? ` (${clipWords(topFact, 60)})` : ""}?`,
        why: "Shapes the Blueprint milestone phases from local adk web sandbox to production Vertex AI deployment.",
        suggestions: BANK.timeline.default.suggestions,
      };
    }

    case "successMetrics": {
      return {
        question: `How will you evaluate and score the ${brief.title || primaryEntity} agent workflow in \`agents-cli eval\` and production?`,
        why: "Populates the golden evaluation dataset criteria and trajectory metrics in the Blueprint.",
        suggestions: uniqSuggestions(
          [
            topFact ? `Throughput target for: ${clipWords(topFact, 70)}` : "",
            sysList ? `100% tool-call accuracy against ${sysList}` : "",
            topRule ? `Zero bypassed approvals on: ${clipWords(topRule, 65)}` : "",
            "Time saved per request & reduced manual triage",
            "Hallucination-free grounded citations",
          ],
          BANK.successMetrics.default.suggestions,
        ),
        multi: true,
      };
    }

    case "risks": {
      return {
        question: `What edge cases or failure modes in ${docRef}${sysList ? ` or ${sysList}` : ""} must the ADK guardrails and fallback routes handle?`,
        why: "Adds explicit error-handling instructions, escalation routes, and eval test cases to the Blueprint.",
        suggestions: uniqSuggestions(
          [
            sysList ? `${primarySys} API timeout or missing record ID` : "",
            topRule ? `Ambiguous data around "${clipWords(topRule, 60)}"` : "",
            `Incomplete or malformed ${primaryEntity} input`,
            "Service account / Secret Manager provisioning delay",
          ],
          BANK.risks.default.suggestions,
        ),
        multi: true,
      };
    }

    case "outOfScope": {
      return {
        question: `To keep the first ADK workflow release focused on ${docRef}, which actions should remain explicitly out of scope for v1?`,
        why: "Enforces hard boundaries in agent instructions and before_tool_guardrail callbacks.",
        suggestions: uniqSuggestions(
          [
            sysList ? `Unattended destructive writes or deletes in ${sysList}` : "Unattended destructive database writes",
            topRule ? `Auto-approving exceptions (${clipWords(topRule, 60)}) without a human` : "Bypassing human sign-off on high-risk actions",
            "Legacy historical data migration",
            "External customer-facing unauthenticated access",
          ],
          BANK.outOfScope.default.suggestions,
        ),
        multi: true,
      };
    }
  }
}

export function guidedQuestions(
  req: Pick<FollowUpRequest, "role" | "brief" | "asked"> & { materials?: Material[] },
): FollowUpQuestion[] {
  const ctx = buildDocContext(req.brief, req.materials ?? []);
  return missingFields(req.brief)
    .filter((f) => !req.asked.includes(`guided-${f}`))
    .slice(0, PER_ROUND)
    .map((field) => {
      const v = buildDynamicQuestionForField(field, req.role, req.brief, ctx);
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

function isConversationalQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  if (
    /\b(what\s+el[sa]e|mis+ing\s+any\s*thing|are\s+we\s+mis+ing|what\s+is\s+mis+ing|what'?s\s+mis+ing|what\s+do\s+we\s+need|anything\s+el[sa]e|are\s+we\s+ready|is\s+it\s+ready|what'?s\s+next|what\s+next|next\s+steps?|status\s+check|how\s+complete)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /^(what|which|how|who|where|when|why|can\s+you|could\s+you|tell\s+me|explain|show|describe|summarize)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Intelligent context-aware question responder so the Discovery Agent answers
 * readiness checks ("what else do we need / are we missing anything?"), ADK
 * architecture questions, system/credential inquiries, and document Q&A directly
 * even when running in local/guided mode.
 */
function answerDiscoveryQuestion(
  rawQuestion: string,
  brief: Brief,
  materials: Material[],
  adkDraft: AdkProject,
): { brief: Brief; reply: string; isReadinessOrMeta: boolean } {
  const q = rawQuestion.trim();
  const next = structuredClone(brief);
  const score = completeness(next);
  const missing = missingFields(next);

  const isReadinessQuery =
    /\b(what\s+el[sa]e|mis+ing|what\s+do\s+we\s+need|anything\s+el[sa]e|are\s+we\s+ready|is\s+it\s+ready|what'?s\s+next|what\s+next|next\s+steps?|status|complete|left\s+to\s+do|good\s+to\s+go)\b/i.test(
      q,
    );

  const isArchitectureQuery =
    /\b(what\s+agents?|which\s+agents?|how\s+many\s+agents?|what\s+tools?|which\s+tools?|orchestrat|pipeline|topology|adk|blueprint|sequential|parallel|loop|sub[-\s]?agents?)\b/i.test(
      q,
    );

  const isSystemsQuery =
    /\b(how\s+do\s+we\s+connect|connect(?:ion)?s?|credentials?|secrets?|secret\s+manager|env(?:ironment)?\s+var|permissions?|access\s+request)\b/i.test(
      q,
    );

  const specialistAgents = adkDraft.agents.filter(
    (a) => a.name !== adkDraft.rootAgent && a.type === "llm",
  );
  const workflowAgents = adkDraft.agents.filter((a) => a.type !== "llm");
  const sysNames = next.systems.map((s) => s.name);
  const configVars = next.systems.flatMap((s) =>
    s.requiredValues.filter((rv) => !rv.isSecret).map((rv) => rv.name),
  );
  const secretVars = next.systems.flatMap((s) =>
    s.requiredValues.filter((rv) => rv.isSecret).map((rv) => rv.name),
  );

  if (isReadinessQuery) {
    const parts: string[] = [
      `Here is a readiness check for **${next.title || "your ADK Agentic Workflow"}** (**${score}% complete**):`,
      `- **Live ADK Topology (\`${adkDraft.packageName}\`)**: Root orchestrator \`${adkDraft.rootAgent}\`${
        workflowAgents.length
          ? ` with ${workflowAgents.map((w) => `\`${w.name}\` (${w.type})`).join(", ")}`
          : ""
      }, **${specialistAgents.length} specialist agent${specialistAgents.length === 1 ? "" : "s"}** (${specialistAgents
        .map((a) => `\`${a.name}\``)
        .join(", ")}), and **${adkDraft.tools.length} tool${adkDraft.tools.length === 1 ? "" : "s"}** (${adkDraft.tools
        .map((t) => `\`${t.name}\``)
        .join(", ")}).`,
    ];

    if (missing.length === 0) {
      parts.push(
        `- **Discovery Brief**: All 12 discovery dimensions are populated — nothing else is required to generate your kit.`,
      );
    } else {
      parts.push(
        `- **Optional Brief Fields Remaining (${missing.length})**: ${missing
          .map((f) => FIELD_META[f].label)
          .join(", ")}. You can answer them below or proceed right away with enterprise defaults.`,
      );
    }

    if (next.systems.length > 0) {
      parts.push(
        `- **Enterprise Connections (${sysNames.join(", ")})**: Before production deployment, confirm non-secret identifiers (${configVars
          .slice(0, 4)
          .map((v) => `\`${v}\``)
          .join(", ")}) and provision Secret Manager secrets (${secretVars
          .slice(0, 4)
          .map((v) => `\`${v}\``)
          .join(", ")}) with ${[...new Set(next.systems.map((s) => s.ownerTeam))].slice(0, 3).join(", ")}.`,
      );
    }

    parts.push(
      `- **Recommended Next Step**: Click **Open ADK Studio** to inspect or customize the visual agent graph and Python tools, click **Build blueprint** to generate milestones & skills, or continue to **Step 2 (Organisation)** and **Step 3 (Greenfield)**.`,
    );

    return {
      brief: next,
      reply: parts.join("\n"),
      isReadinessOrMeta: true,
    };
  }

  if (isArchitectureQuery) {
    const agentLines = specialistAgents
      .map(
        (a) =>
          `\`${a.name}\` (${a.role || a.description}${a.outputKey ? ` → \`{${a.outputKey}}\`` : ""})`,
      )
      .join(", ");
    const toolLines = adkDraft.tools.map((t) => `\`${t.name}\` (${t.kind})`).join(", ");
    return {
      brief: next,
      reply: [
        `Your live Google ADK package \`${adkDraft.packageName}\` is structured around root coordinator \`${adkDraft.rootAgent}\`:`,
        `- **Workflow Orchestration**: ${
          workflowAgents.length
            ? workflowAgents.map((w) => `\`${w.name}\` (\`${w.type}\` stage)`).join(" → ")
            : "Sequential execution pipeline"
        }`,
        `- **Specialist Agents (${specialistAgents.length})**: ${agentLines}`,
        `- **Governed Tools (${adkDraft.tools.length})**: ${toolLines}`,
        `You can click **Open ADK Studio** on the Blueprint tab at any time to edit prompts, add agents, or inspect the generated \`agent.py\`.`,
      ].join("\n"),
      isReadinessOrMeta: true,
    };
  }

  if (isSystemsQuery && next.systems.length > 0) {
    const sysDetails = next.systems
      .map(
        (s) =>
          `- **${s.name}** (${s.access === "write" ? "Read/Write" : "Read-only"} via ${s.connectionMethod}): config \`${s.requiredValues[0]?.name ?? "ENDPOINT"}\`, secret \`${s.requiredValues[1]?.name ?? "SECRET"}\` in ${s.storageLocation} (Owner: ${s.ownerTeam})`,
      )
      .join("\n");
    return {
      brief: next,
      reply: `Here are the governed system connections and Secret Manager bindings detected for **${next.title || "your workflow"}**:\n${sysDetails}`,
      isReadinessOrMeta: true,
    };
  }

  // Domain / document question: record in openQuestions if it ends with '?'
  if (q.endsWith("?") && !next.openQuestions.includes(q)) {
    next.openQuestions = [...next.openQuestions, q].slice(0, 15);
  }

  // Search uploaded materials and brief for matching context
  const stopWords = new Set([
    "who",
    "what",
    "where",
    "when",
    "why",
    "how",
    "which",
    "does",
    "do",
    "is",
    "are",
    "the",
    "a",
    "an",
    "in",
    "for",
    "of",
    "to",
    "with",
    "on",
    "and",
    "or",
    "should",
    "can",
    "will",
    "this",
    "that",
    "our",
    "we",
  ]);
  const keywords = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  const matchedLines: string[] = [];
  for (const m of materials) {
    const cleanLines = m.text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !isDisclaimerOrMetaLine(l) && !/^#/.test(l))
      .map(stripMarkdown);
    for (const line of cleanLines) {
      const lower = line.toLowerCase();
      if (keywords.length > 0 && keywords.some((kw) => lower.includes(kw))) {
        matchedLines.push(`From "${m.name}": "${clipWords(line, 140)}"`);
        if (matchedLines.length >= 2) break;
      }
    }
  }

  if (matchedLines.length > 0) {
    return {
      brief: next,
      reply: `Based on your uploaded materials — ${matchedLines.join(" · ")}. I've also logged "${q}" in Open Questions so the governance gate (\`get_user_choice\`) and specialist agents enforce it explicitly.`,
      isReadinessOrMeta: false,
    };
  }

  return {
    brief: next,
    reply: `That detail isn't explicitly stated in the uploaded materials yet, so I've logged "${q}" in your Open Questions checklist for stakeholder confirmation and wired a human-in-the-loop confirmation gate (\`get_user_choice\`) in the ADK Blueprint.`,
    isReadinessOrMeta: false,
  };
}

/**
 * Extract structured context from free-form user messages so every chat turn
 * updates both the brief and the synthesized ADK workflow.
 */
function absorbMessage(
  brief: Brief,
  message: string,
  materials: Material[] = [],
): { brief: Brief; note: string; isQuestion?: boolean; isReadinessOrMeta?: boolean } {
  const text = message.trim();
  if (!text) return { brief, note: "" };
  const next = structuredClone(brief);
  if (isConversationalQuestion(text)) {
    const enriched = enrichDiscoveryBriefHeuristics(next);
    const adkDraft = synthesizeAdkFromBrief(enriched);
    const answered = answerDiscoveryQuestion(text, enriched, materials, adkDraft);
    return {
      brief: answered.brief,
      note: answered.reply,
      isQuestion: true,
      isReadinessOrMeta: answered.isReadinessOrMeta,
    };
  }
  if (!next.problem) {
    next.problem = text.slice(0, 2_000);
    if (!next.title) next.title = stripMarkdown(text.split(/[.!?\n]/)[0] ?? "").slice(0, 80);
    return {
      brief: next,
      note: "Thanks, I've captured that as the problem statement and updated your live ADK workflow.",
    };
  }
  if (!next.summary.includes(text)) {
    next.summary = `${next.summary}${next.summary ? "\n" : ""}${text}`.slice(
      0,
      1_200,
    );
  }
  // Also extract actionable workflow steps or rules from the message into assumptions/inScope so the live ADK flow updates immediately
  const clauses = text
    .split(/(?:[.!?\n;]+|\s+(?:->|→|then|and\s+then)\s+)/i)
    .map((c) => stripMarkdown(c.replace(/^(?:[-*•]|\d+[.)])\s+/, "")))
    .filter((c) => c.length >= 8 && c.length <= 180 && !isDisclaimerOrMetaLine(c));
  for (const clause of clauses) {
    if (!next.assumptions.some((a) => a.toLowerCase() === clause.toLowerCase())) {
      next.assumptions = [...next.assumptions, clause].slice(0, 12);
    }
  }
  for (const tech of techMentions(text)) {
    if (!next.stack.includes(tech)) next.stack = [...next.stack, tech].slice(0, 20);
  }
  return { brief: next, note: "Noted, I've folded those workflow details into the brief and synced your ADK Blueprint." };
}

export function guidedFollowUp(req: FollowUpRequest): FollowUpResponse {
  const absorbed = absorbMessage(
    mergeAnswers(req.brief, req.answers),
    req.message,
    req.materials,
  );
  const brief = enrichDiscoveryBriefHeuristics(absorbed.brief);
  const adkDraft = synthesizeAdkFromBrief(brief);
  const questions =
    req.round >= MAX_ROUNDS ? [] : guidedQuestions({ ...req, brief, materials: req.materials });
  const score = completeness(brief);
  const done = questions.length === 0 || score >= 85;
  const hasDocs = req.materials.length > 0;
  const docSummary = hasDocs
    ? `Grounded in ${req.materials.map((m) => `"${m.name}"`).slice(0, 2).join(", ")}`
    : brief.title
      ? `For "${brief.title}"`
      : "To shape your ADK agent workflow";
  const next = done
    ? `The brief is ${score}% complete and synced with your live ADK Blueprint. Build or customize your workflow anytime.`
    : req.round === 0
      ? `${docSummary}: here are targeted questions to configure your specialist agents, tools, and governance gates.`
      : `The brief is ${score}% complete (${docSummary.toLowerCase()}). Here are the next workflow design questions.`;
  const message = absorbed.isReadinessOrMeta
    ? absorbed.note
    : absorbed.note
      ? `${absorbed.note} ${next}`
      : next;
  return {
    brief,
    adkDraft,
    questions: done ? [] : questions,
    message,
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

/** Deep material analysis: extracts document structure, workflow steps, facts, systems, and agentic workflow gaps. */
export function guidedAnalyze(req: AnalyzeRequest): AnalyzeResponse {
  const freshMaterials = req.materials.filter((m) =>
    req.analyze.includes(m.id),
  );
  const parsedList = freshMaterials.map((m) => ({
    material: m,
    parsed: parseMaterialStructure(m),
  }));

  const insights: MaterialInsight[] = parsedList.map(({ material: m, parsed }) => {
    const gaps: string[] = [];
    if (parsed.rulesAndThresholds.length > 0) {
      gaps.push(`Human confirmation gate & routing for: "${clipWords(parsed.rulesAndThresholds[0], 105)}"`);
    }
    const detectedSys = [...parsed.systems, ...techMentions(m.text)].slice(0, 4);
    if (detectedSys.length > 0) {
      gaps.push(`Tool read/write scope and target identifiers for ${detectedSys.join(", ")}`);
    }
    if (parsed.workflowSteps.length > 0 || parsed.facts.length > 0) {
      const sample = clipWords(parsed.workflowSteps[0] || parsed.facts[0], 95);
      gaps.push(`Trigger type (real-time vs. scheduled batch) and exception handling for "${sample}"`);
    }

    return {
      materialId: m.id,
      summary:
        m.kind === "link" || m.kind === "repo"
          ? `Reference to ${m.name}. Its contents aren't read in guided mode.`
          : parsed.firstSentence ||
            `${m.name} (${m.text.length.toLocaleString()} characters)`,
      facts: parsed.facts,
      technologies: techMentions(m.text).slice(0, 12),
      gaps: gaps.slice(0, 3),
    };
  });

  let brief = structuredClone(req.brief);
  for (const tech of insights.flatMap((i) => i.technologies))
    if (!brief.stack.includes(tech)) brief.stack.push(tech);
  brief.stack = brief.stack.slice(0, 20);

  // Extract document title, summary, workflow steps (into assumptions), and detected systems into brief
  for (const { material, parsed } of parsedList) {
    if (!brief.title) {
      const bestTitle = parsed.docTitle || parsed.headings[0];
      const fallbackTitle = parsed.firstSentence
        ? clipWords(parsed.firstSentence.split(/[.!?\n]/)[0] ?? "", 80)
        : material.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
      brief.title = (bestTitle || fallbackTitle).slice(0, 120);
    }

    const docSummaryLines = [
      parsed.firstSentence,
      ...parsed.facts.slice(0, 3),
    ].filter(Boolean);
    if (docSummaryLines.length > 0) {
      const snippet = `${material.name}: ${docSummaryLines.join(" · ")}`;
      if (!brief.summary.includes(snippet)) {
        brief.summary = `${brief.summary ? `${brief.summary}\n` : ""}${snippet}`.slice(0, 1_200);
      }
    }

    for (const step of [...parsed.workflowSteps, ...parsed.facts]) {
      if (!brief.assumptions.some((a) => a.toLowerCase() === step.toLowerCase())) {
        brief.assumptions.push(step);
      }
    }
    brief.assumptions = brief.assumptions.slice(0, 12);

    for (const sysName of parsed.systems) {
      if (!brief.integrations.includes(sysName)) {
        brief.integrations.push(sysName);
      }
    }
  }

  brief.integrations = brief.integrations.slice(0, 12);
  brief = enrichDiscoveryBriefHeuristics(brief);

  const found = [
    ...new Set([
      ...insights.flatMap((i) => i.technologies),
      ...parsedList.flatMap((p) => p.parsed.systems),
    ]),
  ];
  const stepCount = parsedList.reduce((acc, p) => acc + p.parsed.workflowSteps.length, 0);
  return {
    insights,
    brief,
    adkDraft: synthesizeAdkFromBrief(brief),
    message: `Analysed ${insights.length} document${insights.length === 1 ? "" : "s"}${
      found.length ? `, detected ${found.slice(0, 5).join(", ")}` : ""
    }${stepCount > 0 ? `, and mapped ${stepCount} workflow step${stepCount === 1 ? "" : "s"} into your live ADK Blueprint` : ""}.`,
    mode: "guided",
  };
}

/** Guided plan: deterministic blueprint + synthesized Google ADK multi-agent system from the brief. */
export function guidedPlan(
  technologies: string[],
  skills: Plan["skills"],
  brief?: Brief,
): Plan {
  const adk = brief ? synthesizeAdkFromBrief(brief) : null;
  const stageList = adk
    ? adk.agents
        .filter((a) => a.name !== adk.rootAgent && a.type === "llm")
        .map((a) => a.role || a.name)
        .slice(0, 4)
        .join(" → ")
    : "specialist agents";
  return {
    summary: brief?.title
      ? `Synthesized from "${brief.title}": ${adk?.agents.length ?? 0} Google ADK agents (${stageList}) and ${adk?.tools.length ?? 0} governed tools wired to ${brief.integrations.length ? brief.integrations.join(", ") : "Vertex AI"}.`
      : "Generated from your Discovery brief: matched technologies, recommended skills, and a runnable Google ADK multi-agent workflow.",
    projectType: "greenfield",
    technologies,
    milestones: brief
      ? [
          {
            title: `Phase 1 — ${brief.title || "ADK Workflow"} Sandbox & Agent Topology`,
            detail: `Validate ${stageList} locally in adk web against extracted document test cases.`,
          },
          {
            title: `Phase 2 — ${brief.integrations.slice(0, 3).join(", ") || "Enterprise"} Tool Bindings & Eval Gate`,
            detail: "Bind Secret Manager credentials, run agents-cli eval, and verify human-in-the-loop confirmation gates.",
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
    adk,
  };
}
