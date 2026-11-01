# Enhancement Plan — Org Engineering-Governance & Agent-Guardrail System

> Status: proposal + partial build. Author: AI Migration review. Date: 2026-06-09.
> Goal: use the Playbook **across the organization** to (a) **govern developers** with one set of engineering standards and (b) **guardrail AI agents** (Claude Code, Cursor, GitHub Copilot) so they follow those standards automatically.
> Scope: coding standards, unit-test coverage, API guidelines, Java security, SOLID/design principles, design patterns, React branding, structured logging, exception handling, Figma→React.

## 1. Summary

The requested topics are not a browse-and-copy nicety — they are the **standards layer that governs every repo and every agent in the org**. The Playbook already has the exact machinery for this; we are turning it into a governance system rather than adding a new subsystem. Three surfaces:

1. **Kit Builder rule packs** (`lib/kit/rules.ts`) — the standards, compiled per agent into `CLAUDE.md`, `.cursor/rules/*.mdc`, and Copilot `*.instructions.md`. **This is the guardrail engine.**
2. **Guardrail skills** (`content/skills/`) — soft (steer while coding) and hard (block at the gate) enforcement; `secure-coding-guardrails-skill` and `pr-governance-gate-skill` already exist as the model.
3. **`content/` MDX templates** — the human-readable standards contract developers are governed by (the "law" behind the rules).

Most topics are **dual-purpose**: a template (the contract humans read) **plus** a rule pack (the version agents obey). Generators/enforcers (figma-to-react, coverage gate, standards guardrail) are skills.

**Built in this pass:** the 6 governance rule packs in `lib/kit/rules.ts` (see §6) — typechecked, no duplicate ids. Zero new dependencies, no schema changes; stays static-first per `CLAUDE.md`.

## 2. Mapping topics → assets

| Requested topic | New asset(s) | Type | Phase / Category | Kit rule pack |
|---|---|---|---|---|
| Coding standards (general) | `coding-standards-baseline` | template | build / `coding-standards` | extends existing `engineering-baseline` |
| Code standards (Java) | `java-coding-standards` | template | build / `coding-standards` | extends existing `java` stack rule |
| Code standards (React/TS) | `typescript-react-coding-standards` | template | build / `coding-standards` | extends `react` + `typescript` rules |
| Coding-standards enforcement | `coding-standards-guardrails-skill` | skill | build / `coding-standards` | — (it *is* the live enforcer) |
| Unit testing coverage | `unit-test-coverage-policy` (template) + `coverage-gate-skill` (skill) | template + skill | test / `unit-testing` | new `test-coverage` pack |
| API guidelines | `api-design-guidelines` | template | design / `api-design` | new `api-design` pack |
| Java Security | `java-security-guardrails-skill` | skill | build / `secure-coding` | new `java-security` pack |
| Design principles (SOLID) | `solid-principles-guide` | template | design / `architecture` | new `solid-design-principles` pack |
| Architecture (design patterns) | `design-patterns-catalog` | template | design / `architecture` | — |
| React branding standards | `react-branding-standards` | template | design / `design-systems` | new `react-branding` pack |
| Logging | `structured-logging-standards` | template | build / `logging` | new `structured-logging` pack |
| Exception handling | `exception-handling-standards` | template | build / `error-handling` | new `exception-handling` pack |
| Figma → React | `figma-to-react-skill` | skill | build / `frontend-development` | — |
| (tie-it-together) | `engineering-standards-rollout` | workflow | build | — |

Total: **10 templates**, **4 skills**, **1 workflow**, **6 new kit rule packs**.

## 3. Taxonomy changes (`docs/taxonomy.md`)

Add three categories under the **Build** phase (each will hold ≥1 asset; the taxonomy's "3+ assets" rule is satisfied across the pack):

- `coding-standards` — language-agnostic + per-language conventions
- `error-handling` — exception taxonomy, error envelopes, retries
- `logging` — structured logging, levels, correlation IDs, PII redaction

Reuse existing categories for the rest:
- SOLID + design patterns → `architecture` (Design)
- API guidelines → `api-design` (Design)
- React branding → `design-systems` (Design)
- Java security → `secure-coding` (Build)
- Coverage → `unit-testing` (Test)

No new **phases** (contract is five — unchanged). No new **project types**.

## 4. Schema changes (`lib/schema.ts`)

**None required.** `category` is a free `z.string().min(1)` validated against `taxonomy.md` at build time, so adding categories is a docs-only change. The new assets use existing `type` discriminants (`template`, `skill`, `workflow`).

Two things to verify at build (already enforced by the loader):
- `relatedAssets` slugs resolve (cross-link integrity).
- `figma-to-react-skill.requires` uses the existing `requiresEntrySchema` shape: `[{ "mcp-server": "figma" }]`.

If you later want categories to be enum-validated (stricter), add a `CATEGORIES` const + `z.enum` — optional, out of scope for this pack.

## 5. Asset specs

### 5.1 Templates (the standards contracts)

Each follows the existing template body shape: `# Title`, `## When to use`, the standard itself, `## Tips`. Frontmatter per `docs/content-schema.md`.

**`coding-standards-baseline`** — build / `coding-standards`. Language-agnostic: naming, file/module structure, function-length & cyclomatic-complexity limits, comment policy (why-not-what), dead-code rule, boundary-validation rule. Mirrors and expands the kit `engineering-baseline` so the website has a readable canonical copy. `relatedAssets`: the two language-specific standards + `code-review-comprehensive`.

**`java-coding-standards`** — build / `coding-standards`, stack `[java, spring-boot]`. Constructor injection, immutability (records/final), layered controller→service→repository, package-by-feature, `Optional` usage, Lombok policy, `@ControllerAdvice` for errors. `relatedAssets`: `java-security-guardrails-skill`, `exception-handling-standards`.

**`typescript-react-coding-standards`** — build / `coding-standards`, stack `[typescript, react]`. Strict TS (`no any`, discriminated unions, Zod at boundaries), React composition, hooks rules, state-lifting discipline, accessibility-first markup, stable keys. `relatedAssets`: `react-branding-standards`, `react-form-builder`.

**`solid-principles-guide`** — design / `architecture`. Each SOLID principle with a smell → refactor example (TS + Java), plus an "AI-assisted refactor prompt" block users copy. `relatedAssets`: `design-patterns-catalog`, `adr-generator`.

**`design-patterns-catalog`** — design / `architecture`. GoF + common enterprise patterns (Repository, Strategy, Factory, Adapter, Observer, CQRS-lite), each with "use when / avoid when / smell it replaces". `relatedAssets`: `solid-principles-guide`, `coexistence-architecture-adr`.

**`api-design-guidelines`** — design / `api-design`. REST conventions: resource naming, versioning, pagination, filtering, idempotency, status-code map, **standard error envelope**, HATEOAS stance, deprecation policy. `relatedAssets`: `openapi-spec-generator`, `rest-api-scaffolder-nodejs`, `exception-handling-standards`.

**`exception-handling-standards`** — build / `error-handling`. Error taxonomy (expected vs. programmer vs. fatal), no-swallow rule, wrap-with-context, retry/backoff, client-facing error envelope (shared with API guidelines), don't-leak-stack-traces. Code examples in TS, Java, Python. `relatedAssets`: `api-design-guidelines`, `structured-logging-standards`.

**`structured-logging-standards`** — build / `logging`. Structured JSON logs, log-level semantics, correlation/trace IDs, **PII/secret redaction** (ties to `secure-coding`), what-not-to-log, sampling. `relatedAssets`: `exception-handling-standards`, `secure-coding-guardrails-skill`.

**`react-branding-standards`** — design / `design-systems`, stack `[react, tailwind, shadcn-ui]`. Brand tokens (color/type/spacing/radius) as Tailwind v4 `@theme` variables, shadcn theming, component do/don't, logo & dark-mode rules, the canonical token table the Figma→React skill targets. `relatedAssets`: `figma-to-react-skill`, `shadcn-component-builder`, `component-library-skill`.

**`unit-test-coverage-policy`** — test / `unit-testing`. Coverage thresholds (line/branch/changed-lines), what must be tested vs. exempt, test-naming, AAA structure, mock policy, mutation-testing note. `relatedAssets`: `vitest-unit-test-generator`, `test-generator-skill`, `coverage-gate-skill`.

### 5.2 Skills

**`coding-standards-guardrails-skill`** — build / `coding-standards`, stack `[claude-code]`. **Soft guardrail** modeled exactly on `secure-coding-guardrails-skill`: applies the coding-standards-baseline + active language rules *while generating*, surfaces a one-line note only when it made a standards decision. `relatedAssets`: `coding-standards-baseline`, `secure-coding-guardrails-skill`, `pr-governance-gate-skill`.

**`java-security-guardrails-skill`** — build / `secure-coding`, stack `[java, spring-boot]`. Java-specific secure defaults: Spring Security config, CSRF, method-level `@PreAuthorize`, JPA parameterization, Jackson deserialization safety, secrets via config server, dependency-check. Complements the generic `secure-coding-guardrails-skill`. `relatedAssets`: `java-coding-standards`, `owasp-security-review-skill`.

**`coverage-gate-skill`** — test / `unit-testing`. **Hard guardrail**: reads a coverage report (lcov/cobertura), compares changed-line coverage against the policy threshold, blocks/flags below it. Pairs with `pr-governance-gate-skill` (same hard-gate family). `relatedAssets`: `unit-test-coverage-policy`, `pr-governance-gate-skill`, `test-generator-skill`.

**`figma-to-react-skill`** — build / `frontend-development`, stack `[react, tailwind, shadcn-ui, mcp]`. `requires: [{ "mcp-server": "figma" }]`. Pulls a frame via the Figma MCP (`get_design_context` / `get_variable_defs` / `get_screenshot`), then emits a typed, accessible shadcn/Tailwind component that **conforms to `react-branding-standards`** (maps Figma variables → `@theme` tokens, not hardcoded hex). `relatedAssets`: `figma-mcp` (existing MCP config), `react-branding-standards`, `shadcn-component-builder`. Note: the Figma MCP is already represented in `content/mcp-configs/figma-mcp.mdx`, so the install path is documented.

### 5.3 Workflow

**`engineering-standards-rollout`** — build. Ordered steps: (1) adopt `coding-standards-baseline`, (2) generate kit via Kit Builder with the new rule packs, (3) wire `coverage-gate-skill` + `pr-governance-gate-skill`, (4) install `coding-standards-guardrails-skill` + language guardrail. Gives teams a "turn this on in our repo" path.

## 6. Kit Builder rule packs (`lib/kit/rules.ts`) — ✅ BUILT

Six packs added (typechecked, no duplicate ids). Existing `java`, `react`, `typescript`, `node`, `dotnet`, `python`, `sql` stack rules stay; these add the **cross-cutting** governance concerns they didn't cover. `appliesTo` ids are validated against the tech catalog in `technologies.ts` (no invented ids).

| Pack id | kind | appliesTo | globs | Gist |
|---|---|---|---|---|
| `exception-handling` | baseline | `always` | `**/*` | No swallowed errors, wrap-with-context, typed taxonomy, **single client error envelope**, no stack-trace leaks. |
| `structured-logging` | baseline | `always` | `**/*` | Structured logs, level semantics, correlation/trace IDs, **mandatory secret/PII redaction**, no `console.log`. |
| `solid-design-principles` | baseline | `always` | `**/*` | SRP/OCP/LSP/ISP/DIP as actionable do/don'ts; composition over inheritance; don't over-abstract. |
| `api-design` | stack | `fastapi, django, spring-boot, dotnet, node` | `**/*controller*`, `**/controllers/**`, `**/routes/**`, `**/api/**`, `**/*.controller.ts` | Resource naming, versioning, pagination, idempotency, status-code map, shared error envelope. |
| `java-security` | stack | `java, spring-boot` | `**/*.java` | Spring Security secure defaults, `@PreAuthorize`, IDOR/ownership checks, CSRF, safe Jackson, secrets from config. |
| `react-branding` | stack | `react, tailwind` | `**/*.tsx`, `**/*.jsx`, `components/**` | Design tokens not hex, shadcn component library, dark-mode + AA a11y, brand spacing/logo from shared package. |

How they propagate (already wired in `build-kit.ts`, no UI change needed):

- **`baseline` + `appliesTo: ["always"]`** → auto-recommended on **every** kit. Land in `CLAUDE.md`, `.github/copilot-instructions.md`, and `AGENTS.md` (+ Cursor `alwaysApply: true`). This is the org-wide floor.
- **`stack`** → path-scoped. Cursor `.cursor/rules/<id>.mdc` (globbed), Copilot `.github/instructions/<id>.instructions.md` (`applyTo`), Claude Code in `CLAUDE.md`. Auto-selected when the matching technology is chosen.

`RULE_BY_ID` picks them up automatically; the Kit Builder UI and skill groups need no structural change.

## 7. UI impact

**None structural** — everything is content-driven:
- Browse filters, search (Fuse.js), category pages, and asset detail pages pick up new `.mdx` automatically.
- Home `featured` grid: mark 2–3 flagship assets `featured: true` (suggest `api-design-guidelines`, `figma-to-react-skill`, `coding-standards-baseline`).
- Optional polish: a "Standards" cluster/landing under Build, but not required for v1.

## 8. Sequencing

1. **Taxonomy** — add 3 categories to `docs/taxonomy.md`.
2. **Templates** — author the 10 standards templates (highest value, no code).
3. **Kit rule packs** — add the 6 packs to `lib/kit/rules.ts` (each `body` can lift from the matching template).
4. **Skills** — author the 4 skills (figma-to-react and coverage-gate are the heaviest).
5. **Workflow** — `engineering-standards-rollout` once steps' `assetSlug`s exist (build-time reference integrity).
6. **Featured + cross-links** — set `featured`, fill `relatedAssets`.
7. **Validate** — `pnpm build` (Zod + reference checks) and a Lighthouse pass on home.

## 9. Definition of done

- `pnpm build` passes (frontmatter validates, all `relatedAssets`/workflow `assetSlug`s resolve).
- New categories render on Browse and as `/category/[slug]` pages.
- Copy buttons work on every new template; figma-to-react skill documents the MCP install referencing `figma-mcp`.
- Kit Builder generates `CLAUDE.md` / Cursor / Copilot output including the 6 new packs.
- No new runtime dependencies; site still deploys to Vercel.

## 10. Governance model (org-wide)

The same standard is enforced at three layers; a developer or agent has to clear all three. One standard, three places it bites.

| Layer | When | Mechanism | Covers all 3 agents? |
|---|---|---|---|
| **Soft (advisory)** | While the agent writes code | Kit rule packs (§6) compiled into `CLAUDE.md` / `.cursor/rules` / Copilot instructions + the guardrail skills (`coding-standards-guardrails-skill`, `secure-coding-guardrails-skill`, `java-security-guardrails-skill`) | ✅ — Kit Builder emits all three layouts |
| **Hard (blocking)** | At PR / CI | `pr-governance-gate-skill` (exists) + `coverage-gate-skill` (proposed) wired into the org CI template; fails the build on secrets, missing authz, coverage below threshold | ✅ — runs in CI, agent-agnostic |
| **Audit (report-only)** | Continuous / periodic | The gate runs in report mode and emits violations to a log/summary instead of blocking; used for legacy repos and rollout grace periods | ✅ — same gate, non-blocking flag |

Adoption is staged: a repo starts in **audit** (see violations, no friction), graduates to **soft** (agents auto-comply), then **hard** (gate blocks) once clean. Same artifacts throughout — only the gate's blocking flag changes.

### Agent coverage

`build-kit.ts` already produces all three target layouts from one selection, so a single "govern this repo" action yields:
- **Claude Code** — `CLAUDE.md`, `.claude/skills/<name>/SKILL.md`, `.claude/agents/*.md`
- **Cursor** — `.cursor/rules/*.mdc` (always + scoped), `AGENTS.md`
- **GitHub Copilot** — `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/agents/*.agent.md`, `.github/prompts/*.prompt.md`

No new code needed for multi-agent coverage — it's a property of the existing builder.

## 11. Distribution — manual copy from site (chosen)

The site stays the distribution channel; teams self-serve. To make that work at org scale:

1. **One-click governance kit.** On the Kit Builder, add a preset selection **"Org standards"** that pre-checks the three `always` packs + the guardrail skills + the gate. A team picks their stack, hits download, drops the files in their repo root. That is the whole onboarding.
2. **Copy targets per agent.** The existing per-provider download already covers Claude Code / Cursor / Copilot — surface all three on the preset.
3. **Gate snippet.** Publish the CI step (GitHub Actions / Azure Pipelines) that runs `pr-governance-gate` + `coverage-gate` as a copyable `mcp-config`-style asset so teams paste it into their pipeline.

Because it's manual copy, **versioning is the main risk** (see §12).

## 12. Ownership & versioning

- **Single owner:** the Platform team owns `lib/kit/rules.ts`, the guardrail skills, and the standards templates. Changes go through PR (matches the repo's contribution model).
- **Version stamp:** add a `standardsVersion` (e.g. `2026.06`) to the generated `CLAUDE.md`/`AGENTS.md` header so a repo can report which vintage it's on. Lets you find stale repos even under manual copy.
- **Changelog:** a `docs/standards-changelog.md` entry per change; the kit README links it so teams know when to re-copy.
- **Drift detection (optional, later):** a small CI check that compares the repo's `standardsVersion` against the published latest and warns on a major gap. Keeps "manual copy" from silently rotting without forcing a package dependency.

## 13. Open decisions (need your call)

1. **Content authoring** — `CLAUDE.md` says *don't write content yourself; seed content is curated*. Do you want me to (a) draft full MDX bodies for review, or (b) deliver only the frontmatter + outline stubs for your team to fill?
2. **Java security depth** — keep it as one Spring-focused skill, or split Spring Boot vs. Jakarta/legacy?
3. **Coverage gate** — language-agnostic (parse lcov/cobertura) or ship per-stack variants (Vitest, JaCoCo, pytest-cov)?
4. **Categories vs. enum** — leave `category` free-string (current) or enum-lock it in `schema.ts` while we're adding three?
