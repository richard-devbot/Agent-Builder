/**
 * Rule packs for the Claude Kit Builder.
 *
 * A rule pack is a chunk of guidance that becomes:
 *   - Claude Code  -> a section of the generated CLAUDE.md
 *   - Copilot      -> .github/instructions/<id>.instructions.md (applyTo: globs)
 *                     ("always" packs are merged into copilot-instructions.md)
 *   - Cursor       -> .cursor/rules/<id>.mdc (globs + alwaysApply)
 *
 * `appliesTo` lists technology ids that auto-select the pack; "always" packs
 * are recommended on every kit (engineering baseline + guardrails).
 */

export type RuleKind = "baseline" | "governance" | "stack";

export type RulePack = {
  id: string;
  name: string;
  kind: RuleKind;
  description: string;
  /** Tech ids that auto-select this pack; "always" = every kit. */
  appliesTo: string[];
  /** File globs the rule applies to (used by Cursor/Copilot scoping). */
  globs: string[];
  /** Markdown rule body. */
  body: string;
};

export const RULE_KIND_LABEL: Record<RuleKind, string> = {
  baseline: "Engineering baseline",
  governance: "Governance & guardrails",
  stack: "Stack rules",
};

export const RULES: readonly RulePack[] = [
  // ── Baseline (always) ──────────────────────────────────────────────────
  {
    id: "engineering-baseline",
    name: "Engineering baseline",
    kind: "baseline",
    description:
      "Core working agreement for AI-assisted development: scope discipline, no dead code, match existing conventions.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Engineering baseline

- Make the smallest change that fully solves the task. Don't refactor, add
  abstractions, or "improve" unrelated code unless asked.
- Match the conventions already in the file and the surrounding modules
  (naming, structure, error handling, test style).
- No dead code, no commented-out blocks, no half-finished implementations.
- Don't add comments that restate the code. Comment only non-obvious "why".
- Trust internal code and framework guarantees; validate only at system
  boundaries (user input, external APIs).
- When a requirement is ambiguous, ask before guessing. State assumptions you
  had to make.`,
  },
  {
    id: "orchestration-protocol",
    name: "Orchestration & delegation",
    kind: "baseline",
    description:
      "Main-agent protocol: decompose the goal, delegate focused work to specialist subagents via the Task tool, and verify each result before proceeding.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Orchestration & delegation

You are the main agent. For any non-trivial task, orchestrate instead of doing
everything inline: decompose the goal, delegate focused pieces to specialist
agents, and verify their output before building on it.

- **Discovery first.** Before planning the first task on a checkout, confirm a
  project-context document exists (the \`discovery\` agent creates it) and read
  it, so you're not rediscovering the stack on every task.
- **Plan first.** Restate the goal, surface ambiguity, and break the work into
  ordered, independently-verifiable tasks before writing code.
- **Delegate to specialists.** Use the specialist agents available in your
  environment — e.g. \`discovery\` (project context), \`planner\` (read-only
  analysis), \`code-reviewer\`, \`security-reviewer\`, \`test-author\`,
  \`playwright-test-author\` / \`e2e-runner\` (QA), and \`validator\` (independent
  check). Give each a self-contained brief with the relevant context.
  - In Claude Code: use the Task tool to dispatch to \`.claude/agents/\`.
  - In Copilot: the user can invoke specialists via \`@agent-name\` in chat;
    for inline work, follow the specialist's guidelines directly.
  - In Cursor: apply the relevant rule for the specialist's domain.
- **One concern at a time.** Keep each task small enough that a single
  specialist plus one validation pass can finish it. Run independent tasks in
  parallel where the tool allows.
- **Verify before proceeding.** Route each specialist's output through the
  \`validator\` (and \`security-reviewer\` for security-sensitive changes) before
  relying on it. Separation of duties: the agent that writes code is not the one
  that approves it.
- **Never bypass governance.** Don't skip a hook, gate, or failing test to make
  progress — surface the blocker instead.
- **Human accountability.** A human owns every change merged to a protected
  branch; you assist, you do not self-approve.`,
  },

  {
    id: "iterative-execution-loop",
    name: "Iterative execution loop",
    kind: "baseline",
    description:
      "Run multi-step work as a resumable loop backed by a durable plan file: plan once, execute one task at a time, record intermediate outputs, check it off, and continue until done.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Iterative execution loop

For any task that takes more than one step, don't try to finish it in a single
pass and don't keep the plan only in your head. Drive it as a resumable loop
backed by files on disk, so the work survives a restart and you never lose the
thread between steps.

**Keep durable state under \`.agent/\`:**
- \`.agent/plan.md\` — the goal, an ordered task checklist (\`- [ ]\` / \`- [x]\`),
  and a short "current state / decisions" section. This file, not the chat, is
  the source of truth.
- \`.agent/progress/NN-<task>.md\` — one note per finished task: what changed,
  files touched, the validation verdict, and anything the next task needs.

**The loop:**
1. **Plan once.** At the start, write \`.agent/plan.md\`: restate the goal and
   break it into small, ordered, independently-verifiable tasks (delegate the
   breakdown to \`planner\` for anything non-trivial). If \`.agent/plan.md\`
   already exists, read it and resume from the first unchecked task instead of
   starting over — never redo a checked task.
2. **Execute the next unchecked task only.** Pull the relevant plan lines and
   prior progress notes into the work so you don't re-discover the codebase.
3. **Stop at the human checkpoint — do NOT commit yet.** When the code is
   written, hand it back to the human: say what changed, give the **exact
   commands to run it and exercise the new behavior** (start the app, the
   \`curl\`/HTTP calls or test commands that hit the new endpoints, the responses
   you expect), and ask them to run it and confirm. Wait for confirmation before
   going further.
4. **On confirmation: verify, then commit.** Route the change through
   \`validator\` (and \`security-reviewer\` for security-sensitive changes), then
   commit with a clear message and open a PR for it — a human owns the merge, you
   never self-approve.
5. **Record + check off.** Write the progress note, tick the box in
   \`.agent/plan.md\`, and update "current state". On failure (or if the human
   reports a problem at the checkpoint), leave the box unchecked, capture the
   findings as a follow-up task, and loop on it.
6. **Repeat or ask.** Move to the next unchecked task. When every box is checked,
   summarize at the top of the plan; if you're unsure what comes next, ask the
   human rather than stopping silently.

If the \`orchestrator\` agent is installed, hand multi-step goals to it — it runs
exactly this loop. Otherwise run the loop yourself. Either way: one task at a
time, intermediate outputs always written down, and never skip a governance hook
or failing test to "make progress" — surface the blocker in \`.agent/plan.md\`.`,
  },

  // ── Governance & guardrails (always-recommended) ───────────────────────
  {
    id: "secure-coding-guardrails",
    name: "Secure-coding guardrails",
    kind: "governance",
    description:
      "Secure-by-default rules applied while generating code: parameterized queries, authz checks, no secrets, safe file/URL handling.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Secure-coding guardrails (apply by default)

- Never build SQL/NoSQL/shell/LDAP strings by concatenation. Use parameterized
  queries / prepared statements / safe APIs.
- Validate and type all external input at the boundary; allowlist, don't blocklist.
- Encode on output. Never inject user data into HTML via innerHTML /
  dangerouslySetInnerHTML.
- Every state-changing or data-returning endpoint gets an explicit authorization
  check, and an ownership check on object access (prevent IDOR). If the rule is
  unknown, scaffold a clearly-marked TODO(authz) and say so — never ship an open
  endpoint silently.
- Never hardcode secrets, keys, tokens, or connection strings; read from env / a
  secret manager. Never log secrets or PII.
- File uploads: validate type & size, store outside web root, generate
  server-side names (no path traversal). Allowlist hosts for server-side fetches
  (SSRF). Never deserialize untrusted data into objects with side effects.
- Hash passwords with bcrypt/argon2/scrypt — never MD5/SHA1 or plaintext.

If a request inherently requires an unsafe choice, STOP, explain the risk in one
or two sentences, offer the secure alternative, and ask before proceeding.`,
  },
  {
    id: "responsible-ai-guardrails",
    name: "Responsible-AI guardrails",
    kind: "governance",
    description:
      "Accountability and provenance rules for AI-generated changes: human ownership, disclosure, no fabricated APIs.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Responsible-AI guardrails

- A human is accountable for every change merged to a protected branch. AI
  assists; it does not approve its own work.
- Disclose AI-generated or AI-assisted changes per team policy (e.g. in the PR
  description).
- Never invent APIs, imports, config keys, or file paths. If you're not sure
  something exists, verify it (read the file / grep) before relying on it.
- Don't disable, weaken, or route around security controls, tests, or
  governance checks to "make progress". Surface the blocker instead.
- Keep regulated/sensitive data out of prompts and sample data unless the
  environment is approved for it. Prefer synthetic or masked data.`,
  },

  {
    id: "exception-handling",
    name: "Exception handling",
    kind: "baseline",
    description:
      "Org standard for errors: no swallowed exceptions, wrap-with-context, typed error taxonomy, a single client-facing error envelope, never leak stack traces.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Exception handling (org standard)

- Never swallow errors. No empty \`catch\`, no bare \`except:\`, no
  \`catch (e) {}\`. If you catch, you handle, rethrow with context, or log and
  fail — and you say which.
- Classify errors: **expected** (validation, not-found, conflict — map to a
  client response), **programmer** (bugs — let them surface in dev, alert in
  prod), **fatal** (fail fast on startup/config errors). Don't treat them the same.
- Wrap-and-rethrow with context, don't blanket-catch and lose the cause
  (\`throw new X(msg, { cause })\` / Java \`new X(msg, e)\` / Python \`raise X from e\`).
- Return a **single error envelope** to clients: \`{ error: { code, message,
  requestId } }\`. Stable \`code\` strings; human \`message\`; never internal detail.
- Never leak stack traces, SQL, or framework internals to a client or an API
  response. Log the detail server-side, return the generic envelope.
- Validate at boundaries; inside trusted code, let invariants throw rather than
  defensively returning nulls that hide bugs.`,
  },
  {
    id: "structured-logging",
    name: "Structured logging",
    kind: "baseline",
    description:
      "Org standard for logs: structured JSON, correct level semantics, correlation/trace IDs, and mandatory secret/PII redaction.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## Structured logging (org standard)

- Log structured (JSON or key-value), never bare string interpolation. One event
  per log line with stable field names (\`event\`, \`level\`, \`requestId\`, \`userId\`).
- Use level semantics correctly: \`error\` = needs human action; \`warn\` =
  recoverable/degraded; \`info\` = business milestone; \`debug\` = diagnostics off in
  prod. Don't log at \`error\` for expected validation failures.
- Propagate a **correlation / trace id** through the request and include it on
  every log line and the client error envelope so a report can be traced end to end.
- **Never log secrets or PII**: no passwords, tokens, full PANs, full emails,
  auth headers, connection strings. Redact at the logger (allowlist fields), not
  by remembering at each call site.
- No \`console.log\`/\`printStackTrace\`/\`print\` in committed code — use the project
  logger. Don't log inside hot loops; sample high-volume events.`,
  },
  {
    id: "solid-design-principles",
    name: "SOLID design principles",
    kind: "baseline",
    description:
      "Apply SOLID as actionable do/don'ts while writing or refactoring: single responsibility, open/closed, Liskov, interface segregation, dependency inversion.",
    appliesTo: ["always"],
    globs: ["**/*"],
    body: `## SOLID design principles

- **SRP** — one reason to change per module/class/function. If you describe it
  with "and", split it. Keep web, business, and persistence concerns separate.
- **OCP** — extend behavior by adding code, not editing stable code. Replace
  growing \`if/else\`/\`switch\` on a type with polymorphism or a strategy map.
- **LSP** — a subtype must honor the base contract (no narrowing inputs,
  widening errors, or throwing where the base doesn't). If it can't, it isn't a subtype.
- **ISP** — many small, focused interfaces over one fat one. Don't force callers
  to depend on methods they don't use.
- **DIP** — depend on abstractions, inject dependencies (constructor injection);
  high-level policy must not import low-level detail. Keep I/O at the edges.
- Prefer composition over inheritance. Don't add an abstraction until there are
  two real call sites — SOLID is not a license to over-engineer.`,
  },

  // ── Stack rules ────────────────────────────────────────────────────────
  {
    id: "typescript",
    name: "TypeScript",
    kind: "stack",
    description: "Strict typing, no any, discriminated unions, explicit error handling.",
    appliesTo: ["typescript"],
    globs: ["**/*.ts", "**/*.tsx"],
    body: `## TypeScript

- Treat \`strict\` as on. Don't use \`any\`; prefer \`unknown\` + narrowing, or a
  precise type. Avoid non-null assertions (\`!\`) — narrow instead.
- Model state with discriminated unions, not booleans-everywhere.
- Validate external data (API responses, request bodies) at the boundary with a
  schema (e.g. Zod) and infer types from it.
- Prefer \`const\`, immutability, and pure functions. Keep side effects at the edges.
- Don't swallow errors; type them and handle or rethrow with context.`,
  },
  {
    id: "nextjs",
    name: "Next.js (App Router)",
    kind: "stack",
    description: "Server Components by default, client only when interactive, data fetching in RSC.",
    appliesTo: ["nextjs"],
    globs: ["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx"],
    body: `## Next.js (App Router)

- Server Components by default. Add \`"use client"\` only for interactivity
  (state, effects, event handlers, browser APIs).
- Fetch data in Server Components / server actions; don't fetch in client
  components when a server boundary will do.
- Keep secrets server-side; never expose them via \`NEXT_PUBLIC_\` unless truly public.
- Use the file-based conventions (layout, loading, error, not-found) instead of
  hand-rolled equivalents.
- Co-locate components; keep route files thin and push logic into \`lib/\`.`,
  },
  {
    id: "react",
    name: "React",
    kind: "stack",
    description: "Composable components, correct hooks usage, accessible markup.",
    appliesTo: ["react"],
    globs: ["**/*.tsx", "**/*.jsx"],
    body: `## React

- Components are pure functions of props/state. Keep them small and composable.
- Follow the rules of hooks; list complete dependency arrays. Don't reach for
  \`useEffect\` when derived state or an event handler will do.
- Lift state only as far as needed; prefer local state and composition over
  global stores.
- Use semantic, accessible markup (labels, roles, keyboard support). Don't fix
  a11y with ARIA when native elements work.
- Keys must be stable and unique; never the array index for dynamic lists.`,
  },
  {
    id: "angular",
    name: "Angular",
    kind: "stack",
    description: "Standalone components, typed reactive forms, RxJS hygiene, OnPush.",
    appliesTo: ["angular"],
    globs: ["**/*.ts", "**/*.html"],
    body: `## Angular

- Prefer standalone components and the modern control-flow syntax.
- Use typed reactive forms; avoid template-driven forms for non-trivial input.
- RxJS hygiene: unsubscribe (takeUntilDestroyed / async pipe), avoid nested
  subscribes, keep side effects in \`tap\`.
- Use OnPush change detection and immutable inputs.
- Keep services single-responsibility and provided at the right scope.`,
  },
  {
    id: "python",
    name: "Python",
    kind: "stack",
    description: "Type hints, explicit errors, no bare excepts, idiomatic standard library.",
    appliesTo: ["python", "fastapi", "django", "pytest"],
    globs: ["**/*.py"],
    body: `## Python

- Type-hint public functions; run them through the project's type checker
  (mypy/pyright) mentally before finishing.
- No bare \`except:\`; catch specific exceptions and add context. Don't silence errors.
- Prefer standard-library and idiomatic constructs (comprehensions, \`pathlib\`,
  \`dataclasses\`/\`pydantic\`) over reinventing.
- Keep functions small and side-effect-light; isolate I/O.
- Follow the project's formatter/linter (black/ruff) — don't fight it.`,
  },
  {
    id: "dotnet",
    name: ".NET / ASP.NET",
    kind: "stack",
    description: "Nullable reference types, async/await, DI, EF Core safety.",
    appliesTo: ["dotnet", "csharp"],
    globs: ["**/*.cs"],
    body: `## .NET / ASP.NET

- Enable and respect nullable reference types; don't \`!\` your way past warnings.
- Async all the way: \`async\`/\`await\` with \`CancellationToken\` on I/O; never
  \`.Result\`/\`.Wait()\` (deadlocks).
- Use dependency injection; register services with the correct lifetime
  (singleton/scoped/transient).
- EF Core: avoid N+1 (\`Include\`/projection), use parameterized LINQ (never string
  SQL), and keep \`DbContext\` scoped.
- Validate input with model validation / FluentValidation at the boundary.`,
  },
  {
    id: "java",
    name: "Java / Spring Boot",
    kind: "stack",
    description: "Constructor injection, immutability, layered architecture, no field injection.",
    appliesTo: ["java", "spring-boot"],
    globs: ["**/*.java"],
    body: `## Java / Spring Boot

- Constructor injection only (no field \`@Autowired\`); make dependencies final.
- Prefer immutability (records, final fields) and small, single-responsibility classes.
- Keep layers clean: controller -> service -> repository; no business logic in
  controllers, no web concerns in services.
- Use parameterized queries / JPA; never concatenate SQL/JPQL.
- Handle exceptions with a controller advice; don't leak stack traces to clients.`,
  },
  {
    id: "java-security",
    name: "Java / Spring Security",
    kind: "stack",
    description:
      "Spring Security secure defaults: explicit method authorization, CSRF, safe deserialization, parameterized JPA, secrets from config, no stack-trace leaks.",
    appliesTo: ["java", "spring-boot"],
    globs: ["**/*.java"],
    body: `## Java / Spring Security

- Secure by default: lock down all endpoints, then open specific ones. Don't
  \`permitAll()\` broadly. Add explicit method authorization
  (\`@PreAuthorize\`) on service methods that return or change data.
- Enforce ownership checks (prevent IDOR) — authenticated is not authorized for
  a specific record. Verify the principal owns/may access the entity.
- Leave CSRF protection on for browser/session flows; only disable it for
  stateless token APIs, and say why.
- Parameterize all data access (JPA/\`@Query\` with named params); never
  concatenate JPQL/SQL. Validate request bodies with Bean Validation
  (\`@Valid\`) at the controller boundary.
- Jackson/deserialization: never enable default typing on untrusted input; use
  explicit DTOs, not domain entities, at the web edge.
- Read secrets from config/Vault/env — never hardcode. Hash passwords with
  bcrypt/argon2 via \`PasswordEncoder\`. Keep dependencies patched (OWASP
  dependency-check / \`mvn versions\`).
- Handle exceptions in a \`@ControllerAdvice\`; return the standard error
  envelope, never a stack trace or framework detail.`,
  },
  {
    id: "api-design",
    name: "API design guidelines",
    kind: "stack",
    description:
      "REST conventions: resource naming, versioning, pagination, idempotency, status-code map, and the standard error envelope.",
    appliesTo: ["fastapi", "django", "spring-boot", "dotnet", "node"],
    globs: [
      "**/*controller*",
      "**/controllers/**",
      "**/routes/**",
      "**/api/**",
      "**/*.controller.ts",
    ],
    body: `## API design guidelines

- Resources are plural nouns (\`/orders\`, \`/orders/{id}/items\`); verbs live in
  the HTTP method, not the path. Use kebab-case paths, camelCase JSON bodies.
- Version explicitly (\`/v1/...\` or a header). Never break a shipped contract —
  add fields, don't repurpose them; deprecate with a sunset header before removal.
- Use status codes faithfully: 200/201/204 success, 400 validation, 401 unauth,
  403 forbidden, 404 missing, 409 conflict, 422 semantic, 429 rate-limited,
  5xx server. Don't return 200 with an error body.
- List endpoints paginate (cursor or \`page\`/\`pageSize\`) and document defaults
  and max page size. Support filtering/sorting via query params, not new routes.
- Mutating endpoints that can be retried are idempotent (use an idempotency key
  for POST where needed). PUT/DELETE are naturally idempotent — keep them so.
- Errors use the **standard envelope** \`{ error: { code, message, requestId } }\`
  with the same \`code\` vocabulary across services. Validate input at the edge;
  return all field errors together, not one at a time.`,
  },
  {
    id: "react-branding",
    name: "React branding & design system",
    kind: "stack",
    description:
      "Use brand design tokens, not hardcoded values; theme via the design system; dark-mode and accessibility by default.",
    appliesTo: ["react", "tailwind"],
    globs: ["**/*.tsx", "**/*.jsx", "components/**"],
    body: `## React branding & design system

- Use design tokens, never hardcoded values. No raw hex/rgb, no magic spacing —
  reference theme tokens (Tailwind \`@theme\` CSS variables / design-system
  classes). A literal \`#3b82f6\` in a component is a bug.
- Build from the shared component library (shadcn/ui + brand wrappers) before
  hand-rolling. Don't fork a primitive to restyle it — extend via tokens/variants.
- Support light and dark mode through tokens; don't branch on theme in component
  logic. Respect \`prefers-reduced-motion\` and \`prefers-color-scheme\`.
- Accessibility is part of branding: semantic elements, labelled controls,
  visible focus states, AA contrast. Don't remove focus outlines to "clean up" UI.
- Logo, typography, and spacing follow the brand scale — use the spacing/radius
  tokens, don't invent one-off values. Keep brand assets imported from the shared
  package, never copy-pasted.`,
  },
  {
    id: "sql",
    name: "SQL & database",
    kind: "stack",
    description: "Parameterized queries, indexed access paths, safe migrations.",
    appliesTo: ["sql", "postgres", "mysql", "sqlserver"],
    globs: ["**/*.sql"],
    body: `## SQL & database

- Always parameterize. Never build queries by string concatenation.
- Write set-based SQL; avoid row-by-row loops where a join/aggregate works.
- Be explicit: name columns (no \`SELECT *\` in app code), qualify joins.
- Consider the access path — ensure queries are supported by an index; flag
  full scans on large tables.
- Migrations must be reversible and safe under concurrent writes (add nullable
  or with default, backfill, then enforce). Never edit a shipped migration.`,
  },
  {
    id: "node",
    name: "Node.js / Express",
    kind: "stack",
    description: "Async error handling, input validation, no blocking the event loop.",
    appliesTo: ["node", "javascript"],
    globs: ["**/*.js", "**/*.ts"],
    body: `## Node.js / Express

- Don't block the event loop; keep CPU-heavy work off the request path.
- Wrap async route handlers so rejected promises become handled errors (async
  error middleware), not unhandled rejections.
- Validate and sanitize request input (params, query, body, headers) at the boundary.
- Set security headers (helmet), sensible CORS, and rate limits on sensitive routes.
- Read config/secrets from env; fail fast on missing required config at startup.`,
  },
  {
    id: "playwright",
    name: "Playwright testing",
    kind: "stack",
    description: "Role-based locators, web-first assertions, no fixed sleeps, isolated tests.",
    appliesTo: ["playwright"],
    globs: ["**/*.spec.ts", "tests/**/*.ts", "e2e/**/*.ts"],
    body: `## Playwright testing

- Use accessible locators (getByRole/getByLabel/getByText) over CSS/XPath.
- Use web-first, auto-waiting assertions (expect(locator).toBeVisible()); never
  add fixed \`waitForTimeout\` sleeps to fix flakiness.
- One user-visible behavior per test; descriptive titles. Keep tests isolated and
  idempotent — each sets up and tears down its own state.
- Prefer \`data-testid\` only when no accessible locator exists.
- Don't weaken assertions to make a flaky test pass; fix the locator/wait.`,
  },
  {
    id: "junit-testing",
    name: "JUnit testing (Java)",
    kind: "stack",
    description:
      "JUnit 5 conventions: descriptive @DisplayName, AAA structure, Mockito at the boundary, parameterized tests, Spring slice tests, no Thread.sleep, behavior over implementation.",
    appliesTo: ["java", "spring-boot"],
    globs: ["**/*Test.java", "**/*Tests.java", "**/*IT.java", "src/test/**/*.java"],
    body: `## JUnit testing (Java)

- Use **JUnit 5** (Jupiter): \`org.junit.jupiter.api\`, \`@Test\`,
  \`@BeforeEach\`/\`@AfterEach\`. Don't mix in JUnit 4 (\`@RunWith\`, \`@Before\`).
- Name tests by behavior and add \`@DisplayName\` — e.g.
  \`createUser_withDuplicateEmail_throwsConflict\`. Follow Arrange-Act-Assert.
- Assert with one consistent style (AssertJ \`assertThat(...)\` preferred) — fluent,
  specific assertions over bare \`assertTrue\`. Assert behavior, not implementation.
- Mock collaborators with Mockito (\`@Mock\` + \`@InjectMocks\`, or \`mock()\`); mock at
  the boundary only — never mock value objects or the class under test. Verify
  interactions where they're part of the contract.
- Use \`@ParameterizedTest\` with \`@ValueSource\`/\`@CsvSource\`/\`@MethodSource\`
  instead of copy-pasting near-identical tests.
- Cover the happy path, edge cases (null, empty, boundary), and error paths
  (assert thrown exceptions with \`assertThatThrownBy\` / \`assertThrows\`).
- **Spring Boot:** prefer slice tests (\`@WebMvcTest\`, \`@DataJpaTest\`,
  \`@JsonTest\`) with \`@MockBean\` over a full \`@SpringBootTest\` — only load the
  whole context when the test genuinely needs it.
- Keep tests isolated, idempotent, and fast. No \`Thread.sleep\` for timing — use
  Awaitility. Don't depend on test execution order or shared mutable state.`,
  },
] as const;

export const RULE_BY_ID: Record<string, RulePack> = RULES.reduce(
  (acc, r) => {
    acc[r.id] = r;
    return acc;
  },
  {} as Record<string, RulePack>,
);
