/**
 * Slash commands for the Claude Kit Builder.
 *
 * A command is a reusable, user-invoked prompt (e.g. /pr-generation). It packages
 * a repeatable task so a developer triggers it by name instead of re-typing the
 * instructions.
 *
 * These compile to:
 *   - Claude Code -> .claude/commands/<name>.md  (frontmatter: description, allowed-tools)
 *   - Copilot     -> .github/prompts/<name>.prompt.md  (mode: agent, description)
 *   - Cursor      -> .cursor/commands/<name>.md  (plain markdown body)
 *
 * Bodies are written in portable prose (they reference the git commands to run
 * rather than relying on a tool-specific embedding syntax), so the same body
 * works across all three tools. `allowedTools` lists the Bash commands the
 * task needs; the Claude Code emitter turns it into an `allowed-tools` header.
 *
 * `recommendedFor` mirrors rules/skills: "always" = on for every kit.
 */

export type KitCommand = {
  /** Stable id; also the slash-command name and file base name. */
  id: string;
  /** Human title shown in the picker. */
  name: string;
  description: string;
  /** Tech ids that auto-select this command; "always" = every kit. */
  recommendedFor: string[];
  /** Bash command patterns the command needs (Claude Code allowed-tools). */
  allowedTools?: string[];
  /** Markdown prompt body, portable across tools. */
  body: string;
};

export const COMMANDS: readonly KitCommand[] = [
  {
    id: "pr-generation",
    name: "pr-generation",
    description:
      "Generate a pull request title and description from the current branch's changes, with a summary, change list, test notes, and risk callouts.",
    recommendedFor: ["always"],
    allowedTools: ["Bash(git diff:*)", "Bash(git log:*)", "Bash(git branch:*)"],
    body: `# /pr-generation

Generate a clear, reviewer-friendly pull request title and description from the
changes on the current branch.

First gather context:
- Run \`git branch --show-current\` for the branch name.
- Run \`git log --oneline origin/HEAD..HEAD\` (or against \`main\`/\`master\`) for the commit history.
- Run \`git diff origin/HEAD...HEAD\` (or against \`main\`/\`master\`) to read the actual changes.

Then produce, in Markdown:

**Title** — a concise, conventional-commit-style summary (e.g. \`feat(auth): add refresh-token rotation\`). Max ~70 chars.

**Description** with these sections:
- **Summary** — 2–4 sentences: what changed and why.
- **Changes** — bulleted list of the meaningful changes (group by area; skip noise).
- **How to test** — concrete steps or commands a reviewer runs to verify.
- **Risk & rollback** — blast radius, data/migration impact, how to revert.
- **Checklist** — tests added/updated, docs updated, no secrets, breaking changes called out.

Rules: describe what the diff actually does — don't invent features that aren't in
the changes. Link the work item if the branch name or commits reference one. Keep
it skimmable: a reviewer should understand the PR in under a minute.`,
  },
  {
    id: "commit-message",
    name: "commit-message",
    description:
      "Write a Conventional Commits message from the staged changes — a focused subject plus an explanatory body.",
    recommendedFor: ["always"],
    allowedTools: ["Bash(git diff:*)", "Bash(git status:*)"],
    body: `# /commit-message

Write a high-quality commit message for the currently staged changes.

First gather the diff:
- Run \`git status\` to confirm what is staged.
- Run \`git diff --staged\` to read the staged changes. If nothing is staged, say so and stop.

Then output a single commit message in **Conventional Commits** format:

\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

- **type**: feat | fix | refactor | perf | test | docs | build | ci | chore.
- **subject**: imperative mood, lower-case, no trailing period, ≤ 72 chars.
- **body**: wrap at ~72 cols; explain *why* the change was made, not just what.
  Omit if the subject is fully self-explanatory.
- **footer**: \`BREAKING CHANGE:\` notes and issue/work-item references.

Rules: describe only what the staged diff contains. One logical change per commit —
if the diff spans unrelated changes, point that out and suggest splitting it.`,
  },
  {
    id: "continue",
    name: "continue",
    description:
      "Resume the iterative execution loop: read the durable plan, pick up from the first unchecked task, and keep going until the plan is done.",
    recommendedFor: ["always"],
    allowedTools: ["Bash(cat:*)", "Bash(ls:*)"],
    body: `# /continue

Resume in-progress work from the durable plan instead of starting over. Use this
after a break, a restart, or a fresh session.

First, load the state:
- Read \`.agent/plan.md\`. If it doesn't exist, there's nothing to resume — say so
  and offer to start a new plan (delegate to the \`orchestrator\` agent if it's
  installed, otherwise run the iterative execution loop yourself).
- List \`.agent/progress/\` and read the most recent notes to recover the context
  of what's already done. Trust these notes — do NOT redo a checked task.

Then resume the loop:
1. Restate the goal and report progress: which tasks are checked, which is next.
2. Pick the **first unchecked task** in \`.agent/plan.md\`.
3. Execute it (route a build-a-feature task through the \`spec-driven-builder\`
   skill; delegate to the right specialist where appropriate).
4. Validate, then write \`.agent/progress/NN-<task>.md\`, check the box in
   \`.agent/plan.md\`, and update the "current state" section.
5. Continue to the next task until every box is checked.

Rules: one task at a time, record intermediate outputs before moving on, and never
skip a governance hook or failing check to make progress — surface the blocker in
\`.agent/plan.md\` and stop.`,
  },
] as const;

export const COMMAND_BY_ID: Record<string, KitCommand> = COMMANDS.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<string, KitCommand>,
);
