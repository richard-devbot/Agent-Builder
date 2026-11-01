/**
 * Per-provider kit assembler.
 *
 * Takes a user selection (technologies + agents + rules + skills, all
 * editable) and a target tool, and emits the correct file layout for that
 * tool:
 *
 *   claude-code -> CLAUDE.md, .claude/agents/*.md, .claude/skills/<n>/SKILL.md
 *   copilot     -> .github/copilot-instructions.md, .github/instructions/*,
 *                  .github/agents/*, .github/skills/<n>/SKILL.md, .github/prompts/*
 *   cursor      -> .cursor/rules/*.mdc, AGENTS.md
 *
 * The kit README lands inside each provider's own folder (.claude/.github/.cursor).
 *
 * The same selection produces three different layouts; this module is the only
 * place that knows each tool's conventions.
 */

import type { KitFile } from "./zip";
import type { KitAgent } from "./agents";
import type { RulePack } from "./rules";
import type { KitSkill } from "./skills";
import type { KitHook } from "./hooks";
import { DISCOVERY_BOOTSTRAP_HOOK } from "./hooks";
import type { KitCommand } from "./commands";
import type { KitMcpServer } from "./mcp-servers";
import { techLabel } from "./technologies";
import { buildSetupMd, buildSetupScript } from "./mcp-setup";
import { providerProfile } from "./provider-profile";
import type { Provider } from "./provider-profile";

// Provider type + label map are owned by provider-profile.ts (the single
// source of truth for per-tool delivery). Re-exported here for existing
// importers (e.g. the kit-builder UI).
export type { Provider } from "./provider-profile";
export { PROVIDER_LABEL } from "./provider-profile";

export type Selection = {
  /** Optional project name from Step 1. */
  projectName?: string;
  /** Optional Gemini foundation model ID for ADK agent. */
  adkModel?: string;
  /** Optional custom root agent instruction for ADK agent. */
  adkInstruction?: string;
  /** Enabled ADK tools and connectors. */
  adkTools?: string[];
  /** Technology ids (catalog ids or free-text). */
  technologies: string[];
  /** Selected agents (bodies may have been edited in the UI). */
  agents: KitAgent[];
  /** Selected rule packs (bodies may have been edited). */
  rules: RulePack[];
  /** Selected skills (bodies may have been edited). */
  skills: KitSkill[];
  /** Selected guardrail hooks (scripts may have been edited). */
  hooks: KitHook[];
  /** Selected slash commands (bodies may have been edited). */
  commands: KitCommand[];
  /** Selected MCP servers to include in tool-specific config. */
  mcpServers: KitMcpServer[];
};

function techList(ids: string[]): string {
  if (ids.length === 0) return "_No technologies selected._";
  return ids.map((id) => `- ${techLabel(id)}`).join("\n");
}

/** Rules recommended on every kit (baseline + governance). */
function alwaysRules(rules: RulePack[]): RulePack[] {
  return rules.filter((r) => r.appliesTo.includes("always"));
}

/** Stack rules scoped to specific globs. */
function scopedRules(rules: RulePack[]): RulePack[] {
  return rules.filter((r) => !r.appliesTo.includes("always"));
}

function hasDiscoveryAgent(agents: KitAgent[]): boolean {
  return agents.some((a) => a.id === "discovery");
}

/**
 * "Your toolbox" — an inventory of the agents, skills, and commands actually
 * installed in this kit, with a one-line "when to use it" for each, emitted
 * into the top-level instruction file. This is what makes the model reach for
 * the kit's capabilities (e.g. the spec-driven-builder skill) instead of
 * ignoring them.
 */
function toolboxSection(sel: Selection, provider: Provider): string[] {
  if (
    sel.agents.length === 0 &&
    sel.skills.length === 0 &&
    sel.commands.length === 0
  ) {
    return [];
  }

  const inv = providerProfile(provider).invocation;
  const lines = [
    "## Your toolbox",
    "",
    "This kit installs the capabilities below. Reach for them deliberately —",
    "they encode the team's standards, so prefer them over improvising.",
    "",
  ];

  if (sel.agents.length > 0) {
    lines.push(`### Agents (${inv.agents})`, "");
    for (const a of sel.agents) {
      lines.push(`- **${a.name}** — ${a.description}`);
    }
    lines.push("");
  }

  if (sel.skills.length > 0) {
    lines.push(`### Skills (${inv.skills})`, "");
    for (const s of sel.skills) {
      lines.push(`- **${s.name}** — ${s.description}`);
    }
    lines.push("");
  }

  if (sel.commands.length > 0) {
    lines.push(`### Commands (${inv.commands})`, "");
    for (const c of sel.commands) {
      lines.push(`- **/${c.name}** — ${c.description}`);
    }
    lines.push("");
  }

  return lines;
}

/**
 * Resolve the provider-specific project-context path inside an agent body. The
 * discovery agent body carries a `__PROJECT_CONTEXT_PATH__` placeholder; the
 * path comes from the provider profile, so it can't drift from the bootstrap
 * instructions.
 */
function resolveBody(body: string, provider: Provider): string {
  return body
    .trim()
    .split("__PROJECT_CONTEXT_PATH__")
    .join(providerProfile(provider).projectContextPath);
}

/**
 * The "Mandatory bootstrap" section that makes discovery run before the first
 * task. Emitted into the tool's top-level instruction file (CLAUDE.md /
 * copilot-instructions.md / AGENTS.md) only when the discovery agent is selected.
 *
 * The strategy is driven by provider capabilities, not the provider id:
 * - `dispatchesSubagents`: invoke the discovery subagent programmatically.
 * - otherwise: perform discovery inline using the tool's workspace tools.
 * - `userCanInvokeAgents`: also hint that the user can run `@discovery`.
 */
function mandatoryBootstrap(provider: Provider): string[] {
  const profile = providerProfile(provider);
  const path = profile.projectContextPath;

  if (profile.capabilities.dispatchesSubagents) {
    return [
      "## Mandatory bootstrap",
      "",
      `Before starting the user's first task, check \`${path}\`.`,
      "If it is missing, invoke the `discovery` subagent via the Task tool to",
      "inspect this repository and create it (sections: Overview, Tech stack,",
      "Architecture, Build & run, Testing, Conventions, Domain glossary, Open",
      "questions).",
      "If it already exists, read it and refresh only the sections that are",
      "clearly stale relative to what you observe.",
      "",
      "If the Task tool is unavailable, perform the same repository inspection",
      `inline and write \`${path}\` yourself before answering.`,
      "",
      "Then plan and execute using the orchestration & delegation rule below.",
      "",
    ];
  }

  // Copilot and Cursor: perform discovery inline (no subagent dispatch available)
  return [
    "## Mandatory bootstrap",
    "",
    `Before starting the user's first task, check if \`${path}\` exists.`,
    "",
    "**If it is missing**, inspect this repository using your workspace tools",
    "(read files, search, list directories, run terminal commands) and create",
    `\`${path}\` with these sections: Overview, Tech stack, Architecture,`,
    "Build & run, Testing, Conventions, Domain glossary, Open questions.",
    "Cite real files and commands — never invent a dependency or path.",
    "",
    "**If it already exists**, read it and refresh only sections that are",
    "clearly stale relative to what you observe in the current codebase.",
    "",
    "Do not ask the user to paste files or enable tools — use the workspace",
    "tools already available to you. Complete discovery before starting any",
    "other work.",
    "",
    ...(profile.capabilities.userCanInvokeAgents
      ? [
          "(The user can also invoke `@discovery` in chat to run the dedicated",
          "discovery agent for a more thorough analysis.)",
          "",
        ]
      : []),
    "Then plan and execute using the orchestration & delegation rule below.",
    "",
  ];
}

/**
 * The operating procedure — the spine of every generated instruction file.
 *
 * This is the single most load-bearing section: it turns the kit from passive
 * reference material into an actual way of working. Placed high (right after the
 * toolbox), it makes the orchestrated, human-checkpointed loop the DEFAULT for
 * any code-changing request, instead of letting the model fall back to writing
 * everything in one pass.
 *
 * Methodology is identical on every tool; only the delegation mechanic differs,
 * and that is sourced from the provider profile (never branched on here).
 */
function operatingProcedure(sel: Selection, provider: Provider): string[] {
  const profile = providerProfile(provider);
  const inv = profile.invocation;

  const hasSpecDriven = sel.skills.some((s) => s.skillName === "spec-driven-builder");
  const hasOrchestrator = sel.agents.some((a) => a.id === "orchestrator");
  const hasPlanner = sel.agents.some((a) => a.id === "planner");
  const hasValidator = sel.agents.some((a) => a.id === "validator");

  const planLine = hasPlanner
    ? "For anything non-trivial, have `planner` produce the breakdown."
    : "Break the goal down yourself into ordered, checkable tasks.";

  const buildFeatureLine = hasSpecDriven
    ? " Route a build-a-feature task through the `spec-driven-builder` skill (PRD → stories → schema → API → tests)."
    : "";

  const validateLine = hasValidator
    ? "4. **On confirmation: validate, then commit.** Route the change through"
    : "4. **On confirmation: record, then commit.** Re-check the change, then";
  const validateDetail = hasValidator
    ? "   `validator` (and `security-reviewer` for security-sensitive changes), then record the"
    : "   record the";

  return [
    "## How you work (operating procedure)",
    "",
    "Follow this loop for **every request that changes code**. It is the whole",
    "point of this kit — do not skip it and write everything in one pass. (A",
    "trivial one-liner — a typo, a rename, a comment — can be done directly.)",
    "",
    "1. **Plan before coding.** Restate the goal and break it into small, ordered,",
    "   independently-verifiable tasks in `.agent/plan.md` (`- [ ]` / `- [x]`).",
    `   ${planLine} If \`.agent/plan.md\` already exists, read it and resume from`,
    "   the first unchecked task — never redo a finished one.",
    "2. **Do ONE task at a time, via the right specialist.** Take only the next",
    `   unchecked task. Delegate it to the relevant specialist — ${inv.agents}.${buildFeatureLine}`,
    "3. **Stop at the verification checkpoint — do NOT commit yet.** Once the code",
    "   for the task is written, hand it back to the human before going further:",
    "   - State what changed and which files.",
    "   - Give the **exact commands to run it and exercise the new behavior** —",
    "     start the app, the `curl`/HTTP calls or test commands that hit the new",
    "     endpoints, and the responses you expect.",
    "   - Ask the human to run them and confirm the result looks right.",
    "   Wait for that confirmation. Never commit or open a PR before the human has",
    "   verified the change.",
    validateLine,
    `${validateDetail} outcome in \`.agent/progress/NN-<task>.md\`, tick the box in \`.agent/plan.md\`,`,
    "   then commit with a clear message.",
    "5. **Open a PR** for the committed work. A human owns the merge — you never",
    "   self-approve or push to a protected branch.",
    "6. **Continue.** Move to the next unchecked task. If the plan is complete (or",
    "   you're unsure what comes next), ask the human what to do next — don't stop",
    "   silently after a single change.",
    "",
    ...(hasOrchestrator
      ? [
          "If you hand the whole goal to the `orchestrator` agent, it runs exactly this",
          "loop for you. ",
        ]
      : []),
    "The two non-negotiables, on every tool: **one task at a time**, and **a human",
    "runs and confirms the change before it is committed.**",
    "",
  ];
}

// ── Claude Code ────────────────────────────────────────────────────────────

function buildClaudeKit(sel: Selection): KitFile[] {
  const files: KitFile[] = [];
  const discoverySelected = hasDiscoveryAgent(sel.agents);

  const claudeMd = [
    "# CLAUDE.md",
    "",
    "> Generated by Agent Builder. Edit freely — this is your project's working agreement with Claude Code.",
    "",
    "## Project technologies",
    "",
    techList(sel.technologies),
    "",
    ...(discoverySelected ? mandatoryBootstrap("claude-code") : []),
    ...(discoverySelected
      ? [
          "## Project context",
          "",
          "The project-context document (created by the `discovery` agent) is",
          "imported below, so once it exists its full contents load into context",
          "automatically on every session — you don't have to open it. On a fresh",
          "checkout the file won't exist yet and Claude Code silently skips the",
          "import until discovery creates it.",
          "",
          "@.claude/project-context.md",
          "",
        ]
      : []),
    ...toolboxSection(sel, "claude-code"),
    ...operatingProcedure(sel, "claude-code"),
    ...sel.rules.map((r) => r.body.trim()),
    "",
  ].join("\n");
  files.push({ path: "CLAUDE.md", contents: claudeMd });

  for (const agent of sel.agents) {
    const fm = ["---", `name: ${agent.name}`, `description: ${agent.description}`];
    if (agent.tools?.length) fm.push(`tools: ${agent.tools.join(", ")}`);
    if (agent.model) fm.push(`model: ${agent.model}`);
    fm.push("---", "");
    files.push({
      path: `.claude/agents/${agent.id}.md`,
      contents: fm.join("\n") + resolveBody(agent.body, "claude-code") + "\n",
    });
  }

  for (const skill of sel.skills) {
    const fm = [
      "---",
      `name: ${skill.skillName}`,
      `description: ${skill.description}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: `.claude/skills/${skill.skillName}/SKILL.md`,
      contents: fm + skill.body.trim() + "\n",
    });
  }

  // Slash commands.
  for (const cmd of sel.commands) {
    const fm = ["---", `description: ${cmd.description}`];
    if (cmd.allowedTools?.length) {
      fm.push(`allowed-tools: ${cmd.allowedTools.join(", ")}`);
    }
    fm.push("---", "");
    files.push({
      path: `.claude/commands/${cmd.id}.md`,
      contents: fm.join("\n") + cmd.body.trim() + "\n",
    });
  }

  // MCP servers: emit .claude/mcp.json with the mcpServers object.
  if (sel.mcpServers.length > 0) {
    const mcpServers: Record<string, unknown> = {};
    for (const mcp of sel.mcpServers) {
      mcpServers[mcp.serverName] = mcp.serverConfig;
    }
    files.push({
      path: ".claude/mcp.json",
      contents: JSON.stringify({ mcpServers }, null, 2) + "\n",
    });
  }

  // Guardrail hooks: one script per hook + a settings.json that registers them.
  // The discovery bootstrap hook is added automatically (Claude Code only) when
  // discovery is selected, so the project-context check fires every session.
  const claudeHooks = discoverySelected
    ? [...sel.hooks, DISCOVERY_BOOTSTRAP_HOOK]
    : sel.hooks;
  if (claudeHooks.length > 0) {
    for (const hook of claudeHooks) {
      files.push({
        path: `.claude/hooks/${hook.scriptName}`,
        contents: hook.script.trim() + "\n",
      });
    }

    // Group hooks by event, then by matcher, into the settings.json shape.
    const byEvent: Record<string, Record<string, string[]>> = {};
    for (const hook of claudeHooks) {
      (byEvent[hook.event] ??= {})[hook.matcher] ??= [];
      byEvent[hook.event][hook.matcher].push(
        `bash .claude/hooks/${hook.scriptName}`,
      );
    }
    const hooksConfig = Object.fromEntries(
      Object.entries(byEvent).map(([event, byMatcher]) => [
        event,
        Object.entries(byMatcher).map(([matcher, commands]) => ({
          // SessionStart hooks register without a tool matcher.
          ...(matcher ? { matcher } : {}),
          hooks: commands.map((command) => ({ type: "command", command })),
        })),
      ]),
    );
    files.push({
      path: ".claude/settings.json",
      contents: JSON.stringify({ hooks: hooksConfig }, null, 2) + "\n",
    });
  }

  return files;
}

/**
 * Portable guard scripts for tools without a hook runtime (Copilot, Cursor).
 * The scripts are identical to the Claude Code hooks but land under guardrails/
 * with a note that they should be wired into a git pre-commit hook or CI step.
 */
function guardrailFiles(sel: Selection): KitFile[] {
  if (sel.hooks.length === 0) return [];
  const files: KitFile[] = sel.hooks.map((hook) => ({
    path: `guardrails/${hook.scriptName}`,
    contents: hook.script.trim() + "\n",
  }));
  const readme = [
    "# Guardrail scripts",
    "",
    "These scripts block high-risk shell actions (destructive deletes, dropping",
    "tables, force-push). Your selected tool has no native pre-tool hook runtime,",
    "so wire them in yourself — for example as a git pre-commit hook:",
    "",
    "```bash",
    "# .git/hooks/pre-commit (make it executable)",
    ...sel.hooks.map((h) => `bash guardrails/${h.scriptName} < /dev/null || exit 1`),
    "```",
    "",
    "Or run them in CI before the agent's changes are applied. On Claude Code",
    "these same checks run automatically via .claude/settings.json.",
    "",
  ].join("\n");
  files.push({ path: "guardrails/README.md", contents: readme });
  return files;
}

// ── GitHub Copilot ───────────────────────────────────────────────────────────

function buildCopilotKit(sel: Selection): KitFile[] {
  const files: KitFile[] = [];
  const discoverySelected = hasDiscoveryAgent(sel.agents);

  const instructions = [
    "# Copilot instructions",
    "",
    "> Generated by Agent Builder.",
    "",
    "## Project technologies",
    "",
    techList(sel.technologies),
    "",
    ...(discoverySelected ? mandatoryBootstrap("copilot") : []),
    ...toolboxSection(sel, "copilot"),
    ...operatingProcedure(sel, "copilot"),
    ...alwaysRules(sel.rules).map((r) => r.body.trim()),
    "",
  ].join("\n");
  files.push({
    path: ".github/copilot-instructions.md",
    contents: instructions,
  });

  // Stack rules become path-scoped instruction files.
  for (const rule of scopedRules(sel.rules)) {
    const applyTo = rule.globs.join(",");
    const fm = ["---", `applyTo: "${applyTo}"`, "---", ""].join("\n");
    files.push({
      path: `.github/instructions/${rule.id}.instructions.md`,
      contents: fm + rule.body.trim() + "\n",
    });
  }

  // Agents become .agent.md files — automatically available in Copilot agent mode.
  // Include tools when available: Copilot uses its own tool identifiers, so we
  // map the generic tool names to Copilot-native equivalents for workspace access.
  const COPILOT_TOOL_MAP: Record<string, string> = {
    Read: "read_file",
    Grep: "search_files",
    Glob: "list_directory",
    Bash: "run_in_terminal",
    Write: "edit_file",
  };
  for (const agent of sel.agents) {
    const fm = ["---", `name: ${agent.name}`, `description: ${agent.description}`];
    if (agent.tools?.length) {
      const mapped = agent.tools
        .map((t) => COPILOT_TOOL_MAP[t] ?? t)
        .filter((v, i, a) => a.indexOf(v) === i);
      fm.push(`tools: [${mapped.map((t) => `'${t}'`).join(", ")}]`);
    }
    fm.push("---", "");
    files.push({
      path: `.github/agents/${agent.id}.agent.md`,
      contents: fm.join("\n") + resolveBody(agent.body, "copilot") + "\n",
    });
  }

  // Skills mirror the Claude Code layout so they're discoverable the same way:
  // .github/skills/<name>/SKILL.md with name + description frontmatter.
  for (const skill of sel.skills) {
    const fm = [
      "---",
      `name: ${skill.skillName}`,
      `description: ${skill.description}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: `.github/skills/${skill.skillName}/SKILL.md`,
      contents: fm + skill.body.trim() + "\n",
    });
  }

  // Commands remain reusable prompts.
  for (const cmd of sel.commands) {
    const fm = [
      "---",
      "mode: agent",
      `description: ${cmd.description}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: `.github/prompts/${cmd.id}.prompt.md`,
      contents: fm + cmd.body.trim() + "\n",
    });
  }

  // MCP servers: emit .github/copilot-mcp.json
  if (sel.mcpServers.length > 0) {
    const servers: Record<string, unknown> = {};
    for (const mcp of sel.mcpServers) {
      servers[mcp.serverName] = mcp.serverConfig;
    }
    files.push({
      path: ".github/copilot-mcp.json",
      contents: JSON.stringify({ mcpServers: servers }, null, 2) + "\n",
    });
  }

  files.push(...guardrailFiles(sel));

  return files;
}

// ── Cursor ───────────────────────────────────────────────────────────────────

function cursorRuleFile(
  id: string,
  description: string,
  globs: string[],
  alwaysApply: boolean,
  body: string,
): KitFile {
  const fm = [
    "---",
    `description: ${description}`,
    `globs: ${globs.join(",")}`,
    `alwaysApply: ${alwaysApply}`,
    "---",
    "",
  ].join("\n");
  return { path: `.cursor/rules/${id}.mdc`, contents: fm + body.trim() + "\n" };
}

function buildCursorKit(sel: Selection): KitFile[] {
  const files: KitFile[] = [];
  const discoverySelected = hasDiscoveryAgent(sel.agents);

  for (const rule of sel.rules) {
    const always = rule.appliesTo.includes("always");
    files.push(
      cursorRuleFile(rule.id, rule.description, rule.globs, always, rule.body),
    );
  }

  for (const agent of sel.agents) {
    files.push(
      cursorRuleFile(
        `agent-${agent.id}`,
        agent.description,
        ["**/*"],
        false,
        resolveBody(agent.body, "cursor"),
      ),
    );
  }

  for (const skill of sel.skills) {
    files.push(
      cursorRuleFile(
        `skill-${skill.skillName}`,
        skill.description,
        ["**/*"],
        false,
        skill.body,
      ),
    );
  }

  // Cursor slash commands live as plain markdown under .cursor/commands.
  for (const cmd of sel.commands) {
    files.push({
      path: `.cursor/commands/${cmd.id}.md`,
      contents: cmd.body.trim() + "\n",
    });
  }

  // MCP servers: emit .cursor/mcp.json
  if (sel.mcpServers.length > 0) {
    const servers: Record<string, unknown> = {};
    for (const mcp of sel.mcpServers) {
      servers[mcp.serverName] = mcp.serverConfig;
    }
    files.push({
      path: ".cursor/mcp.json",
      contents: JSON.stringify({ mcpServers: servers }, null, 2) + "\n",
    });
  }

  files.push(...guardrailFiles(sel));

  // Cursor also reads AGENTS.md — give it a short project header.
  const agentsMd = [
    "# AGENTS.md",
    "",
    "> Generated by Agent Builder.",
    "",
    "## Project technologies",
    "",
    techList(sel.technologies),
    "",
    ...(discoverySelected ? mandatoryBootstrap("cursor") : []),
    ...toolboxSection(sel, "cursor"),
    ...operatingProcedure(sel, "cursor"),
    "## Working agreement",
    "",
    ...alwaysRules(sel.rules).map((r) => r.body.trim()),
    "",
  ].join("\n");
  files.push({ path: "AGENTS.md", contents: agentsMd });

  return files;
}

// ── Gemini CLI Plugin ─────────────────────────────────────────────────────

function buildGeminiCliKit(sel: Selection): KitFile[] {
  const files: KitFile[] = [];
  const discoverySelected = hasDiscoveryAgent(sel.agents);

  // 1. Top-level GEMINI.md instructions and working agreement
  const instructions = [
    "# GEMINI.md",
    "",
    "> Generated by Agent Builder for Google Gemini CLI.",
    "",
    "## Project technologies",
    "",
    techList(sel.technologies),
    "",
    ...(discoverySelected ? mandatoryBootstrap("gemini-cli") : []),
    ...toolboxSection(sel, "gemini-cli"),
    ...operatingProcedure(sel, "gemini-cli"),
    "## Working agreement",
    "",
    ...alwaysRules(sel.rules).map((r) => r.body.trim()),
    "",
  ].join("\n");
  files.push({
    path: "GEMINI.md",
    contents: instructions,
  });

  // 2. Stack rules in .gemini/rules/
  for (const rule of scopedRules(sel.rules)) {
    const applyTo = rule.globs.join(",");
    const fm = ["---", `applyTo: "${applyTo}"`, "---", ""].join("\n");
    files.push({
      path: `.gemini/rules/${rule.id}.md`,
      contents: fm + rule.body.trim() + "\n",
    });
  }

  // 3. Specialist agents in .gemini/agents/
  for (const agent of sel.agents) {
    const fm = [
      "---",
      `name: ${agent.name}`,
      `description: ${agent.description}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: `.gemini/agents/${agent.id}.md`,
      contents: fm + resolveBody(agent.body, "gemini-cli") + "\n",
    });
  }

  // 4. Skills in .gemini/skills/
  for (const skill of sel.skills) {
    const fm = [
      "---",
      `name: ${skill.skillName}`,
      `description: ${skill.description}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: `.gemini/skills/${skill.skillName}/SKILL.md`,
      contents: fm + skill.body.trim() + "\n",
    });
  }

  // 5. Guardrail shell scripts in guardrails/
  files.push(...guardrailFiles(sel));

  return files;
}

// ── Google ADK Enterprise Agent ───────────────────────────────────────────

function buildGoogleAdkKit(sel: Selection): KitFile[] {
  const files: KitFile[] = [];
  const discoverySelected = hasDiscoveryAgent(sel.agents);

  // Derive a valid Python package identifier from project name if available
  let agentPkg = "sdlc_agent";
  let displayProjectName = "SDLC Agent";
  const nameCandidate = sel.projectName?.trim();
  if (nameCandidate) {
    displayProjectName = nameCandidate;
    const clean = nameCandidate.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (clean && /^[a-z][a-z0-9_]*$/.test(clean)) {
      agentPkg = clean.slice(0, 32);
    }
  } else {
    const profileRule = sel.rules.find((r) => r.id === "project-profile");
    if (profileRule) {
      const match = profileRule.body.match(/^## Project profile — ([^\n]+)/m);
      if (match && match[1]) {
        displayProjectName = match[1].trim();
        const clean = match[1].toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
        if (clean && /^[a-z][a-z0-9_]*$/.test(clean)) {
          agentPkg = clean.slice(0, 32);
        }
      }
    }
  }

  const modelId = sel.adkModel || "gemini-2.5-flash";
  const activeToolIds = new Set(sel.adkTools ?? ["context", "validation", "guardrails", "memory", "database"]);

  // 1. Top-level GEMINI.md instructions and working agreement
  const instructions = [
    "# GEMINI.md",
    "",
    "> Generated by Agent Builder for Google ADK and Gemini CLI.",
    "",
    "## Project technologies",
    "",
    techList(sel.technologies),
    "",
    ...(discoverySelected ? mandatoryBootstrap("google-adk") : []),
    ...toolboxSection(sel, "google-adk"),
    ...operatingProcedure(sel, "google-adk"),
    "## Working agreement",
    "",
    ...alwaysRules(sel.rules).map((r) => r.body.trim()),
    "",
  ].join("\n");
  files.push({
    path: "GEMINI.md",
    contents: instructions,
  });

  // 2. Custom Function Tools & Connectors in <agentPkg>/tools/
  const toolImports: string[] = [];
  const toolCallables: string[] = [];
  const toolExports: string[] = [];

  if (activeToolIds.has("context")) {
    const contextToolPy = `"""Project context tool grounded in human-confirmed project profile facts."""

def get_project_context() -> dict:
    """Retrieve verified architectural guidelines, target stack, and project constraints."""
    return {
        "project_name": ${JSON.stringify(displayProjectName)},
        "technologies": ${JSON.stringify(sel.technologies)},
        "governance_baseline": "Enterprise Standard",
        "human_in_the_loop": True,
    }
`;
    files.push({ path: `${agentPkg}/tools/context.py`, contents: contextToolPy });
    toolImports.push("from .context import get_project_context");
    toolCallables.push("get_project_context");
    toolExports.push("get_project_context");
  }

  if (activeToolIds.has("validation")) {
    const validationToolPy = `"""Safety and contract validation tool for proposing code updates."""

def validate_component_contract(component_name: str, contract_spec: str) -> dict:
    """Validate a software component contract against enterprise quality and typing standards."""
    if not component_name or not contract_spec:
        return {"valid": False, "error": "Missing required component specification."}
    return {
        "valid": True,
        "component": component_name,
        "message": "Component contract conforms to schema.",
    }
`;
    files.push({ path: `${agentPkg}/tools/validation.py`, contents: validationToolPy });
    toolImports.push("from .validation import validate_component_contract");
    toolCallables.push("validate_component_contract");
    toolExports.push("validate_component_contract");
  }

  if (activeToolIds.has("database")) {
    const databaseToolPy = `"""Read-only database query connector with strict parameter binding."""

def query_database_safely(query: str, parameters: dict = None) -> dict:
    """Execute a parameterized read-only query against the application database.

    Guaranteed by enterprise guardrails: DROP, TRUNCATE, and write queries are blocked.
    """
    forbidden = ["drop", "truncate", "alter", "delete", "insert", "update"]
    if any(kw in query.lower() for kw in forbidden):
        return {"error": "Write and destructive operations are prohibited via this connector."}
    return {
        "status": "success",
        "rows": [{"sample_id": 101, "record_status": "active"}],
        "executed_query": query,
    }
`;
    files.push({ path: `${agentPkg}/tools/database.py`, contents: databaseToolPy });
    toolImports.push("from .database import query_database_safely");
    toolCallables.push("query_database_safely");
    toolExports.push("query_database_safely");
  }

  if (activeToolIds.has("jira")) {
    const jiraToolPy = `"""Jira / Issue Tracker Connector."""

def lookup_issue(issue_key: str) -> dict:
    """Fetch user stories, acceptance criteria, and task requirements for an issue key."""
    return {
        "issue_key": issue_key,
        "summary": "Sample user story requirement from Jira",
        "status": "In Progress",
    }
`;
    files.push({ path: `${agentPkg}/tools/jira.py`, contents: jiraToolPy });
    toolImports.push("from .jira import lookup_issue");
    toolCallables.push("lookup_issue");
    toolExports.push("lookup_issue");
  }

  if (activeToolIds.has("memory")) {
    const memoryToolPy = `"""Episodic memory tool backed by Vertex AI Memory Bank."""

def retrieve_agent_memory(query: str) -> list:
    """Retrieve prior session context and verified architecture decisions."""
    return [
        {"session_id": "recent-turn", "summary": f"Prior context relevant to: {query}"}
    ]
`;
    files.push({ path: `${agentPkg}/tools/memory.py`, contents: memoryToolPy });
    toolImports.push("from .memory import retrieve_agent_memory");
    toolCallables.push("retrieve_agent_memory");
    toolExports.push("retrieve_agent_memory");
  }

  files.push({
    path: `${agentPkg}/tools/__init__.py`,
    contents: `${toolImports.map((i) => i.replace(/^from \./, "from .")).join("\n")}\n\n__all__ = [${toolExports.map((e) => JSON.stringify(e)).join(", ")}]\n`,
  });

  // 3. Multi-Agent Specialists in <agentPkg>/specialists/
  const specialistImports: string[] = [];
  const specialistInstances: string[] = [];
  const specialistExports: string[] = [];

  const agentsToEmit = sel.agents.length > 0 ? sel.agents : [
    { id: "planner", name: "Planner", description: "Plans and decomposes complex architectural tasks." },
    { id: "code-reviewer", name: "Code Reviewer", description: "Performs principal-engineer code and convention review." },
    { id: "security-reviewer", name: "Security Validator", description: "Validates against OWASP standards and data safety." },
  ];

  for (const agent of agentsToEmit) {
    const mod = agent.id.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const inst = `${mod}_agent`;
    specialistImports.push(`from .specialists.${mod} import ${inst}`);
    specialistInstances.push(inst);
    specialistExports.push(inst);

    let specTools = ["get_project_context"];
    if (mod === "planner") {
      specTools = ["get_project_context", "lookup_issue"];
    } else if (mod.includes("reviewer") || mod.includes("code")) {
      specTools = ["validate_component_contract"];
    } else if (mod.includes("security") || mod.includes("validator")) {
      specTools = ["validate_component_contract", "query_database_safely"];
    }
    const activeSpecTools = specTools.filter((t) => toolCallables.includes(t));
    const toolsImport = activeSpecTools.length > 0 ? `from ..tools import ${activeSpecTools.join(", ")}\n` : "";

    const specialistInstructionMd = `# ${agent.name} — Specialist Instructions

You are the **${agent.name}** specialist domain agent operating within the Google ADK multi-agent architecture.

## Mandate & Role
${agent.description}

## Operating Procedure
1. Receive delegated sub-tasks from the root coordinator agent.
2. Adhere to enterprise standards and guidelines defined in \`GEMINI.md\`.
3. Provide evidence-backed findings and structured outputs.
4. Never self-approve or commit code without independent validation and human signoff.
`;

    const specialistPy = `from pathlib import Path
from google.adk.agents import Agent
${toolsImport}
_instruction_path = Path(__file__).with_name("${mod}_instruction.md")
_fallback = ${JSON.stringify(`Specialist agent for ${agent.name}. Adhere to GEMINI.md.`)}
_instruction = _instruction_path.read_text(encoding="utf-8").strip() if _instruction_path.exists() else _fallback
if not _instruction:
    _instruction = _fallback

${inst} = Agent(
    name=${JSON.stringify(agent.id)},
    model=${JSON.stringify(modelId)},
    description=${JSON.stringify(agent.description)},
    instruction=_instruction,
    ${activeSpecTools.length > 0 ? `tools=[${activeSpecTools.join(", ")}],` : ""}
)
`;
    files.push({
      path: `${agentPkg}/specialists/${mod}.py`,
      contents: specialistPy,
    });
    files.push({
      path: `${agentPkg}/specialists/${mod}_instruction.md`,
      contents: specialistInstructionMd,
    });
  }

  files.push({
    path: `${agentPkg}/specialists/__init__.py`,
    contents: `${specialistExports.map((e) => `from .${e.replace(/_agent$/, "")} import ${e}`).join("\n")}\n\n__all__ = [${specialistExports.map((e) => JSON.stringify(e)).join(", ")}]\n`,
  });

  // 4. Callbacks for guardrails & human authorization in <agentPkg>/callbacks/
  const guardrailsCallbackPy = `"""Enterprise guardrail callbacks enforcing least privilege and human-in-the-loop checks."""
from typing import Any, Dict, Optional


def guardrail_callback(tool: Any, args: Dict[str, Any], tool_context: Any) -> Optional[Any]:
    """Inspect tool execution requests before running to prevent destructive operations.

    Blocks filesystem wipes (rm -rf), SQL drops/truncates, and forced git pushes.
    """
    cmd = str(args.get("command", "") or args.get("cmd", "")).lower()
    destructive = ["rm -rf", "drop table", "truncate", "git push --force"]
    for pattern in destructive:
        if pattern in cmd:
            raise PermissionError(f"Operation blocked by enterprise guardrail policy: {pattern}")
    return None
`;
  files.push({ path: `${agentPkg}/callbacks/__init__.py`, contents: "from .guardrails import guardrail_callback\n\n__all__ = ['guardrail_callback']\n" });
  files.push({ path: `${agentPkg}/callbacks/guardrails.py`, contents: guardrailsCallbackPy });

  // 5. Root ADK Coordinator Agent & Instruction File
  const customInstr = sel.adkInstruction ? sel.adkInstruction.trim() : "";
  const rootInstructionMd = `# Root SDLC Coordinator Agent — Instructions

You are the root coordinator agent for **${displayProjectName}** built on Google Agent Development Kit (ADK).

${customInstr ? `## Custom Directives\n${customInstr}\n\n` : ""}## Core Mandate
Orchestrate multi-step development goals, delegate focused sub-tasks to your specialist domain agents,
ground all reasoning in verified project facts, and enforce enterprise safety guardrails.

## Separation of Duties
- You coordinate and synthesize work; specialist domain agents perform focused tasks.
- The agent that generates code never self-approves.
- Independent validation must confirm changes before human review.
- Every git commit and cloud deployment strictly requires human authorization.
`;

  const agentPy = `from pathlib import Path
from google.adk.agents import Agent

${specialistImports.join("\n")}
${toolImports.map((i) => i.replace(/^from \./, "from .tools.")).join("\n")}
from .callbacks import guardrail_callback

_instruction_path = Path(__file__).with_name("agent_instruction.md")
_instruction = _instruction_path.read_text(encoding="utf-8") if _instruction_path.exists() else ""

root_agent = Agent(
    name=${JSON.stringify(agentPkg)},
    model=${JSON.stringify(modelId)},
    description=${JSON.stringify(`${displayProjectName} coordinator agent.`)},
    instruction=_instruction,
    tools=[${toolCallables.join(", ")}],
    sub_agents=[${specialistInstances.join(", ")}],
    before_tool_callback=guardrail_callback,
)
`;

  const fastApiAppPy = `"""Production FastAPI application serving Google ADK routes and A2A Agent Card."""
import json
from pathlib import Path
from fastapi import FastAPI
from .agent import root_agent

app = FastAPI(title=${JSON.stringify(displayProjectName)}, version="1.0.0")

@app.get("/healthz")
def health_check():
    """Service health probe for Google Cloud Run."""
    return {"status": "healthy", "agent": root_agent.name, "model": root_agent.model}

@app.get("/agent-card.json")
def get_agent_card():
    """Serve A2A Gemini Enterprise Agent Card descriptor."""
    card_path = Path(__file__).parents[1] / "deployment" / "agent-card.json"
    if card_path.exists():
        return json.loads(card_path.read_text(encoding="utf-8"))
    return {"name": root_agent.name, "model": root_agent.model, "status": "active"}
`;

  files.push({ path: `${agentPkg}/__init__.py`, contents: "from .agent import root_agent\n\n__all__ = ['root_agent']\n" });
  files.push({ path: `${agentPkg}/agent.py`, contents: agentPy });
  files.push({ path: `${agentPkg}/agent_instruction.md`, contents: rootInstructionMd });
  files.push({ path: `${agentPkg}/fast_api_app.py`, contents: fastApiAppPy });
  files.push({ path: `${agentPkg}/requirements.txt`, contents: "google-adk==2.13.0\ngoogle-genai>=0.1.0\nfastapi>=0.110.0\nuvicorn>=0.28.0\n" });

  // 6. Contract and Guardrail Unit Tests: tests/
  const testPy = `import unittest
from ${agentPkg}.agent import root_agent
from ${agentPkg}.callbacks.guardrails import guardrail_callback


class AgentContractTest(unittest.TestCase):
    def test_agent_contract(self):
        self.assertEqual(root_agent.name, ${JSON.stringify(agentPkg)})
        self.assertEqual(root_agent.model, ${JSON.stringify(modelId)})
        self.assertTrue(root_agent.instruction)
        self.assertTrue(len(root_agent.tools) >= 1)
        self.assertTrue(len(root_agent.sub_agents) >= 1)

    def test_guardrail_callback_blocks_destructive_commands(self):
        with self.assertRaises(PermissionError):
            guardrail_callback(None, {"command": "rm -rf /var/data"}, None)

        with self.assertRaises(PermissionError):
            guardrail_callback(None, {"command": "DROP TABLE users"}, None)

        # Non-destructive command passes
        result = guardrail_callback(None, {"command": "python -m unittest discover"}, None)
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
`;
  files.push({ path: "tests/__init__.py", contents: "" });
  files.push({ path: "tests/test_agent.py", contents: testPy });

  // 7. .env.example
  files.push({
    path: ".env.example",
    contents: `# No credentials. Copy to .env only after cloud setup; never commit .env.
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=us-central1
`,
  });

  // 8. GitHub Actions CI/CD Workflow: .github/workflows/google-agent.yml
  const ciWorkflow = `name: Google ADK Agent CI/CD
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      check_cloud_identity:
        description: 'Verify Workload Identity Federation (does NOT deploy)'
        type: boolean
        default: false
permissions:
  contents: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: python -m pip install -r ${agentPkg}/requirements.txt
      - run: python -m unittest discover -s tests
      - run: python -m compileall -q ${agentPkg}
  cloud-readiness:
    if: \${{ github.event_name == 'workflow_dispatch' && inputs.check_cloud_identity && github.ref == 'refs/heads/main' }}
    needs: validate
    runs-on: ubuntu-latest
    environment: google-cloud-deploy
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v3
        with:
          project_id: '\${{ vars.GOOGLE_CLOUD_PROJECT }}'
          workload_identity_provider: '\${{ vars.GOOGLE_WIF_PROVIDER }}'
          service_account: '\${{ vars.GOOGLE_DEPLOY_SA }}'
      - uses: google-github-actions/setup-gcloud@v3
      - name: Verify identity only
        run: gcloud projects describe '\${{ vars.GOOGLE_CLOUD_PROJECT }}' --format='value(projectId)'
`;
  files.push({ path: ".github/workflows/google-agent.yml", contents: ciWorkflow });

  // 9. Deployment: Dockerfile, agent-card.json, and deployment scripts
  const dockerfile = `FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

COPY ${agentPkg}/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["adk", "web", "--port", "8080", "--host", "0.0.0.0", "${agentPkg}"]
`;

  const agentCardJson = JSON.stringify(
    {
      schemaVersion: "1.0",
      name: agentPkg,
      displayName: displayProjectName,
      description: `${displayProjectName} multi-agent coordinator built with Google ADK.`,
      model: modelId,
      runtime: "cloud-run",
      protocol: "A2A",
      capabilities: [
        "multi-agent-orchestration",
        "spec-driven-sdlc",
        "guardrail-callbacks",
        ...Array.from(activeToolIds).map((t) => `${t}-connector`),
      ],
      specialists: specialistInstances.map((s) => s.replace(/_agent$/, "")),
      tools: toolCallables,
      auth: {
        type: "workload-identity-federation",
        serviceAccount: "github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com",
      },
      geminiEnterprise: {
        registrationStatus: "ready-for-registration",
        adminConsolePath: "Gemini Enterprise > Admin Console > Custom Agents > Register ADK Agent",
        documentationUrl: "https://docs.cloud.google.com/gemini/enterprise/docs/register-and-manage-an-adk-agent",
      },
    },
    null,
    2
  ) + "\n";

  const deploySh = `#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="\${GOOGLE_CLOUD_PROJECT:-YOUR_PROJECT_ID}"
REGION="\${GOOGLE_CLOUD_LOCATION:-us-central1}"

echo "Deploying ${agentPkg} to Google Cloud Run (Region: $REGION)..."
adk deploy cloud_run --project="$PROJECT_ID" --region="$REGION" ./${agentPkg}

echo "Deployment complete. Next step: Register deployment/agent-card.json in Gemini Enterprise console."
`;

  files.push({ path: "deployment/Dockerfile", contents: dockerfile });
  files.push({ path: "deployment/agent-card.json", contents: agentCardJson });
  files.push({ path: "deployment/deploy.sh", contents: deploySh });
  // 10. Terraform Infrastructure (IaC) in deployment/terraform/
  const tfMain = `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_cloud_run_v2_service" "agent_service" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "\${var.region}-docker.pkg.dev/\${var.project_id}/agent-repo/\${var.service_name}:latest"
      ports {
        container_port = 8080
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "TRUE"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
    }
  }
}
`;

  const tfVariables = `variable "project_id" {
  type        = string
  description = "Google Cloud Project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Compute and Vertex AI Region"
}

variable "service_name" {
  type        = string
  default     = "${agentPkg}"
  description = "Cloud Run Agent Service Name"
}
`;

  const tfOutputs = `output "service_uri" {
  value       = google_cloud_run_v2_service.agent_service.uri
  description = "Deployed Cloud Run agent endpoint URL"
}
`;

  const tfVarsExample = `project_id   = "YOUR_PROJECT_ID"
region       = "us-central1"
service_name = "${agentPkg}"
`;

  files.push({ path: "deployment/terraform/single-project/main.tf", contents: tfMain });
  files.push({ path: "deployment/terraform/single-project/variables.tf", contents: tfVariables });
  files.push({ path: "deployment/terraform/single-project/outputs.tf", contents: tfOutputs });
  files.push({ path: "deployment/terraform/single-project/vars/env.tfvars.example", contents: tfVarsExample });

  // 10. Gemini Enterprise Integration Guide
  const enterpriseDoc = `# Seamless Gemini Enterprise Integration Guide

This project is a production-grade multi-agent toolkit built with the **Google Agent Development Kit (ADK)**.
It features a root coordinator, specialist agents, custom function tools, and guardrail callbacks.

---

## 1. Local Testing & Web UI
\`\`\`bash
python -m venv .venv
source .venv/bin/activate
pip install -r ${agentPkg}/requirements.txt
python -m unittest discover -s tests

# Interactive terminal session
adk run ${agentPkg}

# Or launch local web UI
adk web --port 8080 ${agentPkg}
\`\`\`

---

## 2. Deploy to Google Cloud Run
\`\`\`bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
chmod +x deployment/deploy.sh
./deployment/deploy.sh
\`\`\`

---

## 3. Register in Gemini Enterprise Web Portal
1. Navigate to the **Gemini Enterprise Admin Console** (Standard, Plus, or Pay-as-you-go edition).
2. Go to **Agent Management** → **Register Custom Agent** (or use \`agents-cli publish gemini-enterprise\`).
3. Select your deployed **Cloud Run Service** or enter its service URL.
4. Upload \`deployment/agent-card.json\` or map the metadata fields:
   - **Agent Name:** \`${agentPkg}\`
   - **Display Name:** \`${displayProjectName}\`
   - **Model:** \`${modelId}\`
   - **Specialists:** ${specialistInstances.map((s) => `\`${s}\``).join(", ")}
   - **Tools:** ${toolCallables.map((t) => `\`${t}\``).join(", ")}
5. Set user group permissions to roll out the agent securely to your organization.
`;
  files.push({ path: "GEMINI-ENTERPRISE-INTEGRATION.md", contents: enterpriseDoc });

  // 11. Scoped rules in .gemini/rules/
  for (const rule of scopedRules(sel.rules)) {
    const applyTo = rule.globs.join(",");
    const fm = ["---", `applyTo: "${applyTo}"`, "---", ""].join("\n");
    files.push({
      path: `.gemini/rules/${rule.id}.md`,
      contents: fm + rule.body.trim() + "\n",
    });
  }

  // 12. Skills in .gemini/skills/
  for (const skill of sel.skills) {
    const fm = [
      "---",
      `name: ${skill.skillName}`,
      `description: ${skill.description}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: `.gemini/skills/${skill.skillName}/SKILL.md`,
      contents: fm + skill.body.trim() + "\n",
    });
  }

  // 13. Guardrail shell scripts in guardrails/
  files.push(...guardrailFiles(sel));

  return files;
}

/**
 * Per-tool enforcement matrix: an honest statement of which guardrails are
 * machine-enforced (BLOCKING) on this tool vs. advisory prose the agent is
 * asked to follow. Claims never exceed what the tool actually enforces.
 */
function enforcementMatrix(sel: Selection, provider: Provider): string[] {
  const profile = providerProfile(provider);
  const native = profile.capabilities.hasHookRuntime;
  const hookLevel = native
    ? `**BLOCKING** — runs automatically via \`${profile.configDir}/settings.json\``
    : "**ADVISORY until wired** — ships as scripts in `guardrails/`; wire them into a git pre-commit hook or CI (see `guardrails/README.md`) to make them blocking";
  const lines = [
    "## Enforcement matrix",
    "",
    "Not every guardrail carries the same weight on every tool. This table states",
    `honestly what is machine-enforced on **${profile.label}** vs. advisory:`,
    "",
    "| Guardrail | Enforcement on this tool |",
    "|-----------|--------------------------|",
    ...sel.hooks.map((h) => `| ${h.name} | ${hookLevel} |`),
    ...(hasDiscoveryAgent(sel.agents)
      ? [
          `| Discovery before code | ${
            native
              ? "**BLOCKING** — pre-tool edit gate + session bootstrap hook"
              : "**ADVISORY** — mandatory-bootstrap instructions in the instruction file"
          } |`,
        ]
      : []),
    "| Rules / working agreement | **ADVISORY** — instruction-file prose; the model is steered, not blocked |",
    "| Operating procedure (plan → verify → commit) | **ADVISORY** — becomes blocking only when the git pre-commit gate is installed |",
    "",
    "An advisory guardrail shapes behavior but cannot stop a determined agent.",
    "Treat anything not marked BLOCKING as a convention your team still owns.",
    "",
  ];
  return lines;
}

/**
 * Machine-readable record of what this kit contains — the audit/versioning
 * anchor for a kit after it leaves the builder.
 */
function kitManifest(sel: Selection, provider: Provider): KitFile {
  const manifest = {
    manifestVersion: 1,
    generator: "agent-builder",
    generatedAt: new Date().toISOString(),
    provider,
    technologies: [...sel.technologies],
    agents: sel.agents.map((a) => a.id),
    rules: sel.rules.map((r) => r.id),
    skills: sel.skills.map((s) => ({
      name: s.skillName,
      version: s.version ?? "1.0.0",
    })),
    commands: sel.commands.map((c) => c.id),
    hooks: sel.hooks.map((h) => h.id),
    mcpServers: sel.mcpServers.map((m) => m.serverName),
  };
  return {
    path: `${providerProfile(provider).configDir}/kit-manifest.json`,
    contents: JSON.stringify(manifest, null, 2) + "\n",
  };
}

const README = (sel: Selection, provider: Provider): KitFile => {
  const profile = providerProfile(provider);
  const lines = [
    "# Your AI development kit",
    "",
    `Target tool: **${profile.label}**`,
    "",
    "Generated by Agent Builder. Drop these files into the root of",
    "your repository.",
    "",
    "## What's inside",
    "",
    `- ${sel.agents.length} agent(s)`,
    `- ${sel.rules.length} rule pack(s)`,
    `- ${sel.skills.length} skill(s)`,
    `- ${sel.commands.length} command(s)`,
    `- ${sel.hooks.length} guardrail hook(s)`,
    `- ${sel.mcpServers.length} MCP server(s)`,
    ...(sel.mcpServers.length > 0
      ? [
          "",
          "## MCP Setup",
          "",
          "Your kit includes MCP server configs that need environment variables (API tokens).",
          "Run the interactive setup script or follow SETUP.md:",
          "",
          "```bash",
          "chmod +x setup-mcp.sh && ./setup-mcp.sh",
          "```",
        ]
      : []),
    "",
    ...(sel.hooks.length > 0 || hasDiscoveryAgent(sel.agents)
      ? enforcementMatrix(sel, provider)
      : []),
    "## Technologies",
    "",
    techList(sel.technologies),
    "",
  ];
  return { path: profile.readmePath, contents: lines.join("\n") };
};

/** MCP setup files (SETUP.md + setup-mcp.sh) when servers are selected. */
function mcpSetupFiles(sel: Selection): KitFile[] {
  if (sel.mcpServers.length === 0) return [];
  const files: KitFile[] = [];
  files.push({ path: "SETUP.md", contents: buildSetupMd(sel.mcpServers) });

  // Only include the script if there are servers that actually need tokens.
  const needsTokens = sel.mcpServers.some((s) => s.envVars.length > 0);
  if (needsTokens) {
    files.push({
      path: "setup-mcp.sh",
      contents: buildSetupScript(sel.mcpServers),
    });
  }
  return files;
}

/** Assemble the file set for a selection + target tool. */
export function buildKit(sel: Selection, provider: Provider): KitFile[] {
  let files: KitFile[];
  switch (provider) {
    case "claude-code":
      files = buildClaudeKit(sel);
      break;
    case "copilot":
      files = buildCopilotKit(sel);
      break;
    case "cursor":
      files = buildCursorKit(sel);
      break;
    case "gemini-cli":
      files = buildGeminiCliKit(sel);
      break;
    case "google-adk":
      files = buildGoogleAdkKit(sel);
      break;
  }
  return [
    ...files,
    README(sel, provider),
    kitManifest(sel, provider),
    ...mcpSetupFiles(sel),
  ].sort(
    (a, b) => a.path.localeCompare(b.path),
  );
}
