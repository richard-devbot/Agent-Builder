/**
 * Org-wide Engineering Standards Catalog (33 concrete standard templates across 10 categories),
 * including observability defaults aligned with the Vertex AI Agent Engine telemetry `.env` standard:
 *   - GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true
 *   - OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental
 *   - OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=EVENT_ONLY
 */

import { DEFAULT_GEMINI_MODEL } from "@/lib/config/public";

export type StandardCategory =
  | "coding-standards"
  | "observability"
  | "error-handling"
  | "api-design"
  | "security"
  | "testing"
  | "architecture"
  | "design-systems"
  | "data-governance"
  | "ci-cd-release";

export type StandardTemplate = {
  id: string;
  category: StandardCategory;
  name: string;
  description: string;
  recommended: boolean;
  enforcement: "hard" | "soft";
  body: string;
};

export const STANDARD_CATEGORY_ORDER: StandardCategory[] = [
  "observability",
  "security",
  "coding-standards",
  "error-handling",
  "api-design",
  "testing",
  "architecture",
  "data-governance",
  "ci-cd-release",
  "design-systems",
];

export const STANDARD_CATEGORY_LABEL: Record<StandardCategory, string> = {
  "observability": "Observability & Telemetry",
  "security": "Security & Identity",
  "coding-standards": "Coding Standards",
  "error-handling": "Error & Exception Handling",
  "api-design": "API & Agent Protocols",
  "testing": "Testing & Quality Gates",
  "architecture": "Architecture & SOLID",
  "data-governance": "Data Governance & Privacy",
  "ci-cd-release": "CI/CD & Release Provenance",
  "design-systems": "UI & Design Systems",
};

const AI_STUDIO_KEY_PREFIX = `${"AI" + "za"}...`;

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  // ── 1. Observability & Telemetry (4) ────────────────────────────────────
  {
    id: "std-agent-engine-telemetry",
    category: "observability",
    name: "Vertex AI Agent Engine Telemetry Standard",
    description:
      "Mandatory OpenTelemetry and Cloud Trace configuration for every deployed Agent Engine reasoningEngine.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Vertex AI Agent Engine Telemetry Standard",
      "- Every Agent Engine `.env` and `spec.deploymentSpec.env` MUST include:",
      "  - `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true`",
      "  - `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`",
      "  - `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=EVENT_ONLY`",
      "- Never set `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=SPAN_AND_EVENT` or `TRUE` in production unless an explicit data-privacy waiver is approved.",
      "- Runtime service accounts MUST hold `roles/cloudtrace.agent` and `roles/logging.logWriter`.",
    ].join("\n"),
  },
  {
    id: "std-structured-json-logging",
    category: "observability",
    name: "Structured JSON Logging Standard",
    description:
      "Emit structured JSON logs with severity, timestamp, and component fields; forbid raw print/console.log in production paths.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Structured JSON Logging Standard",
      "- Emit structured JSON records (`severity`, `message`, `component`, `trace_id`, `span_id`).",
      "- Use semantic log levels: `DEBUG` (local diagnostics), `INFO` (state transitions), `WARNING` (recoverable degradation), `ERROR` (failed operation requiring attention).",
      "- Do not use unformatted `print()` or `console.log()` in production request handlers or agent tool functions.",
    ].join("\n"),
  },
  {
    id: "std-trace-correlation",
    category: "observability",
    name: "Distributed Tracing & Correlation IDs",
    description:
      "Propagate W3C traceparent and x-correlation-id across orchestrator, specialist agents, and downstream tools.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Distributed Tracing & Correlation IDs",
      "- Propagate W3C `traceparent` and `x-correlation-id` headers on every outbound HTTP or A2A agent call.",
      "- Attach `session_id` and `invocation_id` as span attributes so multi-agent turns can be reconstructed in Cloud Trace.",
    ].join("\n"),
  },
  {
    id: "std-pii-log-redaction",
    category: "observability",
    name: "PII & Secret Log Redaction Policy",
    description:
      "Scrub credentials, bearer tokens, emails, and national IDs before writing logs or telemetry events.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### PII & Secret Log Redaction Policy",
      "- Never log `Authorization` headers, OAuth tokens, cookies, API keys, or service-account JSON payloads.",
      "- Redact PII fields (email addresses, phone numbers, tax/national IDs) in tool inputs and outputs before emitting custom log events.",
    ].join("\n"),
  },

  // ── 2. Security & Identity (4) ──────────────────────────────────────────
  {
    id: "std-zero-secrets-wif",
    category: "security",
    name: "Zero-Secret & Workload Identity Standard",
    description:
      "Use Application Default Credentials (ADC) and Workload Identity Federation; ban static JSON keys and committed .env files.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Zero-Secret & Workload Identity Standard",
      "- Authenticate to Google Cloud exclusively via Application Default Credentials (`google.auth.default()`) locally and Workload Identity Federation (WIF) in GitLab CI.",
      "- Never generate, download, or commit service-account JSON key files (`private_key_id`).",
      "- Keep `<agent>/.env` in `.gitignore`; commit only `.env.example` with placeholders.",
    ].join("\n"),
  },
  {
    id: "std-tls-corporate-ca",
    category: "security",
    name: "TLS Verification & Corporate Proxy CA Policy",
    description:
      "Enforce TLS certificate verification on every HTTP client and honor REQUESTS_CA_BUNDLE for corporate inspection proxies.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### TLS Verification & Corporate Proxy CA Policy",
      "- Never pass `verify=False` to `requests`, `httpx`, or `AuthorizedSession`, and never call `urllib3.disable_warnings()`.",
      "- Support corporate TLS inspection proxies by honoring `REQUESTS_CA_BUNDLE` or `SSL_CERT_FILE` from the environment.",
      "- Enforce explicit timeouts (`timeout=(10, 60)`) and `.raise_for_status()` on every outbound HTTP request.",
    ].join("\n"),
  },
  {
    id: "std-input-prompt-shield",
    category: "security",
    name: "Input Validation & Prompt-Injection Shield",
    description:
      "Validate all external inputs with strict schemas and wrap untrusted documents in XML boundary tags before model calls.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Input Validation & Prompt-Injection Shield",
      "- Validate all tool arguments and API payloads at the boundary using Pydantic (Python) or Zod (TypeScript).",
      "- Wrap external documents, tickets, and retrieved chunks in explicit `<untrusted_document>` tags and instruct the model to ignore embedded instructions.",
      "- Attach ADK `before_model_callback` and `before_tool_callback` guardrails to block prompt injection and destructive tool calls.",
    ].join("\n"),
  },
  {
    id: "std-enterprise-auth-iam",
    category: "security",
    name: "Enterprise Authentication Standard (IAM / IAP / OIDC)",
    description:
      "Enforce IAM-only access on Agent Engine, IAP + no-allow-unauthenticated on Cloud Run, and Entra ID OIDC on web UIs.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Enterprise Authentication Standard (IAM / IAP / OIDC)",
      "- Vertex AI Agent Engine has no public unauthenticated URL; callers must authenticate with IAM (`roles/aiplatform.user`).",
      "- Cloud Run services must deploy with `--no-allow-unauthenticated` and disallow `allUsers` / `allAuthenticatedUsers` IAM bindings.",
      "- Web UIs and internal APIs must use the corporate Microsoft Entra ID OIDC scaffold (`security/entra_auth.py`) rather than custom password or JWT login code.",
    ].join("\n"),
  },

  // ── 3. Coding Standards (4) ─────────────────────────────────────────────
  {
    id: "std-coding-baseline",
    category: "coding-standards",
    name: "Coding Standards Baseline",
    description:
      "Language-agnostic limits on function length, cyclomatic complexity, naming clarity, dead code, and why-not-what comments.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Coding Standards Baseline",
      "- Keep functions focused (≤ 50 lines) with low cyclomatic complexity (≤ 10) and early returns over deep nesting.",
      "- Comments explain *why* a decision or constraint exists, never *what* the next line of code literally does.",
      "- Delete dead code, unused imports, and commented-out blocks before opening a merge request.",
    ].join("\n"),
  },
  {
    id: "std-typescript-react",
    category: "coding-standards",
    name: "TypeScript & React 19 Coding Standards",
    description:
      "Strict TypeScript (no any), discriminated unions, Zod at boundaries, and idiomatic React 19 hooks without cascading effect renders.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### TypeScript & React 19 Coding Standards",
      "- Enable TypeScript `strict: true`; avoid `any` and unsafe casts (`as unknown as T`).",
      "- Prefer `useSyncExternalStore` or lazy state initializers over calling `setState` synchronously inside `useEffect`.",
      "- Keep components accessible: semantic HTML landmarks, `aria-label` on icon buttons, and keyboard operability.",
    ].join("\n"),
  },
  {
    id: "std-python-adk",
    category: "coding-standards",
    name: "Python 3.11 & Google ADK Coding Standards",
    description:
      "Type-annotated Python 3.11, explicit root_agent export, deterministic tool docstrings, and safe subprocess usage.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Python 3.11 & Google ADK Coding Standards",
      "- Export `root_agent` from `<agent_folder>/agent.py` and re-export it from `<agent_folder>/__init__.py`.",
      "- Every ADK tool function must have explicit type annotations and a clear docstring describing parameters and return shape.",
      "- Never call `subprocess.run(..., shell=True)`, `os.system()`, `eval()`, or `exec()`.",
    ].join("\n"),
  },
  {
    id: "std-java-spring",
    category: "coding-standards",
    name: "Java & Spring Boot Coding Standards",
    description:
      "Constructor injection, immutable records, layered controller-service-repository boundaries, and @ControllerAdvice error handling.",
    recommended: false,
    enforcement: "soft",
    body: [
      "### Java & Spring Boot Coding Standards",
      "- Use constructor injection exclusively (never field `@Autowired`) and prefer Java `record` types for DTOs.",
      "- Keep controllers thin; enforce business invariants and `@PreAuthorize` checks in the service layer.",
      "- Centralize exception translation in `@RestControllerAdvice` returning RFC 7807 Problem Details.",
    ].join("\n"),
  },

  // ── 4. Error & Exception Handling (3) ───────────────────────────────────
  {
    id: "std-exception-taxonomy",
    category: "error-handling",
    name: "Exception Taxonomy & No-Swallow Rule",
    description:
      "Distinguish transient, domain, and fatal errors; never swallow exceptions silently; always wrap with operational context.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Exception Taxonomy & No-Swallow Rule",
      "- Classify errors into: (a) validation/client errors (4xx), (b) transient upstream errors (retryable), and (c) fatal programmer/config errors.",
      "- Never use empty `catch {}` or bare `except: pass`; either handle the recovery path explicitly or rethrow with context.",
    ].join("\n"),
  },
  {
    id: "std-error-envelope",
    category: "error-handling",
    name: "Standard Client Error Envelope",
    description:
      "Return a consistent JSON error envelope ({ error, code, correlationId }) without leaking stack traces or internal paths.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Standard Client Error Envelope",
      "- Return `{ error: string, code: string, correlationId?: string }` on all failed HTTP responses.",
      "- Never expose raw stack traces, SQL queries, file system paths, or upstream SDK exception dumps to callers.",
    ].join("\n"),
  },
  {
    id: "std-retry-backoff",
    category: "error-handling",
    name: "Retry, Exponential Backoff & Fallback Policy",
    description:
      "Bound retries with jittered exponential backoff on transient 429/503 errors and provide graceful model fallback chains.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Retry, Exponential Backoff & Fallback Policy",
      "- Only retry idempotent operations on transient status codes (`429`, `502`, `503`, `504`) with bounded attempts and jitter.",
      `- Use the approved Gemini model catalog (defaulting to \`${DEFAULT_GEMINI_MODEL}\`) when configuring primary and fallback model routing.`,
    ].join("\n"),
  },

  // ── 5. API & Agent Protocols (3) ────────────────────────────────────────
  {
    id: "std-rest-api-guidelines",
    category: "api-design",
    name: "RESTful Resource & Versioning Guidelines",
    description:
      "Plural noun resources, explicit URL/header versioning, cursor pagination, and strict HTTP status code semantics.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### RESTful Resource & Versioning Guidelines",
      "- Use plural kebab-case nouns for resource paths, explicit pagination (`limit`, `cursor`), and standard HTTP status codes.",
      "- Version public APIs explicitly and maintain backward compatibility within a major version.",
    ].join("\n"),
  },
  {
    id: "std-idempotency-pagination",
    category: "api-design",
    name: "Idempotency & Mutation Safety Contract",
    description:
      "Require Idempotency-Key headers or deterministic deduplication keys on state-mutating endpoints and agent write tools.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Idempotency & Mutation Safety Contract",
      "- State-mutating API endpoints and agent write tools must accept an idempotency key so retries never duplicate tickets or financial records.",
      "- Require explicit human-in-the-loop confirmation before executing high-impact mutations.",
    ].join("\n"),
  },
  {
    id: "std-a2a-agent-card",
    category: "api-design",
    name: "A2A Agent Card & Inter-Agent Protocol",
    description:
      "Publish a machine-readable agent-card.json declaring skills, input/output modes, and IAM authentication requirements.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### A2A Agent Card & Inter-Agent Protocol",
      "- Maintain a valid `agent-card.json` declaring the agent's name, version, skills, supported MIME types, and IAM authentication scheme.",
      "- Record the 19-digit Vertex AI `RESOURCE_ID` in `deployment-record.json` so downstream orchestrators can invoke the agent deterministically.",
    ].join("\n"),
  },

  // ── 6. Testing & Quality Gates (3) ──────────────────────────────────────
  {
    id: "std-unit-test-coverage",
    category: "testing",
    name: "Unit Test Coverage & AAA Policy",
    description:
      "Arrange-Act-Assert structure, ≥80% coverage on changed business logic, and deterministic mocks at external boundaries.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Unit Test Coverage & AAA Policy",
      "- Structure unit tests with Arrange-Act-Assert (AAA) and descriptive behavior names.",
      "- Mock network, database, and LLM calls at the adapter boundary; never make live cloud calls in unit test suites.",
    ].join("\n"),
  },
  {
    id: "std-agent-smoke-eval",
    category: "testing",
    name: "Agent Structure & Smoke Evaluation Gate",
    description:
      "Verify required Agent Engine files, import root_agent in CI before deploy, and run post-deploy smoke queries.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Agent Structure & Smoke Evaluation Gate",
      "- Run `python scripts/check_mandatory_files.py --agent <agent_folder>` and `importlib.import_module('<agent_folder>.agent').root_agent` in CI before every deployment.",
      "- Verify deployment output contains a 19-digit `reasoningEngines` `RESOURCE_ID`.",
    ].join("\n"),
  },
  {
    id: "std-contract-parity-testing",
    category: "testing",
    name: "Schema Contract & Golden Parity Testing",
    description:
      "Validate request/response schemas against Zod/Pydantic contracts and golden fixtures before promoting to UAT/Prod.",
    recommended: false,
    enforcement: "soft",
    body: [
      "### Schema Contract & Golden Parity Testing",
      "- Assert that all API routes and agent structured outputs pass strict Zod or Pydantic schema validation against golden test fixtures.",
    ].join("\n"),
  },

  // ── 7. Architecture & SOLID (3) ─────────────────────────────────────────
  {
    id: "std-solid-principles",
    category: "architecture",
    name: "SOLID Principles for AI-Assisted Code",
    description:
      "Single responsibility, dependency inversion via narrow interfaces, and composition over inheritance.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### SOLID Principles for AI-Assisted Code",
      "- Keep modules single-purpose (SRP) and depend on narrow repository/client interfaces (DIP) so storage and LLM adapters can be swapped cleanly.",
      "- Prefer composition and pure functions over deep class inheritance hierarchies.",
    ].join("\n"),
  },
  {
    id: "std-design-patterns",
    category: "architecture",
    name: "Enterprise Design Patterns Catalog",
    description:
      "Approved usage of Repository, Strategy, Adapter, and Coordinator-Specialist-Validator multi-agent topologies.",
    recommended: false,
    enforcement: "soft",
    body: [
      "### Enterprise Design Patterns Catalog",
      "- Use Repository pattern for persistence (`lib/storage/`), Adapter pattern for external SDKs, and Coordinator → Specialist → Validator topology for multi-agent workflows.",
    ].join("\n"),
  },
  {
    id: "std-separation-of-duties",
    category: "architecture",
    name: "Separation of Duties in Multi-Agent Systems",
    description:
      "The agent that generates code or actions never self-approves; validation and governance hooks run independently.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Separation of Duties in Multi-Agent Systems",
      "- Specialist agents generate outputs; Validator agents and deterministic CI gates (`gitleaks`, `semgrep`, `check_mandatory_files.py`) verify them.",
      "- No agent may bypass a governance hook or approve its own deployment to `prod`.",
    ].join("\n"),
  },

  // ── 8. Data Governance & Privacy (3) ────────────────────────────────────
  {
    id: "std-data-classification",
    category: "data-governance",
    name: "Data Classification & Sandbox Masking Policy",
    description:
      "Prohibit real production PII/PHI in dev sandboxes; use synthetic or tokenized datasets for development and prompt tuning.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Data Classification & Sandbox Masking Policy",
      "- Never load unmasked production PII, PHI, or regulated financial records into local environments or `dev` sandboxes.",
      "- Use synthetic fixtures for evaluation and prompt engineering.",
    ].join("\n"),
  },
  {
    id: "std-bigquery-least-privilege",
    category: "data-governance",
    name: "BigQuery Read-Only & Cost-Bounded Query Standard",
    description:
      "Scope data agents to dataset-level read-only roles and enforce maximum_bytes_billed on every analytical query.",
    recommended: false,
    enforcement: "soft",
    body: [
      "### BigQuery Read-Only & Cost-Bounded Query Standard",
      "- Grant data agents dataset-scoped `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` only (never project-wide Editor).",
      "- Set `maximum_bytes_billed` and explicit `LIMIT` clauses on all agent-generated SQL queries.",
    ].join("\n"),
  },
  {
    id: "std-prompt-retention",
    category: "data-governance",
    name: "Zero Data Retention & Enterprise Vertex Endpoint Policy",
    description:
      "Route all Gemini calls through enterprise Vertex AI endpoints with GOOGLE_GENAI_USE_ENTERPRISE=True.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Zero Data Retention & Enterprise Vertex Endpoint Policy",
      "- Route all model invocations through regional Vertex AI enterprise endpoints (`GOOGLE_GENAI_USE_ENTERPRISE=True`).",
      `- Consumer AI Studio keys (\`${AI_STUDIO_KEY_PREFIX}\`) are prohibited in staging and production.`,
    ].join("\n"),
  },

  // ── 9. CI/CD & Release Provenance (3) ───────────────────────────────────
  {
    id: "std-ci-gate-pipeline",
    category: "ci-cd-release",
    name: "Agent Engine GitLab CI Gate Standard",
    description:
      "Mandatory pipeline order: structure check → gitleaks → semgrep SAST → pip-audit → smoke import → WIF auth → adk deploy.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Agent Engine GitLab CI Gate Standard",
      "- Every deployment must run through `.gitlab-ci.yml` with blocking `check_mandatory_files.py`, `gitleaks`, `semgrep`, and `root_agent` smoke import stages.",
    ].join("\n"),
  },
  {
    id: "std-env-promotion-reviewers",
    category: "ci-cd-release",
    name: "Environment Promotion (dev → uat → prod) & Reviewer Policy",
    description:
      "Isolate GCP projects per environment and require named human reviewers on the prod GitLab Environment.",
    recommended: true,
    enforcement: "hard",
    body: [
      "### Environment Promotion (`dev` → `uat` → `prod`) & Reviewer Policy",
      "- Use separate GitLab Environments (`dev`, `uat`, `prod`) mapped to isolated GCP projects.",
      "- Configure required human reviewers on `prod` so no autonomous sprint or push can deploy to production without human sign-off.",
    ].join("\n"),
  },
  {
    id: "std-kit-lock-provenance",
    category: "ci-cd-release",
    name: "Kit Lockfile & Deployment Provenance Standard",
    description:
      "Commit kit.lock.json in every generated kit and stamp kitVersion + commitSha into deployment-record.json.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Kit Lockfile & Deployment Provenance Standard",
      "- Keep `kit.lock.json` committed at the repository root to record `kitVersion`, `generatorVersion`, `provider`, `target`, and included skills.",
      "- Stamp `kitVersion`, `commitSha`, and the 19-digit `resourceId` into `deployment-record.json` on every Agent Engine deployment.",
    ].join("\n"),
  },

  // ── 10. UI & Design Systems (3) ─────────────────────────────────────────
  {
    id: "std-precision-light-tokens",
    category: "design-systems",
    name: "Precision Light Theme & Brand Token Standard",
    description:
      "Use semantic CSS/Tailwind v4 @theme tokens (#FFFFFF surfaces, #F8FAFC canvas, #4F46E5 brand indigo); forbid hardcoded hex in components.",
    recommended: false,
    enforcement: "soft",
    body: [
      "### Precision Light Theme & Brand Token Standard",
      "- Reference semantic Tailwind v4 `@theme` tokens (`bg-background`, `bg-card`, `text-foreground`, `border-border`, `text-primary`) rather than hardcoded hex values.",
    ].join("\n"),
  },
  {
    id: "std-wcag-aa-accessibility",
    category: "design-systems",
    name: "Accessible Component Standards (WCAG 2.1 AA)",
    description:
      "Enforce ≥4.5:1 text contrast on light surfaces, visible focus-visible rings, keyboard navigation, and prefers-reduced-motion.",
    recommended: true,
    enforcement: "soft",
    body: [
      "### Accessible Component Standards (WCAG 2.1 AA)",
      "- Maintain ≥ 4.5:1 contrast for body copy and semantic badges on light backgrounds.",
      "- Provide visible `:focus-visible` rings, `aria-label` on icon-only controls, and respect `@media (prefers-reduced-motion: reduce)`.",
    ].join("\n"),
  },
  {
    id: "std-figma-react-mapping",
    category: "design-systems",
    name: "Figma-to-React Token Mapping Standard",
    description:
      "Map Figma design variables to shadcn/ui primitives and @theme CSS variables when generating UI components.",
    recommended: false,
    enforcement: "soft",
    body: [
      "### Figma-to-React Token Mapping Standard",
      "- Translate Figma variables into `@theme` tokens and compose existing `components/ui/*` primitives instead of emitting inline styles.",
    ].join("\n"),
  },
];

export const STANDARD_TEMPLATE_BY_ID: Record<string, StandardTemplate> = Object.fromEntries(
  STANDARD_TEMPLATES.map((t) => [t.id, t]),
);

export const RECOMMENDED_STANDARD_TEMPLATE_IDS: string[] = STANDARD_TEMPLATES.filter(
  (t) => t.recommended,
).map((t) => t.id);

/**
 * Compile the chosen engineering standards into a markdown section suitable for
 * `GEMINI.md`, `AGENTS.md`, `CLAUDE.md`, or `docs/engineering-standards.md`.
 */
export function buildStandardsMarkdown(selectedIds: Iterable<string>): string | null {
  const set = new Set(selectedIds);
  const chosen = STANDARD_TEMPLATES.filter((t) => set.has(t.id));
  if (chosen.length === 0) return null;

  const lines: string[] = [
    "## Engineering & Observability Standards",
    "",
    "The following organisation engineering standards govern all human and AI-generated code in this repository:",
    "",
  ];

  for (const cat of STANDARD_CATEGORY_ORDER) {
    const inCat = chosen.filter((t) => t.category === cat);
    if (inCat.length === 0) continue;
    lines.push(`### ${STANDARD_CATEGORY_LABEL[cat]}`, "");
    for (const std of inCat) {
      lines.push(
        `#### ${std.name} (${std.enforcement === "hard" ? "Hard Gate — Blocking" : "Soft Guardrail — Advisory"})`,
        "",
        std.body,
        "",
      );
    }
  }

  return lines.join("\n").trimEnd();
}
