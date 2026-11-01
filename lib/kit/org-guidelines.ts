/**
 * Organization-wide guidelines for the Kit Builder (wizard step 2).
 *
 * These are company-level policies — branding/voice, compliance, security, and
 * governance guardrails — that apply across every project regardless of stack.
 * They are authored once by an organization and layered on top of the
 * stack-specific rules chosen in step 1.
 *
 * Delivery is deliberately reused: each selected guideline is converted into a
 * governance `RulePack` (see `orgGuidelineRules`) and merged into the normal
 * rule pipeline, so it lands in CLAUDE.md / .github/instructions /
 * .cursor/rules exactly like any other governance rule — no new emission path.
 */

import type { RulePack } from "./rules";

export type OrgGuidelineCategory =
  | "branding"
  | "compliance"
  | "security"
  | "governance";

export type OrgGuideline = {
  id: string;
  name: string;
  category: OrgGuidelineCategory;
  description: string;
  /** Pre-selected when the org-guidelines step is first shown. */
  recommended?: boolean;
  /**
   * Markdown body. The token `{{ORG_NAME}}` is replaced with the organization
   * name entered in the wizard (falls back to "your organization").
   */
  body: string;
};

export const ORG_GUIDELINE_CATEGORY_LABEL: Record<
  OrgGuidelineCategory,
  string
> = {
  branding: "Branding & voice",
  compliance: "Compliance",
  security: "Security policy",
  governance: "Governance guardrails",
};

export const ORG_GUIDELINE_CATEGORY_ORDER: OrgGuidelineCategory[] = [
  "governance",
  "security",
  "compliance",
  "branding",
];

export const ORG_GUIDELINES: readonly OrgGuideline[] = [
  // ── Governance guardrails ──────────────────────────────────────────────
  {
    id: "ai-usage-accountability",
    name: "AI usage & accountability",
    category: "governance",
    description:
      "A named human owns and is accountable for every AI-assisted change; disclose AI use and never bypass a hard guardrail.",
    recommended: true,
    body: `## {{ORG_NAME}} — AI usage & accountability

- Every AI-generated change is owned by a named human author who is
  accountable for it reaching a protected branch. AI assistance never removes
  human accountability.
- Disclose AI-assisted changes in the PR description (what the agent did, what
  the human verified).
- Treat hard guardrails (secrets, protected-branch merges, production/PII data)
  as non-negotiable. Never weaken or bypass a governance check to make progress —
  surface the blocker instead.
- Waivers to a hard guardrail require a named human approver, are time-bound,
  and are logged. An agent may never grant its own waiver.`,
  },
  {
    id: "separation-of-duties",
    name: "Separation of duties",
    category: "governance",
    description:
      "The actor that writes a change never approves it; a human verifies before commit and independent review sits before merge.",
    recommended: true,
    body: `## {{ORG_NAME}} — Separation of duties

- The agent that writes a change never approves it. Generation and validation
  are distinct steps performed by distinct actors.
- A human verifies the change (runs it, exercises new endpoints/tests) before
  it is committed. Do not self-certify and commit.
- Independent review (a validator agent and/or a human reviewer) sits between
  "implemented" and "merged" for every non-trivial change.`,
  },

  // ── Security policy ─────────────────────────────────────────────────────
  {
    id: "security-baseline",
    name: "Security policy baseline",
    category: "security",
    description:
      "No committed secrets, parameterized queries, least privilege, and mandatory secret/dependency scanning before merge (OWASP ASVS).",
    recommended: true,
    body: `## {{ORG_NAME}} — Security policy baseline

- Never commit secrets, tokens, or credentials. Read them from environment
  variables or the organization's secret manager.
- Validate and sanitize all input at system boundaries; use parameterized
  queries. Never build SQL by string concatenation.
- Apply least privilege for every credential, connector, and service account.
  A capability not explicitly granted is denied.
- New and changed code must pass secret scanning and dependency vulnerability
  checks before merge. Do not introduce dependencies with known criticals.
- Follow OWASP ASVS for authentication, session management, and access control.`,
  },
  {
    id: "data-handling-privacy",
    name: "Data handling & privacy",
    category: "security",
    description:
      "No real production/PII data in dev or agent sandboxes; classify data and log actions, not sensitive payloads.",
    body: `## {{ORG_NAME}} — Data handling & privacy

- Never use real production or PII data in development, test, or agent
  sandboxes. Use synthetic or masked data.
- Classify data (public / internal / confidential / restricted) and handle it
  per its classification. Restricted data never leaves approved systems.
- Log actions, not sensitive payloads. Redact secrets and PII from logs and
  error messages.`,
  },

  // ── Compliance ──────────────────────────────────────────────────────────
  {
    id: "compliance-baseline",
    name: "Compliance baseline (SOC 2 / ISO 27001)",
    category: "compliance",
    description:
      "Preserve auditability and change management: traceable changes, reviewed PRs only, and no skipping required checks.",
    body: `## {{ORG_NAME}} — Compliance baseline

- Preserve auditability: every change is traceable to a work item, a human
  author, and a review record. Keep commit and PR history meaningful.
- Enforce change management: no direct pushes to protected branches; all
  changes flow through a reviewed pull request.
- Do not disable, skip, or weaken required checks (tests, security scans,
  review gates) to ship faster.
- Retain evidence (review approvals, gate verdicts) as required by the
  organization's control framework.`,
  },
  {
    id: "gdpr-data-protection",
    name: "GDPR / data protection",
    category: "compliance",
    description:
      "Data minimization, documented lawful basis, data-subject rights, and encryption of personal data in transit and at rest.",
    body: `## {{ORG_NAME}} — GDPR / data protection

- Collect and process only the personal data needed for the stated purpose
  (data minimization). Document the lawful basis for processing.
- Support data-subject rights (access, rectification, erasure) in any feature
  that stores personal data.
- Encrypt personal data in transit and at rest. Restrict access on a
  need-to-know basis.`,
  },

  // ── Branding & voice ────────────────────────────────────────────────────
  {
    id: "brand-voice",
    name: "Company branding & voice",
    category: "branding",
    description:
      "User-facing copy follows the organization voice, approved product names, and the design system rather than ad-hoc styles.",
    body: `## {{ORG_NAME}} — Branding & voice

- User-facing copy (UI text, error messages, docs, emails) follows the
  {{ORG_NAME}} voice: clear, concise, professional, and jargon-light.
- Use the organization's approved product and feature names consistently.
  Do not invent alternate names or abbreviations.
- Respect the design system: use the organization's tokens, components, and
  spacing rather than ad-hoc styles. Match approved color, typography, and
  logo usage.
- Keep terminology consistent with existing product surfaces; when unsure,
  match the wording already shipped in the app.`,
  },
];

export const ORG_GUIDELINE_BY_ID: Record<string, OrgGuideline> =
  ORG_GUIDELINES.reduce(
    (acc, g) => {
      acc[g.id] = g;
      return acc;
    },
    {} as Record<string, OrgGuideline>,
  );

/** Ids recommended (pre-selected) when the step first renders. */
export const RECOMMENDED_ORG_GUIDELINE_IDS: string[] = ORG_GUIDELINES.filter(
  (g) => g.recommended,
).map((g) => g.id);

function applyOrgName(body: string, orgName: string): string {
  const name = orgName.trim() || "your organization";
  return body.replaceAll("{{ORG_NAME}}", name);
}

/**
 * Convert the selected org guidelines into governance `RulePack`s so they flow
 * through the standard per-provider emission. All org guidelines are
 * organization-wide, so they emit as `always` governance rules.
 */
export function orgGuidelineRules(
  selectedIds: Iterable<string>,
  orgName: string,
): RulePack[] {
  const ids = new Set(selectedIds);
  return ORG_GUIDELINES.filter((g) => ids.has(g.id)).map((g) => ({
    id: `org-${g.id}`,
    name: g.name,
    kind: "governance" as const,
    description: g.description,
    appliesTo: ["always"],
    globs: ["**/*"],
    body: applyOrgName(g.body, orgName),
  }));
}
