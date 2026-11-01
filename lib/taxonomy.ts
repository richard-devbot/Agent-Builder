import type { Phase } from "./schema";

export type PhaseMeta = {
  slug: Phase;
  name: string;
  short: string;
  description: string;
};

export const PHASE_META: readonly PhaseMeta[] = [
  {
    slug: "discover",
    name: "Discover",
    short: "Frame the problem",
    description:
      "Requirements, user stories, personas, problem framing, and Jira tickets.",
  },
  {
    slug: "design",
    name: "Design",
    short: "Decide the shape",
    description:
      "Architecture, ADRs, API contracts, data models, and UX direction.",
  },
  {
    slug: "build",
    name: "Build",
    short: "Ship the code",
    description:
      "Frontend, backend, database, integrations, and the day-to-day building.",
  },
  {
    slug: "test",
    name: "Test",
    short: "Catch what matters",
    description:
      "Unit, integration, E2E, code review, performance, and security checks.",
  },
  {
    slug: "deploy",
    name: "Deploy",
    short: "Get it live",
    description:
      "Containerization, CI/CD, infrastructure-as-code, monitoring, and release notes.",
  },
] as const;

export const PHASE_META_BY_SLUG: Record<Phase, PhaseMeta> = PHASE_META.reduce(
  (acc, p) => {
    acc[p.slug] = p;
    return acc;
  },
  {} as Record<Phase, PhaseMeta>,
);

/**
 * Per-phase color tokens — borrowed from the sales_agent / spend_data_agent
 * family palette. Each phase has matching light + dark Tailwind utility
 * classes for chips/badges, plus a single accent hex used in gradients.
 */
export type PhaseColor = {
  /** Solid bg + text for a chip in light/dark */
  chip: string;
  /** Subtle dot color */
  dot: string;
  /** Accent hex used in radial gradients & icon tints (light) */
  accent: string;
  /** Accent hex tuned for dark backgrounds */
  accentDark: string;
};

export const PHASE_COLORS: Record<Phase, PhaseColor> = {
  discover: {
    chip: "bg-sky-100 text-sky-800 ring-sky-200/60 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20",
    dot: "bg-sky-500",
    accent: "#0ea5e9",
    accentDark: "#38bdf8",
  },
  design: {
    chip: "bg-violet-100 text-violet-800 ring-violet-200/60 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20",
    dot: "bg-violet-500",
    accent: "#8b5cf6",
    accentDark: "#a78bfa",
  },
  build: {
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-200/60 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
    dot: "bg-emerald-500",
    accent: "#10b981",
    accentDark: "#34d399",
  },
  test: {
    chip: "bg-amber-100 text-amber-800 ring-amber-200/60 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
    dot: "bg-amber-500",
    accent: "#f59e0b",
    accentDark: "#fbbf24",
  },
  deploy: {
    chip: "bg-rose-100 text-rose-800 ring-rose-200/60 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20",
    dot: "bg-rose-500",
    accent: "#f43f5e",
    accentDark: "#fb7185",
  },
};

export type CategoryMeta = {
  slug: string;
  name: string;
  phase: Phase;
  description: string;
};

const RAW_CATEGORIES: ReadonlyArray<Omit<CategoryMeta, "name">> = [
  // Discover
  { slug: "product-briefs", phase: "discover", description: "PRDs, briefs, and structured problem statements." },
  { slug: "user-stories", phase: "discover", description: "INVEST user stories with Gherkin acceptance criteria." },
  { slug: "personas", phase: "discover", description: "User and buyer personas to ground decisions." },
  { slug: "epic-breakdown", phase: "discover", description: "Decompose epics into stories and slices." },
  { slug: "acceptance-criteria", phase: "discover", description: "Crisp, testable acceptance criteria." },
  { slug: "jira-tickets", phase: "discover", description: "Jira workflows, ticket templates, and MCP setup." },

  // Design
  { slug: "architecture", phase: "design", description: "System and component architecture diagrams and reviews." },
  { slug: "system-design", phase: "design", description: "End-to-end system design exercises and templates." },
  { slug: "adr", phase: "design", description: "Architecture Decision Records — capture the why." },
  { slug: "api-design", phase: "design", description: "REST/GraphQL contracts, OpenAPI, and conventions." },
  { slug: "database-design", phase: "design", description: "Schema design, normalization, and migrations." },
  { slug: "ux-design", phase: "design", description: "UX flows, IA, and copy direction." },
  { slug: "wireframes", phase: "design", description: "Low- and mid-fidelity wireframes from briefs." },
  { slug: "design-systems", phase: "design", description: "Tokens, components, and design system docs." },
  { slug: "accessibility", phase: "design", description: "WCAG audits and accessible-by-default patterns." },
  { slug: "governance", phase: "design", description: "AI governance, persona/RBAC access control, and guardrail policies." },

  // Build
  { slug: "frontend-development", phase: "build", description: "Page scaffolds, components, and frontend patterns." },
  { slug: "backend-development", phase: "build", description: "Server code, services, and backend scaffolds." },
  { slug: "api-development", phase: "build", description: "Endpoint scaffolds, validation, and serialization." },
  { slug: "database-development", phase: "build", description: "Schemas, queries, and migration helpers." },
  { slug: "auth", phase: "build", description: "Login, sessions, RBAC, and identity wiring." },
  { slug: "integrations", phase: "build", description: "Third-party API integrations and webhooks." },
  { slug: "forms", phase: "build", description: "Form schemas, validation, and accessibility." },
  { slug: "state-management", phase: "build", description: "Client and server state patterns." },
  { slug: "secure-coding", phase: "build", description: "Secure-by-default guardrails applied while generating code." },

  // Test
  { slug: "unit-testing", phase: "test", description: "Targeted unit tests with sensible coverage." },
  { slug: "integration-testing", phase: "test", description: "Integration tests across module boundaries." },
  { slug: "e2e-testing", phase: "test", description: "Playwright/Cypress flows for critical paths." },
  { slug: "code-review", phase: "test", description: "Multi-axis code review prompts and checklists." },
  { slug: "performance", phase: "test", description: "Profiling, load tests, and optimization passes." },
  { slug: "security-review", phase: "test", description: "OWASP-aware reviews and secret scanning." },

  // Deploy
  { slug: "dockerization", phase: "deploy", description: "Production-ready Dockerfiles and image hygiene." },
  { slug: "ci-cd", phase: "deploy", description: "Pipelines, gates, and deploy automation." },
  { slug: "infrastructure-as-code", phase: "deploy", description: "Terraform, Pulumi, and cloud provisioning." },
  { slug: "monitoring", phase: "deploy", description: "Logs, metrics, traces, and alert wiring." },
  { slug: "documentation", phase: "deploy", description: "READMEs, runbooks, and onboarding docs." },
  { slug: "release-notes", phase: "deploy", description: "User-facing changelogs and release comms." },
] as const;

function toTitle(slug: string): string {
  return slug
    .split("-")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ");
}

export const CATEGORIES: readonly CategoryMeta[] = RAW_CATEGORIES.map((c) => ({
  ...c,
  name: toTitle(c.slug),
}));

export const CATEGORY_BY_SLUG: Record<string, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.slug] = c;
    return acc;
  },
  {} as Record<string, CategoryMeta>,
);

export function getCategoryName(slug: string): string {
  return CATEGORY_BY_SLUG[slug]?.name ?? toTitle(slug);
}

export function getPhaseForCategory(slug: string): Phase | null {
  return CATEGORY_BY_SLUG[slug]?.phase ?? null;
}
