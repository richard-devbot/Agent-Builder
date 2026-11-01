/**
 * Guardrail hooks for the Claude Kit Builder.
 *
 * A hook is a deterministic, non-AI safety check that runs *before* a tool
 * call and can BLOCK it. Unlike a rule (advice the agent may follow) or a skill
 * (behavior the agent performs), a hook is enforced by the runtime — the agent
 * cannot talk its way past it.
 *
 * These compile to:
 *   - Claude Code -> .claude/settings.json (hooks config) + .claude/hooks/<file>
 *   - Copilot     -> guardrails/<file> (+ README note; Copilot has no hook runtime)
 *   - Cursor      -> guardrails/<file> (+ README note; wire as a git pre-commit)
 *
 * The default set targets the highest-blast-radius destructive actions an agent
 * can take from a shell: deleting folders, dropping/truncating database tables,
 * and force-pushing over shared history.
 *
 * `recommendedFor` mirrors rules/skills: "always" = on for every kit.
 */

export type HookEvent = "PreToolUse" | "PostToolUse" | "SessionStart";

export type KitHook = {
  /** Stable id used in the picker and as the script base name. */
  id: string;
  /** Human title. */
  name: string;
  description: string;
  /** Tech ids that auto-select this hook; "always" = every kit. */
  recommendedFor: string[];
  /** Claude Code hook event. */
  event: HookEvent;
  /** Tool name this hook matches (e.g. "Bash"). Empty for SessionStart hooks,
   *  which register without a tool matcher. */
  matcher: string;
  /** File name written under .claude/hooks/ (and guardrails/ for other tools). */
  scriptName: string;
  /** POSIX shell script body. Exit code 2 blocks the tool call. */
  script: string;
};

const SHEBANG = "#!/usr/bin/env bash";

/** Shared preamble: read the PreToolUse payload and extract the bash command. */
const EXTRACT_CMD = `payload="$(cat)"
# Pull the command out of the JSON payload; fall back to the raw payload.
cmd="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception:
    pass' 2>/dev/null)"
[ -z "$cmd" ] && cmd="$payload"`;

export const HOOKS: readonly KitHook[] = [
  {
    id: "block-destructive-fs",
    name: "Block destructive folder deletes",
    description:
      "Refuses recursive force deletes (rm -rf / rm -fr) from the agent. The single most common way an agent wipes a working tree.",
    recommendedFor: ["always"],
    event: "PreToolUse",
    matcher: "Bash",
    scriptName: "block-destructive-fs.sh",
    script: `${SHEBANG}
# Agent Builder guardrail: block destructive filesystem deletions (PreToolUse / Bash).
# Exit 2 blocks the tool call and returns the message to the agent.
${EXTRACT_CMD}

if printf '%s' "$cmd" | grep -Eiq 'rm[[:space:]]+-[a-z]*r[a-z]*f|rm[[:space:]]+-[a-z]*f[a-z]*r|rm[[:space:]]+-r[[:space:]]+-f|rm[[:space:]]+-f[[:space:]]+-r|git[[:space:]]+clean[[:space:]]+-[a-z]*f[a-z]*d|find[[:space:]].*-delete'; then
  echo "BLOCKED by Agent Builder guardrail (block-destructive-fs): a recursive/force delete (e.g. 'rm -rf') is not permitted from the agent. If this is truly intended, run it yourself in a terminal." >&2
  exit 2
fi
exit 0
`,
  },
  {
    id: "block-destructive-sql",
    name: "Block dropping / truncating tables",
    description:
      "Refuses DROP TABLE/DATABASE/SCHEMA and TRUNCATE in shell commands (psql, mysql, sqlcmd, migration runners). Stops irreversible data loss.",
    recommendedFor: ["always"],
    event: "PreToolUse",
    matcher: "Bash",
    scriptName: "block-destructive-sql.sh",
    script: `${SHEBANG}
# Agent Builder guardrail: block destructive SQL (PreToolUse / Bash).
${EXTRACT_CMD}

if printf '%s' "$cmd" | grep -Eiq 'drop[[:space:]]+(table|database|schema)|truncate[[:space:]]+(table[[:space:]]+)?[a-z0-9_."\`\\[]'; then
  echo "BLOCKED by Agent Builder guardrail (block-destructive-sql): DROP TABLE/DATABASE/SCHEMA and TRUNCATE are not permitted from the agent. Use a reviewed, reversible migration instead, or run it yourself against the right environment." >&2
  exit 2
fi
exit 0
`,
  },
  {
    id: "block-force-push",
    name: "Block force-push to shared history",
    description:
      "Refuses 'git push --force' / '-f' (allows --force-with-lease). Prevents the agent from overwriting teammates' commits on a shared branch.",
    recommendedFor: ["always"],
    event: "PreToolUse",
    matcher: "Bash",
    scriptName: "block-force-push.sh",
    script: `${SHEBANG}
# Agent Builder guardrail: block force-push (PreToolUse / Bash).
${EXTRACT_CMD}

if printf '%s' "$cmd" | grep -Eiq 'git[[:space:]]+push' \\
  && printf '%s' "$cmd" | grep -Eiq -- '--force([^-]|$)|(^|[[:space:]])-f([[:space:]]|$)' \\
  && ! printf '%s' "$cmd" | grep -Eiq -- '--force-with-lease'; then
  echo "BLOCKED by Agent Builder guardrail (block-force-push): 'git push --force' is not permitted from the agent. Use '--force-with-lease' if you must rewrite, and confirm the branch is not shared." >&2
  exit 2
fi
exit 0
`,
  },
] as const;

export const HOOK_BY_ID: Record<string, KitHook> = HOOKS.reduce(
  (acc, h) => {
    acc[h.id] = h;
    return acc;
  },
  {} as Record<string, KitHook>,
);

/**
 * Discovery bootstrap hook (Claude Code only).
 *
 * Not part of the user-pickable HOOKS catalog and not a guardrail: it is emitted
 * automatically by `buildClaudeKit` when the discovery agent is selected, so the
 * project-context check fires deterministically at the start of every Claude Code
 * session. A hook cannot launch a subagent itself; it injects a reminder via
 * `additionalContext`, and the matching "Mandatory bootstrap" section in CLAUDE.md
 * is what the main agent acts on (run `discovery` before the first task).
 *
 * Copilot and Cursor have no hook runtime, so they rely on their instruction-file
 * bootstrap instead — this hook is intentionally never emitted for them.
 */
export const DISCOVERY_BOOTSTRAP_HOOK: KitHook = {
  id: "discovery-bootstrap",
  name: "Run discovery before first task",
  description:
    "At session start, checks for the project-context document and reminds the agent to run the discovery agent (creating it) before doing any work.",
  recommendedFor: ["always"],
  event: "SessionStart",
  matcher: "",
  scriptName: "discovery-bootstrap.sh",
  script: `${SHEBANG}
# Agent Builder bootstrap: ensure project-context.md exists before work begins (SessionStart).
# A hook can't launch a subagent, so it injects guidance via additionalContext;
# the "Mandatory bootstrap" section in CLAUDE.md tells the agent to act on it.
# The message text below contains no double-quotes or backslashes, so it is
# embedded directly into the JSON (no python/jq dependency).
context_file=".claude/project-context.md"
if [ -f "$context_file" ]; then
  msg="$context_file exists -- read it for project context. If it is clearly stale relative to the repository, refresh the stale sections via the 'discovery' subagent before major work."
else
  msg="No $context_file found. Before starting the user's first task, run the 'discovery' subagent (via the Task tool) to inspect this repository and create $context_file. If the subagent cannot be launched, perform the same repository inspection inline and write $context_file yourself, then continue."
fi
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\\n' "$msg"
exit 0
`,
};
