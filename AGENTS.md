<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:agentic-sdlc-governance -->
# Agentic SDLC Governance Framework

> This section defines **how AI agents operate inside your organisation's AI-enabled SDLC** and the governance that constrains them. It is the canonical reference for the agent roster, governance hooks, and the hard/soft guardrail model demonstrated to clients. Coding agents working in this repo should treat it as binding; client-facing teams use it as the governance talking-point artifact.

## 1. Why this exists

AI accelerates every SDLC phase, but acceleration without governance produces fast, untraceable risk. This framework makes AI-assisted development **standardized, governed, and auditable**: the same agents, the same guardrails, and the same audit trail across every project and persona. It is the structure behind enterprise-wide standardization, responsible-AI practice, and security/compliance governance.

## 2. The agent roster

Work is performed by four classes of agent. Each has a bounded mandate; none is trusted to mark its own work as done.

| Agent | Mandate | Operates in | Must NOT |
|-------|---------|-------------|----------|
| **Discovery Agent** | Understands the problem, legacy system, or requirement. Reads code, docs, tickets, data; produces specs, inventories, and dependency maps. | Discover, Design | Modify code or merge anything. Read-only by default. |
| **Orchestrator Agent** | Plans and sequences work, decomposes goals into tasks, dispatches to specialist/validator agents, and tracks state across an autonomous sprint. | All phases | Bypass a governance hook to "make progress". |
| **Specialist Domain Agent** | Does the focused work: generate code, migrate a module, write tests, author IaC. One domain per agent (frontend, data, auth, tests, etc.). | Build, Test, Deploy | Self-approve. Output always flows to a Validator + hook. |
| **Validator Agent** | Independently checks a specialist's output against standards: correctness, security (OWASP/ASVS), tests, conventions. Produces a verdict, never the code under review. | Test (and inline) | Fix the code it is validating (separation of duties). |

**Separation of duties is structural:** the agent that writes code never approves it. Validation and the governance gate are distinct from generation.

## 3. Governance hooks

Hooks are deterministic checkpoints between agent actions. They are where enterprise standards are enforced, and they cannot be skipped by an agent.

| Hook | Fires | Enforces | Implemented by |
|------|-------|----------|----------------|
| **Pre-generation** | before a specialist writes code | persona scope, environment, data-access limits, approved models/connectors | persona/RBAC config, MCP allowlists |
| **Post-generation** | after code is produced | secure-by-default review, secret scan, conventions | `secure-coding-guardrails` skill, `owasp-security-review` skill |
| **Pre-merge** | before reaching a protected branch | full governance checklist, blocking on 🔴 security/compliance failures | `pr-governance-gate` skill + branch protection |
| **Pre-deploy** | before promotion to an environment | environment policy, change provenance, approvals | pipeline policy / CI gate |

The canonical content for these lives in this library: see `content/skills/owasp-security-review-skill.mdx`, `secure-coding-guardrails-skill.mdx`, and `pr-governance-gate-skill.mdx`.

## 4. Hard vs. soft guardrails

- **Hard guardrails** are *blocking* and *machine-enforced* — a violation cannot reach `main` or production. Examples: no secrets committed, no unresolved 🔴 OWASP finding, no protected-branch merge without the governance gate, no real production/PII data in a sandbox.
- **Soft guardrails** are *advisory* and *guidance-enforced* — they shape behavior at authoring time but don't block. Examples: prefer parameterized queries, disclose AI-generated code, add tests for changed behavior.

If a rule isn't enforced by a system, it is **soft** — call it what it is. The full, generatable policy is `content/templates/vibe-coding-guardrails-policy.mdx`.

### Per-tool enforcement matrix

Enforcement is not uniform across target tools; generated kits state this honestly (each kit README carries this matrix for its tool):

| Guardrail | Claude Code | Copilot | Cursor |
|-----------|-------------|---------|--------|
| Pre-tool guard hooks (rm -rf / SQL drop / force-push) | **BLOCKING** (native hook runtime via `.claude/settings.json`) | ADVISORY until wired into git pre-commit / CI (`guardrails/`) | ADVISORY until wired into git pre-commit / CI (`guardrails/`) |
| Discovery before code | **BLOCKING** (pre-tool edit gate + session bootstrap) | ADVISORY (bootstrap instructions) | ADVISORY (bootstrap instructions) |
| Human verify before commit (`.agent/confirm.sh` + pre-commit gate) | **BLOCKING** once `githooks-install.sh` is run | **BLOCKING** once `githooks-install.sh` is run | **BLOCKING** once `githooks-install.sh` is run |
| Rules / working agreement | ADVISORY | ADVISORY | ADVISORY |

## 5. Persona-based access control

Every agent runs **on behalf of a persona**, and the persona — not the agent — determines what is reachable: which environments, which data classification, which connectors, which branches. Citizen developers default to a sandbox with synthetic/masked data and no path to production secrets or protected branches. The authoritative model is `content/templates/security-persona-rbac-matrix.mdx`. **Default deny:** a capability not explicitly granted is denied.

## 6. Autonomous agent sprints

The Orchestrator may run a multi-step sprint (plan → dispatch specialists → validate → gate) with reduced human prompting, but:

1. Every hook still fires; autonomy never disables a guardrail.
2. A **human is accountable** for every change merged to a protected branch.
3. Hard-guardrail **waivers** go through a named human approver, are time-bound, and are logged — never granted by an agent.
4. Everything is **auditable**: agent actions, hook verdicts, and approvals are recorded.

## 7. Mapping to the SDLC phases

| Phase | Primary agents | Active hooks | Key library assets |
|-------|----------------|--------------|--------------------|
| Discover | Discovery | pre-generation (scope) | (specs, inventories) |
| Design | Discovery, Orchestrator | pre-generation | `threat-model-stride`, `security-persona-rbac-matrix`, `vibe-coding-guardrails-policy` |
| Build | Specialist, Orchestrator | post-generation | `secure-coding-guardrails-skill` |
| Test | Validator | post-generation | `owasp-security-review-skill`, `owasp-top10-audit` |
| Deploy | Orchestrator | pre-merge, pre-deploy | `pr-governance-gate-skill` |

## 8. Rules for agents working in this repository

- Stay within your mandate (see the roster). A Specialist does not self-approve; a Validator does not edit the code it reviews.
- Never weaken or bypass a hook to make progress. If a hook blocks you, surface the blocker — don't route around it.
- Treat hard guardrails as non-negotiable. Secrets, production/PII data, and protected-branch merges are the bright lines.
- Disclose AI-generated changes and keep a human accountable for every merge.
<!-- END:agentic-sdlc-governance -->
