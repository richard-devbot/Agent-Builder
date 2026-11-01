/**
 * Project types for the Kit Builder wizard — Greenfield, Brownfield, and
 * Legacy migration.
 *
 * The selected type reshapes the kit in three ways, all of them *scaffolding
 * only* (the kit equips the developer's own IDE agent; it never implements or
 * migrates anything itself):
 *
 *   1. Type-specific follow-up questions on the project-details step
 *      (see project-questions.ts — triggers of the form `type:<id>`).
 *   2. A governance rule telling the agent how work starts for this kind of
 *      project (`projectTypeRule`).
 *   3. A starter playbook skill with the prompts/checklists the developer
 *      runs in their own tool (`projectTypeSkills`).
 *
 * Delivery reuses the existing pipelines: the rule flows through the normal
 * RulePack emission and the playbook through the normal KitSkill emission,
 * so all three providers are covered with no new emission code.
 */

import type { RulePack } from "./rules";
import type { KitSkill } from "./skills";

export type ProjectType = "greenfield" | "brownfield" | "legacy-migration";

export const PROJECT_TYPES: readonly {
  id: ProjectType;
  label: string;
  blurb: string;
}[] = [
  {
    id: "greenfield",
    label: "Greenfield",
    blurb: "A new project — start from requirements and user stories.",
  },
  {
    id: "brownfield",
    label: "Brownfield",
    blurb: "An existing codebase — discovery builds the project context first.",
  },
  {
    id: "legacy-migration",
    label: "Legacy migration",
    blurb: "Modernize a legacy system — inventory, plan, migrate in phases.",
  },
] as const;

/** Trigger token used by project-questions.ts (`type:<id>`). */
export function projectTypeTrigger(type: ProjectType): string {
  return `type:${type}`;
}

// ── Operating-guidance rules (one per type) ────────────────────────────────

const TYPE_RULES: Record<ProjectType, RulePack> = {
  greenfield: {
    id: "project-type-greenfield",
    name: "Project type: Greenfield",
    kind: "governance",
    description:
      "How work starts on a new project: requirements → user stories → plan → build via the operating loop.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Project type — Greenfield

This is a **new project**. There is little or no existing code to learn from,
so the requirements and user stories are the ground truth.

- Start from the **greenfield-starter** playbook skill: capture requirements,
  break them into user stories, and confirm the story list with the human
  before writing any code.
- Ask early about the intended repo layout (single repo vs. separate
  frontend/backend repos) and any existing inputs — UI designs, database
  schema, API contracts — and record them in the plan.
- Establish conventions first (project structure, lint/format, test setup,
  CI) so every later story lands on rails.
- Implement **one story at a time** through the operating procedure: plan the
  story, build it, stop at the human verification checkpoint, then commit.`,
  },
  brownfield: {
    id: "project-type-brownfield",
    name: "Project type: Brownfield",
    kind: "governance",
    description:
      "How work starts on an existing codebase: discovery first, then respect what exists.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Project type — Brownfield

This kit is installed into an **existing codebase**. The code that is already
here is the ground truth — learn it before changing it.

- Before the first task, run the **Discovery Agent** to analyze the repo and
  produce the project context document. Do not start coding from assumptions.
- Follow the codebase's existing conventions (structure, naming, patterns,
  libraries) even where they differ from your defaults. Consistency beats
  personal preference.
- Prefer the smallest change that achieves the task. Do not refactor
  surrounding code unless the task calls for it.
- When existing behavior is unclear, read the code and tests first; ask the
  human only when the code cannot answer the question.`,
  },
  "legacy-migration": {
    id: "project-type-legacy",
    name: "Project type: Legacy migration",
    kind: "governance",
    description:
      "How a legacy modernization runs: inventory first, then a phased module-by-module migration plan — never a big-bang rewrite.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Project type — Legacy migration

This engagement **modernizes a legacy system**. Nothing is migrated until the
system is inventoried and a phased plan is agreed with the human.

- Follow the **legacy-migration-playbook** skill: run the inventory prompts
  against the legacy code, then plan, then migrate — in that order.
- Migrate in **phases, module by module** (staggered/strangler pattern). A
  big-bang rewrite is out of bounds unless the human explicitly directs it.
- Every phase ends at a human verification checkpoint: the old and new
  behavior are compared and confirmed before the next phase begins.
- Never delete or disable legacy code paths until their replacement is
  verified in use. Keep a rollback path for every phase.`,
  },
};

/** The operating-guidance rule for the selected type (null when none chosen). */
export function projectTypeRule(type: ProjectType | null): RulePack | null {
  return type ? TYPE_RULES[type] : null;
}

// ── Starter playbook skills (one per type) ─────────────────────────────────

const GREENFIELD_PLAYBOOK: KitSkill = {
  slug: "type:greenfield-starter",
  name: "Greenfield starter playbook",
  skillName: "greenfield-starter",
  description:
    "Turns raw requirements into confirmed user stories and a story-by-story build plan for a brand-new project.",
  recommendedFor: ["always"],
  group: "Discover & plan",
  body: `# Greenfield starter playbook

Use this skill at the very start of a new project, before any code exists.
It converts requirements into a confirmed backlog and a build order. You
facilitate and draft — the human confirms every artifact.

## Step 1 — Capture the inputs

Ask the human for whatever already exists, and record the answers in
\`.agent/plan.md\`:

- The requirements (a document, a paragraph, or a conversation — capture it).
- Existing user stories, if any (Jira/Azure DevOps export, spreadsheet, prose).
- Repo layout: single repo, or separate frontend / backend repos? Which repo
  is this kit installed in?
- Any existing design inputs: UI mockups, database schema, API contracts,
  architecture diagrams.

## Step 2 — Draft user stories

From the requirements, draft user stories in the form:

> As a <role>, I want <capability>, so that <benefit>.

For each story add acceptance criteria (Given/When/Then). Group stories into
milestones. **Stop and have the human review the story list before going
further** — do not invent scope.

## Step 3 — Establish the foundations

Before the first story, set up the rails every story will run on:

- Project scaffold matching the chosen stack and repo layout.
- Lint, format, and test tooling wired into a single command each.
- CI running lint + tests on every push.
- The conventions the team confirmed (structure, naming, error handling).

## Step 4 — Build story by story

Implement exactly **one story at a time** using the operating procedure in
your instructions: plan the story → build it → stop at the human
verification checkpoint → commit on confirmation → next story. Keep
\`.agent/plan.md\` updated so anyone can see what is done and what is next.
`,
};

const BROWNFIELD_PLAYBOOK: KitSkill = {
  slug: "type:brownfield-onboarding",
  name: "Brownfield onboarding playbook",
  skillName: "brownfield-onboarding",
  description:
    "Bootstraps the agent into an existing codebase: discovery first, project context second, code changes last.",
  recommendedFor: ["always"],
  group: "Discover & plan",
  body: `# Brownfield onboarding playbook

Use this skill when this kit has just been installed into an existing
codebase, before the first task.

## Step 1 — Run discovery

Dispatch the **Discovery Agent** to analyze the repository (read-only) and
produce the project context document. It should capture:

- Languages, frameworks, and versions actually in use.
- The module/package layout and what each area owns.
- Build, test, and run commands that actually work.
- Conventions observed in the code (naming, error handling, test style).
- Known hot spots: large files, low-coverage areas, TODO clusters.

## Step 2 — Confirm the context with the human

Show the human the generated context and ask what discovery cannot see:
deploy process, environments, team conventions not visible in code, areas
that are off-limits. Record the answers in the context document.

## Step 3 — Work within what exists

- Match the codebase's existing patterns; do not import your own defaults.
- Smallest change that achieves the task — no drive-by refactors.
- Before changing shared code, find its callers and note the blast radius in
  your plan.
- Add or extend tests in the project's existing test style.
`,
};

const LEGACY_PLAYBOOK: KitSkill = {
  slug: "type:legacy-migration-playbook",
  name: "Legacy migration playbook",
  skillName: "legacy-migration-playbook",
  description:
    "Phased legacy modernization: inventory prompts to run against the old code, the questions to answer, and a module-by-module migration plan template.",
  recommendedFor: ["always"],
  group: "Discover & plan",
  body: `# Legacy migration playbook

Use this skill for a legacy modernization. The order is fixed:
**inventory → questions → phased plan → migrate one module at a time.**
Nothing is migrated before the plan is confirmed by the human.

## Phase 0 — Inventory the legacy system

Run these prompts against the legacy codebase (read-only) and save each
result under \`.agent/inventory/\`:

1. **Module inventory** — "List every module/component in this codebase with
   its purpose, entry points, and approximate size. Flag dead or unreachable
   code." → \`modules.md\`
2. **Dependency map** — "Map the dependencies between modules and on external
   systems (databases, queues, APIs, file shares). Identify the most-depended-
   upon modules." → \`dependencies.md\`
3. **Technology census** — "List every language, framework, and library
   version in use, flagging anything end-of-life or unsupported."
   → \`tech-census.md\`
4. **Data inventory** — "Describe every datastore: schemas, ownership, which
   modules read/write each, and any shared-database coupling." → \`data.md\`
5. **Risk register** — "Identify the riskiest areas to change: no tests,
   heavy coupling, unclear ownership, embedded business rules." → \`risks.md\`

## Phase 1 — Answer the migration questions

With the inventory in hand, confirm with the human:

- **Target stack:** what are we migrating *to*, and why that choice?
- **Scope:** full modernization, or specific modules only?
- **Constraints:** hard deadlines, freeze windows, compliance requirements,
  teams that must not be disrupted.
- **Coexistence:** must old and new run side by side during the migration?
  For how long?
- **Success criteria:** how do we know a migrated module is done?

## Phase 2 — Build the phased plan

Draft \`.agent/migration-plan.md\` — one phase per module or module group,
ordered by dependency (leaf modules first) and risk (lower risk earlier to
build confidence). For each phase record:

- Modules in scope, and their inventory references.
- Approach: rewrite, re-platform, or wrap (strangler interface).
- Verification: how old vs. new behavior is compared (tests, parallel run,
  shadow traffic).
- Rollback: how this phase is undone if verification fails.

**Stop and have the human approve the plan before Phase 3.**

## Phase 3 — Migrate phase by phase

For each phase, follow the operating procedure: plan → migrate the module →
stop at the human verification checkpoint (old vs. new compared) → commit on
confirmation → update the plan → next phase. Never disable a legacy path
until its replacement is verified, and never merge a phase that leaves the
system in a mixed, unreleasable state.
`,
};

const TYPE_SKILLS: Record<ProjectType, KitSkill[]> = {
  greenfield: [GREENFIELD_PLAYBOOK],
  brownfield: [BROWNFIELD_PLAYBOOK],
  "legacy-migration": [LEGACY_PLAYBOOK],
};

/** Starter playbook skills for the selected type (empty when none chosen). */
export function projectTypeSkills(type: ProjectType | null): KitSkill[] {
  return type ? TYPE_SKILLS[type] : [];
}
