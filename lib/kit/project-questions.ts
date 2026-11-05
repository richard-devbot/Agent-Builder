/**
 * Conditional project questions for the Kit Builder (wizard step 3).
 *
 * After a stack is chosen in step 1, this module surfaces follow-up questions
 * that depend on that stack — e.g. picking Java reveals "Spring Boot? Spring
 * Data JPA? Hibernate?". The answers are compiled into a single "Project
 * profile" governance rule (see `projectProfileRule`) that is baked into the
 * generated instruction file, so the agent starts every task already knowing
 * the project's concrete shape instead of rediscovering it.
 *
 * This is the fully client-side slice of the "project deep-dive" step. The
 * heavier integrations (upload docs, connect Jira/Azure DevOps, analyze a
 * GitHub repo, AI-author skills) require a backend and are tracked separately
 * as Phase B.
 */

import type { RulePack } from "./rules";
import type { Brief, Material, Plan } from "@/contracts/intake";
import type { AdkProject } from "@/contracts/adk";
import { COMPLIANCE_OPTIONS } from "@/lib/config/public";
import { TECHNOLOGIES } from "./technologies";

export type ProjectQuestionOption = { id: string; label: string };

/** Groups questions into the cards shown on the project step. */
export type ProjectQuestionSection = "starting-point" | "scope" | "codebase" | "migration" | "delivery" | "quality" | "notes";

export const SECTION_LABEL: Record<ProjectQuestionSection, { title: string; blurb: string }> = {
  "starting-point": { title: "Starting point", blurb: "What exists today and what you already have." },
  scope: { title: "Scope & goals", blurb: "What the first release must achieve." },
  codebase: { title: "Codebase today", blurb: "How the existing system is built and maintained." },
  migration: { title: "Migration plan", blurb: "From the legacy system to the target, safely." },
  delivery: { title: "Delivery & operations", blurb: "Where it runs and how it ships." },
  quality: { title: "Quality bar", blurb: "Non-functional priorities the agent must respect." },
  notes: { title: "Anything else", blurb: "Conventions, constraints and domain terms." },
};

export type ProjectQuestion = {
  id: string;
  /**
   * Trigger tokens that make this question appear (any match shows it):
   * technology ids, `type:<project-type>` tokens (see project-types.ts), or
   * ["always"] for questions that apply to every project.
   */
  triggers: string[];
  /** Short label used as the "fact" prefix in the compiled profile. */
  label: string;
  question: string;
  /** Card the question is shown in on the project step (tech questions live on the stack step). */
  section?: ProjectQuestionSection;
  /** Choice options. Omit for a free-text question. */
  options?: ProjectQuestionOption[];
  /** Allow multiple selections (choice questions only). */
  multi?: boolean;
  /** Render choice options as a dropdown instead of chips (single-select). */
  dropdown?: boolean;
  /** Placeholder for free-text questions. */
  placeholder?: string;
};

export const PROJECT_QUESTIONS: readonly ProjectQuestion[] = [
  // ── Greenfield ───────────────────────────────────────────────────────────
  {
    id: "greenfield-inputs",
    triggers: ["type:greenfield"],
    section: "starting-point",
    label: "Available inputs",
    question: "What do you already have for this new project?",
    multi: true,
    options: [
      { id: "requirements-doc", label: "Requirements document" },
      { id: "user-stories", label: "User stories (Jira / Azure DevOps)" },
      { id: "ui-designs", label: "UI designs / mockups" },
      { id: "db-schema", label: "Database schema / data model" },
      { id: "api-contracts", label: "API contracts" },
      { id: "nothing-yet", label: "Nothing yet — starting from an idea" },
    ],
  },
  {
    id: "greenfield-stage",
    triggers: ["type:greenfield"],
    section: "scope",
    label: "Delivery stage",
    question: "What are you building first?",
    options: [
      { id: "poc", label: "Proof of concept (throwaway)" },
      { id: "mvp", label: "MVP for real users" },
      { id: "production", label: "Production system from day one" },
    ],
  },
  {
    id: "greenfield-users",
    triggers: ["type:greenfield"],
    section: "scope",
    label: "Expected users",
    question: "Who will use it, and at what scale?",
    options: [
      { id: "internal-small", label: "Internal team (under 100 users)" },
      { id: "internal-org", label: "Whole organisation" },
      { id: "external-b2b", label: "External business customers" },
      { id: "public", label: "Public / consumer scale" },
    ],
  },
  {
    id: "greenfield-auth",
    triggers: ["type:greenfield"],
    section: "scope",
    label: "Sign-in",
    question: "How will users sign in?",
    options: [
      { id: "sso", label: "Company SSO (Entra ID / Okta)" },
      { id: "social", label: "Email or social login" },
      { id: "api-keys", label: "Machine-to-machine (API keys / OAuth clients)" },
      { id: "none", label: "No sign-in needed" },
    ],
  },
  {
    id: "greenfield-repos",
    triggers: ["type:greenfield"],
    section: "delivery",
    label: "Repository layout",
    question: "How will the code be organized?",
    options: [
      { id: "single-repo", label: "Single repository" },
      { id: "fe-be-repos", label: "Separate frontend & backend repos" },
      { id: "multi-repo", label: "Multiple service repos" },
      { id: "undecided", label: "Not decided yet" },
    ],
  },

  // ── Brownfield ───────────────────────────────────────────────────────────
  {
    id: "brownfield-goal",
    triggers: ["type:brownfield"],
    section: "scope",
    label: "Change goal",
    question: "What do you want to change in the existing system?",
    multi: true,
    options: [
      { id: "new-features", label: "Add new features" },
      { id: "refactor", label: "Refactor for maintainability" },
      { id: "performance", label: "Fix performance problems" },
      { id: "security", label: "Security hardening" },
      { id: "upgrade-deps", label: "Upgrade frameworks / dependencies" },
      { id: "bugs", label: "Reduce bugs and incidents" },
    ],
  },
  {
    id: "brownfield-state",
    triggers: ["type:brownfield"],
    section: "codebase",
    label: "Codebase state",
    question: "What is true of the existing codebase?",
    multi: true,
    options: [
      { id: "good-tests", label: "Solid automated test coverage" },
      { id: "sparse-tests", label: "Sparse or no tests" },
      { id: "good-docs", label: "Up-to-date documentation" },
      { id: "active-team", label: "Actively developed by a team" },
      { id: "maintenance-only", label: "Maintenance mode only" },
    ],
  },
  {
    id: "brownfield-size",
    triggers: ["type:brownfield"],
    section: "codebase",
    label: "Codebase size",
    question: "Roughly how big is it?",
    options: [
      { id: "small", label: "Small (under 20k lines)" },
      { id: "medium", label: "Medium (20k – 200k lines)" },
      { id: "large", label: "Large (over 200k lines)" },
      { id: "unknown", label: "Not sure" },
    ],
  },
  {
    id: "brownfield-hotspots",
    triggers: ["type:brownfield"],
    section: "codebase",
    label: "Fragile areas",
    question: "Which parts are fragile or off-limits for the agent?",
    placeholder: "e.g. billing/ has no tests and handles real money; never change the public /v1 API contract.",
  },
  {
    id: "brownfield-ci",
    triggers: ["type:brownfield"],
    section: "delivery",
    label: "Delivery pipeline",
    question: "How do changes reach production today?",
    options: [
      { id: "full-ci-cd", label: "CI with automated deploys" },
      { id: "ci-manual-deploy", label: "CI builds, manual deploys" },
      { id: "manual", label: "Manual build and release" },
    ],
  },

  // ── Legacy migration ─────────────────────────────────────────────────────
  {
    id: "legacy-source",
    triggers: ["type:legacy-migration"],
    section: "migration",
    label: "Legacy stack",
    question: "What is the legacy system built with?",
    dropdown: true,
    options: [
      { id: "java-monolith", label: "Java monolith (Struts / EJB / JSP on WebLogic or WebSphere)" },
      { id: "dotnet-framework", label: ".NET Framework (WebForms / WCF / VB.NET)" },
      { id: "cobol-mainframe", label: "COBOL / mainframe" },
      { id: "php-monolith", label: "PHP monolith" },
      { id: "vb6-desktop", label: "VB6 / WinForms desktop" },
      { id: "angularjs-frontend", label: "AngularJS / legacy JavaScript frontend" },
      { id: "other-legacy", label: "Other / mixed legacy stack" },
    ],
  },
  {
    id: "legacy-target",
    triggers: ["type:legacy-migration"],
    section: "migration",
    label: "Target stack",
    question: "What are you migrating to?",
    dropdown: true,
    options: [
      { id: "spring-boot-microservices", label: "Spring Boot microservices (Java)" },
      { id: "dotnet-modern", label: ".NET 8 services" },
      { id: "node-services", label: "Node.js services" },
      { id: "react-angular-spa", label: "React / Angular SPA frontend" },
      { id: "cloud-containers", label: "Cloud-native containers (AKS / EKS)" },
      { id: "serverless-target", label: "Serverless (Lambda / Azure Functions)" },
      { id: "other-target", label: "Other / mixed target stack" },
    ],
  },
  {
    id: "legacy-data",
    triggers: ["type:legacy-migration"],
    section: "starting-point",
    label: "Legacy data store",
    question: "Where does the legacy system keep its data?",
    multi: true,
    options: [
      { id: "db2", label: "DB2" },
      { id: "oracle", label: "Oracle" },
      { id: "sql-server", label: "SQL Server" },
      { id: "vsam-files", label: "VSAM / flat files" },
      { id: "access-excel", label: "Access / spreadsheets" },
      { id: "other-db", label: "Other" },
    ],
  },
  {
    id: "legacy-interfaces",
    triggers: ["type:legacy-migration"],
    section: "starting-point",
    label: "Integrations",
    question: "How do other systems talk to it?",
    multi: true,
    options: [
      { id: "batch-files", label: "Nightly batch / file transfers" },
      { id: "mq", label: "Message queues (MQ / JMS)" },
      { id: "soap", label: "SOAP / web services" },
      { id: "direct-db", label: "Direct database access" },
      { id: "screens-only", label: "Users only (screens)" },
    ],
  },
  {
    id: "legacy-knowledge",
    triggers: ["type:legacy-migration"],
    section: "starting-point",
    label: "Business-rule knowledge",
    question: "Where do the business rules live today?",
    multi: true,
    options: [
      { id: "code-only", label: "Only in the code" },
      { id: "docs", label: "Documented (specs / wiki)" },
      { id: "sme", label: "In the heads of a few experts" },
      { id: "tests", label: "Captured in regression tests" },
    ],
  },
  {
    id: "legacy-approach",
    triggers: ["type:legacy-migration"],
    section: "migration",
    label: "Migration approach",
    question: "Which migration approach fits?",
    options: [
      { id: "phased-modules", label: "Phased, module by module" },
      { id: "strangler", label: "Strangler fig (wrap & replace)" },
      { id: "replatform", label: "Re-platform (lift & shift first)" },
      { id: "unsure", label: "Not sure — recommend one" },
    ],
  },
  {
    id: "legacy-coexistence",
    triggers: ["type:legacy-migration"],
    section: "migration",
    label: "Coexistence requirement",
    question: "Must old and new systems run side by side during the migration?",
    options: [
      { id: "parallel-run", label: "Yes — parallel run required" },
      { id: "cutover", label: "No — module-level cutover is fine" },
      { id: "tbd", label: "To be decided" },
    ],
  },
  {
    id: "legacy-downtime",
    triggers: ["type:legacy-migration"],
    section: "migration",
    label: "Cutover window",
    question: "How much downtime can the business accept at cutover?",
    options: [
      { id: "zero", label: "None — must be zero-downtime" },
      { id: "hours", label: "A few hours (e.g. a weekend window)" },
      { id: "day", label: "Up to a day" },
      { id: "tbd", label: "To be decided" },
    ],
  },
  {
    id: "legacy-parity",
    triggers: ["type:legacy-migration"],
    section: "quality",
    label: "Parity evidence",
    question: "How will you prove the new system behaves like the old one?",
    multi: true,
    options: [
      { id: "golden-files", label: "Compare outputs on recorded production data" },
      { id: "parallel-reports", label: "Run both and reconcile reports" },
      { id: "uat", label: "Business user acceptance testing" },
      { id: "regression-suite", label: "Automated regression suite" },
    ],
  },

  // ── Java / Spring ────────────────────────────────────────────────────────
  {
    id: "java-frameworks",
    triggers: ["java", "spring-boot"],
    label: "Backend framework & data access",
    question: "Which Java frameworks does this project use?",
    multi: true,
    options: [
      { id: "spring-boot", label: "Spring Boot" },
      { id: "spring-mvc", label: "Spring MVC" },
      { id: "spring-data-jpa", label: "Spring Data JPA" },
      { id: "hibernate", label: "Hibernate (direct)" },
      { id: "spring-security", label: "Spring Security" },
      { id: "spring-webflux", label: "Spring WebFlux (reactive)" },
    ],
  },
  {
    id: "java-build",
    triggers: ["java", "spring-boot"],
    label: "Build tool",
    question: "Which build tool?",
    options: [
      { id: "maven", label: "Maven" },
      { id: "gradle", label: "Gradle" },
    ],
  },

  // ── Python ───────────────────────────────────────────────────────────────
  {
    id: "python-framework",
    triggers: ["python", "django", "fastapi", "pytest"],
    label: "Python web framework",
    question: "Which Python web framework?",
    options: [
      { id: "django", label: "Django" },
      { id: "fastapi", label: "FastAPI" },
      { id: "flask", label: "Flask" },
      { id: "none", label: "None / library or CLI" },
    ],
  },
  {
    id: "python-orm",
    triggers: ["python", "django", "fastapi"],
    label: "Data layer",
    question: "Which data layer / ORM?",
    options: [
      { id: "django-orm", label: "Django ORM" },
      { id: "sqlalchemy", label: "SQLAlchemy" },
      { id: "tortoise", label: "Tortoise ORM" },
      { id: "raw-sql", label: "Raw SQL" },
    ],
  },

  // ── React / Next.js ──────────────────────────────────────────────────────
  {
    id: "react-framework",
    triggers: ["react", "nextjs"],
    label: "Frontend framework & router",
    question: "How is the frontend structured?",
    options: [
      { id: "next-app", label: "Next.js App Router" },
      { id: "next-pages", label: "Next.js Pages Router" },
      { id: "vite-spa", label: "Vite SPA" },
      { id: "remix", label: "Remix / React Router" },
    ],
  },
  {
    id: "react-state",
    triggers: ["react", "nextjs"],
    label: "State management",
    question: "Primary state management?",
    options: [
      { id: "context", label: "React Context" },
      { id: "redux", label: "Redux Toolkit" },
      { id: "zustand", label: "Zustand" },
      { id: "tanstack-query", label: "TanStack Query" },
      { id: "none", label: "Local state only" },
    ],
  },

  // ── .NET ─────────────────────────────────────────────────────────────────
  {
    id: "dotnet-data",
    triggers: ["csharp", "dotnet"],
    label: "Data access",
    question: "Which .NET data access approach?",
    options: [
      { id: "ef-core", label: "Entity Framework Core" },
      { id: "dapper", label: "Dapper" },
      { id: "petapoco", label: "PetaPoco" },
      { id: "ado-net", label: "ADO.NET" },
    ],
  },

  // ── Node backend ─────────────────────────────────────────────────────────
  {
    id: "node-framework",
    triggers: ["node"],
    label: "Node API framework",
    question: "Which Node.js API framework?",
    options: [
      { id: "express", label: "Express" },
      { id: "nestjs", label: "NestJS" },
      { id: "fastify", label: "Fastify" },
      { id: "hono", label: "Hono" },
    ],
  },

  // ── Applies to every project ─────────────────────────────────────────────
  {
    id: "architecture-style",
    triggers: ["always"],
    section: "delivery",
    label: "Architecture style",
    question: "What is the overall architecture?",
    options: [
      { id: "monolith", label: "Monolith" },
      { id: "modular-monolith", label: "Modular monolith" },
      { id: "microservices", label: "Microservices" },
      { id: "serverless", label: "Serverless" },
    ],
  },
  {
    id: "deploy-target",
    triggers: ["always"],
    section: "delivery",
    label: "Hosting",
    question: "Where will it run?",
    options: [
      { id: "azure", label: "Azure" },
      { id: "aws", label: "AWS" },
      { id: "gcp", label: "Google Cloud" },
      { id: "on-prem", label: "On-premises / private cloud" },
      { id: "undecided", label: "Not decided yet" },
    ],
  },
  {
    id: "environments",
    triggers: ["always"],
    section: "delivery",
    label: "Environments",
    question: "Which environments will you have?",
    multi: true,
    options: [
      { id: "dev", label: "Development" },
      { id: "test", label: "Test / QA" },
      { id: "staging", label: "Staging / pre-prod" },
      { id: "prod", label: "Production" },
    ],
  },
  {
    id: "quality-priorities",
    triggers: ["always"],
    section: "quality",
    label: "Quality priorities",
    question: "Which qualities matter most?",
    multi: true,
    options: [
      { id: "security", label: "Security & privacy" },
      { id: "performance", label: "Performance at scale" },
      { id: "availability", label: "High availability" },
      { id: "accessibility", label: "Accessibility (WCAG)" },
      { id: "i18n", label: "Multiple languages / regions" },
      { id: "auditability", label: "Audit trail & compliance" },
    ],
  },
  {
    id: "compliance-requirements",
    triggers: ["always"],
    section: "quality",
    label: "Compliance frameworks",
    question: "Which compliance or regulatory frameworks apply?",
    multi: true,
    options: [...COMPLIANCE_OPTIONS],
  },
  {
    id: "team-size",
    triggers: ["always"],
    section: "delivery",
    label: "Team size",
    question: "How many developers will work on it?",
    options: [
      { id: "solo", label: "Just me" },
      { id: "small", label: "2–5 developers" },
      { id: "medium", label: "6–15 developers" },
      { id: "large", label: "Several teams" },
    ],
  },
  {
    id: "project-notes",
    triggers: ["always"],
    section: "notes",
    label: "Project-specific notes",
    question:
      "Anything specific the agent must know about this project? (conventions, constraints, domain terms)",
    placeholder:
      "e.g. All money values are stored in minor units; auth is via Keycloak; never touch the legacy /v1 API.",
  },
];

/** True when a question's triggers match the selected tech set. */
function questionApplies(q: ProjectQuestion, tech: Set<string>): boolean {
  return q.triggers.some((t) => t === "always" || tech.has(t));
}

/** Questions relevant to the current technology selection, in catalog order. */
export function relevantQuestions(techIds: Iterable<string>): ProjectQuestion[] {
  const tech = new Set(techIds);
  return PROJECT_QUESTIONS.filter((q) => questionApplies(q, tech));
}

/**
 * True when a question is driven by a technology selection (as opposed to a
 * project-type token or "always"). Tech-driven questions are asked on the
 * stack step, the rest on the project-details step.
 */
export function isTechQuestion(q: ProjectQuestion): boolean {
  return q.triggers.some((t) => t !== "always" && !t.startsWith("type:"));
}

/**
 * Answer shape: keyed by question id.
 *  - choice questions -> array of selected option ids
 *  - free-text questions -> single-element array with the text
 */
export type ProjectAnswers = Record<string, string[]>;

function optionLabels(q: ProjectQuestion, ids: string[]): string[] {
  return ids
    .map((id) => q.options?.find((o) => o.id === id)?.label)
    .filter((l): l is string => Boolean(l));
}

/**
 * Compile the answers (scoped to the questions relevant to `techIds`) into a
 * single "Project profile" governance rule. Returns null when nothing has been
 * answered, so an untouched step adds no file.
 */
export function projectProfileRule(
  techIds: Iterable<string>,
  answers: ProjectAnswers,
  projectName?: string,
): RulePack | null {
  const questions = relevantQuestions(techIds);
  const facts: string[] = [];

  for (const q of questions) {
    const raw = answers[q.id];
    if (!raw || raw.length === 0) continue;

    if (q.options) {
      const labels = optionLabels(q, raw);
      if (labels.length > 0) facts.push(`- **${q.label}:** ${labels.join(", ")}`);
    } else {
      const text = raw[0]?.trim();
      if (text) facts.push(`- **${q.label}:** ${text}`);
    }
  }

  if (facts.length === 0) return null;

  const name = projectName?.trim();
  const heading = name ? `## Project profile — ${name}` : "## Project profile";
  const body = [
    heading,
    "",
    "Known, human-confirmed facts about this specific project. Treat these as",
    "ground truth and align every change with them — do not contradict or",
    "rediscover them.",
    "",
    ...facts,
  ].join("\n");

  return {
    id: "project-profile",
    name: "Project profile",
    kind: "governance",
    description:
      "Human-confirmed specifics of this project (frameworks, data layer, architecture, conventions) baked into the instructions.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body,
  };
}

/**
 * Recommend Step 2 Organisation Guidelines & Engineering Standard Templates
 * directly from the Discovery Brief (`dataCompliance`, `riskTier`, `systems`, `stack`).
 */
export function recommendStandardsFromBrief(brief: Brief): {
  orgGuidelineIds: string[];
  standardTemplateIds: string[];
} {
  const corpus = [
    brief.title,
    brief.summary,
    brief.problem,
    brief.dataCompliance,
    brief.riskReason,
    ...brief.inScope,
    ...brief.constraints,
    ...brief.stack,
    ...brief.integrations,
    ...brief.systems.map((s) => `${s.name} ${s.purpose} ${s.dataClassification}`),
  ].join(" ");

  const orgIds = new Set<string>([
    "secure-coding",
    "ai-usage-disclosure",
    "code-review-bar",
    "testing-pyramid",
    "git-conventions",
    "observability-logging",
    "accessibility-baseline",
    "dependency-hygiene",
    "api-design-contracts",
    "error-handling-resilience",
  ]);

  if (
    brief.riskTier !== "low" ||
    brief.dataCompliance.trim().length > 0 ||
    /\b(pii|gdpr|personal|confidential|privacy|customer|employee|hr|finance|sox|hipaa|pci)\b/i.test(corpus)
  ) {
    orgIds.add("data-handling-privacy");
    orgIds.add("compliance-baseline");
  }
  if (/\b(gdpr|pii|personal\s+data|privacy|eu\b|erasure|consent|dsar)\b/i.test(corpus)) {
    orgIds.add("gdpr-data-protection");
  }

  const stdIds = new Set<string>([
    "std-sdlc-governance",
    "std-security-guardrails",
    "std-observability-slo",
    "std-git-cicd-pr",
    "std-testing-quality",
    "std-design-patterns",
  ]);

  if (
    brief.systems.length > 0 ||
    brief.integrations.length > 0 ||
    /\b(api|webhook|rest|graphql|sap|servicenow|salesforce|sharepoint|workday|jira|postgres)\b/i.test(corpus)
  ) {
    stdIds.add("std-contract-parity-testing");
  }
  if (/\b(bigquery|bq\b|warehouse|analytics|dataset|sql)\b/i.test(corpus)) {
    stdIds.add("std-bigquery-least-privilege");
  }
  if (/\b(java|spring\s+boot|maven|gradle)\b/i.test(corpus)) {
    stdIds.add("std-java-spring");
  }
  if (/\b(react|next\.?js|tailwind|frontend|portal|dashboard|ui)\b/i.test(corpus)) {
    stdIds.add("std-precision-light-tokens");
  }

  return {
    orgGuidelineIds: [...orgIds],
    standardTemplateIds: [...stdIds],
  };
}

/**
 * Deterministically map the Step 1 Discovery Brief, uploaded materials, and
 * Live ADK orchestration into Step 3 `ProjectAnswers` (covering Greenfield,
 * Brownfield, Legacy Migration, tech-specific, and shared architecture/quality questions).
 */
export function mapBriefToProjectAnswers(
  brief: Brief,
  plan?: Plan | null,
  liveAdk?: AdkProject | null,
  materials?: Material[],
): ProjectAnswers {
  const answers: ProjectAnswers = {};
  const corpus = [
    brief.title,
    brief.summary,
    brief.problem,
    ...brief.goals,
    ...brief.users,
    brief.audience,
    ...brief.inScope,
    ...brief.outOfScope,
    ...brief.stack,
    ...brief.integrations,
    brief.dataCompliance,
    ...brief.constraints,
    brief.timeline,
    ...brief.successMetrics,
    ...brief.risks,
    ...brief.assumptions,
    ...brief.systems.map((s) => `${s.name} ${s.purpose} ${s.dataAccessed} ${s.connectionMethod}`),
  ].join(" ");

  // ── 1. Greenfield questions ───────────────────────────────────────────────
  const gfInputs = new Set<string>();
  if ((materials && materials.length > 0) || brief.summary.trim() || brief.problem.trim()) {
    gfInputs.add("requirements-doc");
  }
  if (/\b(figma|wireframe|mockup|screen\s+design|ui\s+design)\b/i.test(corpus)) {
    gfInputs.add("ui-designs");
  }
  if (
    brief.systems.length > 0 ||
    brief.integrations.length > 0 ||
    /\b(api|openapi|swagger|webhook|endpoint|connector|rest|graphql)\b/i.test(corpus)
  ) {
    gfInputs.add("api-contracts");
  }
  if (/\b(schema|table|postgres|sql|bigquery|database|record|invoice|po\b|ticket|list|field)\b/i.test(corpus)) {
    gfInputs.add("db-schema");
  }
  if (brief.inScope.length > 0 || brief.goals.length > 0) {
    gfInputs.add("user-stories");
  }
  if (gfInputs.size === 0) gfInputs.add("requirements-doc");
  answers["greenfield-inputs"] = [...gfInputs];

  if (/\b(poc|proof\s+of\s+concept|prototype|spike|experiment|sandbox\s+pilot)\b/i.test(corpus)) {
    answers["greenfield-stage"] = ["poc"];
  } else if (
    brief.riskTier === "high" ||
    /\b(production[-\s]ready|enterprise[-\s]wide|whole\s+company|mission[-\s]critical|sox|hipaa|pci)\b/i.test(corpus)
  ) {
    answers["greenfield-stage"] = ["production"];
  } else {
    answers["greenfield-stage"] = ["mvp"];
  }

  const userCorpus = `${brief.audience} ${brief.users.join(" ")}`;
  if (/\b(public|consumer|b2c|open\s+web)\b/i.test(userCorpus)) {
    answers["greenfield-users"] = ["public"];
  } else if (/\b(b2b|partner|client|external\s+customer|external\s+user)\b/i.test(userCorpus)) {
    answers["greenfield-users"] = ["external-b2b"];
  } else if (
    /\b(whole\s+company|department|organisation|organization|enterprise|all\s+employees|cross[-\s]team|managers)\b/i.test(
      userCorpus,
    )
  ) {
    answers["greenfield-users"] = ["internal-org"];
  } else {
    answers["greenfield-users"] = ["internal-small"];
  }

  const triggerKind = liveAdk?.trigger?.kind ?? "chat_a2a";
  if (triggerKind !== "chat_a2a" && /\b(webhook|api[-\s]key|service[-\s]to[-\s]service|batch|cron|pubsub|eventarc)\b/i.test(corpus)) {
    answers["greenfield-auth"] = ["api-keys"];
  } else if (/\b(oauth|social\s+login)\b/i.test(corpus) && !/\b(entra|sso|corporate)\b/i.test(corpus)) {
    answers["greenfield-auth"] = ["social"];
  } else {
    answers["greenfield-auth"] = ["sso"];
  }

  if (/\b(separate\s+frontend|fe[-\s]be)\b/i.test(corpus)) {
    answers["greenfield-repos"] = ["fe-be-repos"];
  } else if (/\b(multi[-\s]repo|separate\s+repos|multiple\s+service\s+repos)\b/i.test(corpus)) {
    answers["greenfield-repos"] = ["multi-repo"];
  } else {
    answers["greenfield-repos"] = ["single-repo"];
  }

  // ── 2. Brownfield questions ───────────────────────────────────────────────
  const bfGoals = new Set<string>(["new-features"]);
  if (/\b(refactor|untangle|clean\s+up)\b/i.test(corpus)) bfGoals.add("refactor");
  if (/\b(outage|bug|incident\s+fix|triage)\b/i.test(corpus)) bfGoals.add("bugs");
  if (/\b(scale|throughput|latency|performance)\b/i.test(corpus)) bfGoals.add("performance");
  if (brief.riskTier !== "low" || /\b(security|compliance|sox|gdpr|pii)\b/i.test(corpus)) bfGoals.add("security");
  answers["brownfield-goal"] = [...bfGoals];
  answers["brownfield-state"] = ["active-team", "good-docs"];
  answers["brownfield-size"] = ["medium"];
  const hotspotItems = [...brief.constraints, ...brief.outOfScope].filter(Boolean).slice(0, 3);
  if (hotspotItems.length > 0) {
    answers["brownfield-hotspots"] = [hotspotItems.join("; ")];
  }
  answers["brownfield-ci"] = ["full-ci-cd"];

  // ── 3. Legacy migration questions ─────────────────────────────────────────
  if (/\b(\.net\s+framework|wcf|webforms|vb\.net)\b/i.test(corpus)) {
    answers["legacy-source"] = ["dotnet-framework"];
  } else if (/\b(cobol|mainframe)\b/i.test(corpus)) {
    answers["legacy-source"] = ["cobol-mainframe"];
  } else if (/\b(java\s+ee|weblogic|websphere|jboss|struts|ejb)\b/i.test(corpus)) {
    answers["legacy-source"] = ["java-monolith"];
  } else {
    answers["legacy-source"] = ["other-legacy"];
  }

  if (/\b(spring\s+boot|java)\b/i.test(corpus)) {
    answers["legacy-target"] = ["spring-boot-microservices"];
  } else if (/\b(serverless|cloud\s+run|agent\s+engine)\b/i.test(corpus)) {
    answers["legacy-target"] = ["serverless-target"];
  } else {
    answers["legacy-target"] = ["cloud-containers"];
  }
  answers["legacy-data"] = ["other-db"];
  answers["legacy-interfaces"] = ["soap", "batch-files"];
  answers["legacy-knowledge"] = materials && materials.length > 0 ? ["docs", "sme"] : ["sme"];
  answers["legacy-approach"] = ["strangler"];
  answers["legacy-coexistence"] = ["parallel-run"];
  answers["legacy-downtime"] = ["zero"];
  answers["legacy-parity"] = ["golden-files", "regression-suite"];

  // ── 4. Tech-specific questions (Python / ADK / React / Java / Node) ───────
  answers["python-framework"] = ["fastapi"];
  answers["python-orm"] = /\b(postgres|sqlalchemy|database|sql)\b/i.test(corpus)
    ? ["sqlalchemy"]
    : ["raw-sql"];
  answers["react-framework"] = ["next-app"];
  answers["react-state"] = ["tanstack-query"];
  answers["node-framework"] = ["fastify"];

  // ── 5. Shared Architecture, Deployment, Quality & Compliance ──────────────
  if (/\b(microservice|multi[-\s]service)\b/i.test(corpus)) {
    answers["architecture-style"] = ["microservices"];
  } else if (
    ["pubsub", "eventarc", "webhook"].includes(triggerKind) ||
    /\b(serverless|cloud\s+run|agent\s+engine|vertex\s+ai)\b/i.test(corpus)
  ) {
    answers["architecture-style"] = ["serverless"];
  } else {
    answers["architecture-style"] = ["modular-monolith"];
  }

  answers["deploy-target"] = ["gcp"];
  answers["environments"] = ["dev", "test", "staging", "prod"];

  const qualities = new Set<string>(["security", "auditability"]);
  if (/\b(fast|latency|volume|throughput|400|week|daily|sla|minutes|seconds)\b/i.test(corpus)) {
    qualities.add("performance");
  }
  if (brief.riskTier === "high" || /\b(retry|loop|reconcil|availability|24\/7|resilien)\b/i.test(corpus)) {
    qualities.add("availability");
  }
  answers["quality-priorities"] = [...qualities].slice(0, 3);

  const complianceCorpus = `${brief.dataCompliance} ${brief.constraints.join(" ")} ${brief.riskReason}`;
  const validComplianceIds = new Set(COMPLIANCE_OPTIONS.map((c) => c.id));
  const matchedCompliance = new Set<string>();
  if (/\b(gdpr|pii|personal\s+data|privacy|eu\b)\b/i.test(complianceCorpus) && validComplianceIds.has("gdpr")) {
    matchedCompliance.add("gdpr");
  }
  if (
    (/\b(soc\s*2|sox|iso\s*27001|financial|audit\s+trail|confidential|approval|manager)\b/i.test(complianceCorpus) ||
      brief.riskTier !== "low") &&
    validComplianceIds.has("soc2")
  ) {
    matchedCompliance.add("soc2");
  }
  if (/\b(hipaa|phi|health|patient|medical)\b/i.test(complianceCorpus) && validComplianceIds.has("hipaa")) {
    matchedCompliance.add("hipaa");
  }
  if (/\b(pci|cardholder|payment\s+card)\b/i.test(complianceCorpus) && validComplianceIds.has("pci")) {
    matchedCompliance.add("pci");
  }
  if (/\b(fedramp|federal|government)\b/i.test(complianceCorpus) && validComplianceIds.has("fedramp")) {
    matchedCompliance.add("fedramp");
  }
  if (matchedCompliance.size === 0 && validComplianceIds.has("internal-only")) {
    matchedCompliance.add("internal-only");
  }
  answers["compliance-requirements"] = [...matchedCompliance];

  if (/\b(just\s+me|solo|individual)\b/i.test(userCorpus)) {
    answers["team-size"] = ["solo"];
  } else if (/\b(whole\s+company|enterprise|organisation|organization)\b/i.test(userCorpus)) {
    answers["team-size"] = ["large"];
  } else if (/\b(department|cross[-\s]team|multiple\s+teams)\b/i.test(userCorpus) || brief.systems.length >= 2) {
    answers["team-size"] = ["medium"];
  } else {
    answers["team-size"] = ["small"];
  }

  // Synthesize rich ground-truth project notes from Discovery Brief + ADK Topology
  const noteParts: string[] = [];
  if (brief.title.trim()) {
    noteParts.push(`Workflow Title: ${brief.title.trim()}`);
  }
  if (brief.problem.trim()) {
    noteParts.push(`Problem & Objective: ${brief.problem.trim()}`);
  }
  if (brief.inScope.length > 0) {
    noteParts.push(`Scoped Workflow Stages: ${brief.inScope.join(" -> ")}`);
  }
  if (liveAdk && liveAdk.agents.length > 0) {
    const agentSummary = liveAdk.agents
      .map((a) => `${a.name} (${a.type}${a.outputKey ? ` -> {${a.outputKey}}` : ""})`)
      .join(", ");
    noteParts.push(`Google ADK Agent Topology (root: ${liveAdk.rootAgent}, trigger: ${triggerKind}): ${agentSummary}`);
  }
  if (brief.systems.length > 0) {
    const sysSummary = brief.systems
      .map((s) => `${s.name} [${s.access.toUpperCase()} via ${s.connectionMethod}]`)
      .join("; ");
    noteParts.push(`Enterprise Systems & Access: ${sysSummary}`);
  } else if (brief.integrations.length > 0) {
    noteParts.push(`Integrations: ${brief.integrations.join(", ")}`);
  }
  if (brief.constraints.length > 0) {
    noteParts.push(`Governance & Approval Gates: ${brief.constraints.join("; ")}`);
  }
  if (brief.dataCompliance.trim()) {
    noteParts.push(`Data Sensitivity & Compliance: ${brief.dataCompliance.trim()} (Risk Tier: ${brief.riskTier})`);
  }
  if (brief.successMetrics.length > 0) {
    noteParts.push(`Success & Eval Criteria: ${brief.successMetrics.join("; ")}`);
  }
  if (plan?.summary) {
    noteParts.push(`Blueprint Summary: ${plan.summary}`);
  }
  if (noteParts.length > 0) {
    answers["project-notes"] = [noteParts.join("\n")];
  }

  return answers;
}

/**
 * Infer Step 5 `deployTarget` (`agent_engine` | `cloud_run` | `gemini_enterprise`)
 * from the Discovery Brief and Live ADK trigger configuration.
 */
export function inferDeployTargetFromBrief(
  brief: Brief,
  liveAdk?: AdkProject | null,
): "agent_engine" | "cloud_run" | "gemini_enterprise" {
  const corpus = [
    brief.title,
    brief.summary,
    brief.problem,
    ...brief.users,
    brief.audience,
    ...brief.inScope,
    ...brief.stack,
    ...brief.goals,
  ].join(" ");

  if (/\b(gemini\s+enterprise|agentspace|workspace\s+assistant|company[-\s]wide\s+assistant|register\s+in\s+gemini)\b/i.test(corpus)) {
    return "gemini_enterprise";
  }
  if (
    liveAdk?.trigger?.kind === "webhook" ||
    /\b(cloud\s+run|custom\s+fastapi|webhook\s+endpoint|custom\s+container|dockerfile)\b/i.test(corpus)
  ) {
    return "cloud_run";
  }
  return "agent_engine";
}

/**
 * Match Step 4 MCP server slugs (`jira-mcp`, `confluence-mcp`, `postgres-mcp`,
 * `github-mcp`, `azure-devops-mcp`, `figma-mcp`, `playwright-mcp`, `filesystem-mcp`)
 * from the Discovery Brief and ADK tools.
 */
export function matchMcpServersFromBrief(
  brief: Brief,
  liveAdk?: AdkProject | null,
): string[] {
  const corpus = [
    brief.title,
    brief.summary,
    brief.problem,
    ...brief.inScope,
    ...brief.stack,
    ...brief.integrations,
    ...brief.systems.map((s) => `${s.name} ${s.purpose}`),
    ...(liveAdk?.tools.map((t) => `${t.name} ${t.connectorSystem ?? ""} ${t.description}`) ?? []),
  ].join(" ");

  const matched = new Set<string>(["filesystem-mcp"]);
  if (/\b(jira|atlassian|sprint|ticket|issue\s+tracking)\b/i.test(corpus)) matched.add("jira-mcp");
  if (/\b(confluence|wiki|runbook|sop|knowledge\s+base|sharepoint|policy\s+doc)\b/i.test(corpus)) {
    matched.add("confluence-mcp");
  }
  if (/\b(postgres|postgresql|sql|database|bigquery|sap|erp|ledger|table|schema)\b/i.test(corpus)) {
    matched.add("postgres-mcp");
  }
  if (/\b(github|git\b|pull\s+request|repository)\b/i.test(corpus)) {
    matched.add("github-mcp");
  }
  if (/\b(azure\s+devops|ado\b|work\s+item|azure\s+boards)\b/i.test(corpus)) {
    matched.add("azure-devops-mcp");
  }
  if (/\b(figma|design\s+system|ui\s+mock)\b/i.test(corpus)) {
    matched.add("figma-mcp");
  }
  if (/\b(playwright|browser|e2e|portal\s+ui|web\s+scraping)\b/i.test(corpus)) {
    matched.add("playwright-mcp");
  }
  return [...matched];
}

/**
 * Infer Step 4 technology IDs from the Discovery Brief, Plan, and ADK selection.
 */
export function inferTechnologiesFromBrief(
  brief: Brief,
  plan?: Plan | null,
  includeAdk = true,
): string[] {
  const ids = new Set<string>(plan?.technologies ?? []);
  if (includeAdk) ids.add("python");

  const corpus = ` ${[
    ...brief.stack,
    ...brief.integrations,
    ...brief.systems.map((s) => s.name),
    brief.title,
    brief.problem,
    brief.summary,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")} `;

  for (const t of TECHNOLOGIES) {
    const names = [t.id, t.label, ...(t.aliases ?? [])];
    if (names.some((n) => n.length > 1 && corpus.includes(` ${n.toLowerCase()} `))) {
      ids.add(t.id);
    }
  }
  if (/\b(postgres|postgresql|sql|database)\b/i.test(corpus)) {
    ids.add("postgresql");
  }
  return [...ids];
}
