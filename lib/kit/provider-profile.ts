/**
 * Provider profiles — the single source of truth for how each target tool
 * surfaces the kit.
 *
 * Methodology (what an agent/skill/rule *says*) is authored once, tool-neutral,
 * in `content/`. Delivery (where files land, how the model reaches a capability,
 * what the tool can do) is a separate concern and lives here — one profile per
 * tool. Adding a new tool (Windsurf, Cline, Gemini CLI, JetBrains, …) means
 * adding one entry to `PROVIDER_PROFILES`, not editing methodology or threading
 * a new `case` through the assembler.
 *
 * If you find yourself writing `if (provider === "…")` in build-kit.ts, ask
 * whether the fact you're branching on belongs here as a capability or a path
 * instead.
 */

export type Provider = "claude-code" | "copilot" | "cursor" | "gemini-cli" | "google-adk";

/**
 * What a tool can do mechanically. The assembler branches on these capabilities
 * rather than on the provider id, so behaviour is described declaratively and
 * a new tool inherits the right path by setting flags.
 */
export type ProviderCapabilities = {
  /** Can the model dispatch subagents programmatically (e.g. Claude's Task tool)? */
  dispatchesSubagents: boolean;
  /** Do skills auto-activate by description, or must the agent apply them inline? */
  autoActivatesSkills: boolean;
  /** Does the tool have a native pre-tool hook runtime (vs. portable guard scripts)? */
  hasHookRuntime: boolean;
  /** Does the instruction file auto-import the project-context doc (Claude `@import`)? */
  importsProjectContext: boolean;
  /** Can the user invoke the dedicated discovery agent via `@discovery` in chat? */
  userCanInvokeAgents: boolean;
};

/** One-liners telling the model how to reach each kind of capability. */
export type InvocationHints = {
  agents: string;
  skills: string;
  commands: string;
};

export type ProviderProfile = {
  id: Provider;
  /** Human-readable name shown in the UI and generated READMEs. */
  label: string;
  /** Folder that holds this tool's config (".claude" / ".github" / ".cursor"). */
  configDir: string;
  /** Top-level instruction file the working agreement is written to. */
  instructionFile: string;
  /** Where the kit README lands (inside the tool's own folder). */
  readmePath: string;
  /** Where the discovery agent writes the project-context document. */
  projectContextPath: string;
  capabilities: ProviderCapabilities;
  invocation: InvocationHints;
};

export const PROVIDER_PROFILES: Record<Provider, ProviderProfile> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    configDir: ".claude",
    instructionFile: "CLAUDE.md",
    readmePath: ".claude/README.md",
    projectContextPath: ".claude/project-context.md",
    capabilities: {
      dispatchesSubagents: true,
      autoActivatesSkills: true,
      hasHookRuntime: true,
      importsProjectContext: true,
      userCanInvokeAgents: false,
    },
    invocation: {
      agents: "dispatch via the Task tool (definitions in `.claude/agents/`)",
      skills:
        "auto-activate by their description; their bodies live in `.claude/skills/`",
      commands: "run as `/command` (definitions in `.claude/commands/`)",
    },
  },
  copilot: {
    id: "copilot",
    label: "GitHub Copilot",
    configDir: ".github",
    instructionFile: ".github/copilot-instructions.md",
    readmePath: ".github/README.md",
    projectContextPath: ".github/project-context.md",
    capabilities: {
      dispatchesSubagents: false,
      autoActivatesSkills: false,
      hasHookRuntime: false,
      importsProjectContext: false,
      userCanInvokeAgents: true,
    },
    invocation: {
      agents:
        "the user invokes with `@agent-name` in chat; for inline work follow the agent's guidelines in `.github/agents/`",
      skills:
        "defined in `.github/skills/<name>/SKILL.md`; apply them inline by following their steps",
      commands: "available as prompts in `.github/prompts/`",
    },
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    configDir: ".cursor",
    instructionFile: "AGENTS.md",
    readmePath: ".cursor/README.md",
    projectContextPath: ".cursor/project-context.md",
    capabilities: {
      dispatchesSubagents: false,
      autoActivatesSkills: false,
      hasHookRuntime: false,
      importsProjectContext: false,
      userCanInvokeAgents: false,
    },
    invocation: {
      agents:
        "apply the matching rule in `.cursor/rules/` for the agent's domain",
      skills: "apply the matching skill rule in `.cursor/rules/`",
      commands: "run as `/command` (definitions in `.cursor/commands/`)",
    },
  },
  "gemini-cli": {
    id: "gemini-cli",
    label: "Google Gemini CLI Plugin",
    configDir: ".gemini",
    instructionFile: "GEMINI.md",
    readmePath: ".gemini/README.md",
    projectContextPath: ".gemini/project-context.md",
    capabilities: {
      dispatchesSubagents: false,
      autoActivatesSkills: false,
      hasHookRuntime: false,
      importsProjectContext: false,
      userCanInvokeAgents: false,
    },
    invocation: {
      agents: "defined in `.gemini/agents/<name>.md`; invoke via Gemini CLI chat",
      skills: "defined in `.gemini/skills/<name>/SKILL.md`; apply instructions inline",
      commands: "run via Gemini CLI custom commands in `.gemini/commands/`",
    },
  },
  "google-adk": {
    id: "google-adk",
    label: "Google ADK Enterprise Agent",
    configDir: ".adk",
    instructionFile: "GEMINI.md",
    readmePath: "README.md",
    projectContextPath: ".adk/project-context.md",
    capabilities: {
      dispatchesSubagents: true,
      autoActivatesSkills: false,
      hasHookRuntime: true,
      importsProjectContext: false,
      userCanInvokeAgents: true,
    },
    invocation: {
      agents: "defined as Python `Agent` instances in `<agent_package>/specialists/`",
      skills: "defined in `GEMINI.md` and as Python function tools in `<agent_package>/tools/`",
      commands: "run via ADK CLI: `adk run <agent_package>` or `adk web`",
    },
  },
};

/** Resolve the profile for a target tool. */
export function providerProfile(provider: Provider): ProviderProfile {
  return PROVIDER_PROFILES[provider];
}

/** Backward-compatible label map (kept for existing UI imports). */
export const PROVIDER_LABEL: Record<Provider, string> = {
  "claude-code": PROVIDER_PROFILES["claude-code"].label,
  copilot: PROVIDER_PROFILES.copilot.label,
  cursor: PROVIDER_PROFILES.cursor.label,
  "gemini-cli": PROVIDER_PROFILES["gemini-cli"].label,
  "google-adk": PROVIDER_PROFILES["google-adk"].label,
};
