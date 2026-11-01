/**
 * Stack-only prompt substitution.
 *
 * This site is a GUIDE — it never substitutes content variables (PRD body,
 * user stories, code, etc.) because the user owns those and fills them in
 * their own IDE. It DOES, as a convenience, substitute "stack" variables
 * (the values the user picked on the intake page) so the user can see at
 * a glance which prompts apply to their stack.
 *
 * Substituted values are wrapped in `[your stack: <value>]` so the user
 * can tell what was filled by us vs what they need to fill themselves.
 */

/**
 * Whitelist of variable names we'll substitute. Includes the canonical
 * intake keys (`frontend`, `backend`, `database`) plus a few common
 * aliases templates use. Anything outside this set stays as `{{name}}`.
 */
export const STACK_VAR_NAMES = new Set<string>([
  // canonical intake keys
  "frontend",
  "backend",
  "database",
  // aliases we sometimes see in template prompts
  "stack",
  "language",
  "framework",
  "test_runner",
  "package_manager",
  "deploy_target",
  "app_type",
  "app_port",
]);

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Substitute only stack variables. Content variables (anything outside the
 * whitelist, e.g. `{{prd}}`, `{{problem_statement}}`) stay intact.
 */
export function fillStackOnly(
  template: string,
  intake: Record<string, string | undefined>,
): string {
  return template.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (!STACK_VAR_NAMES.has(name)) return match; // leave content vars
    const value = intake[name];
    if (value == null || value.trim() === "") return match;
    return `[your stack: ${value.trim()}]`;
  });
}

/**
 * List every `{{var}}` in a template, deduped, in order of appearance.
 * Used to show "this prompt expects these inputs" hints.
 */
export function listPromptVariables(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Split a template's variables into two buckets:
 *   - stack: names we'll substitute (or have already substituted)
 *   - content: names the user must fill themselves in their IDE
 */
export function classifyPromptVariables(template: string): {
  stack: string[];
  content: string[];
} {
  const all = listPromptVariables(template);
  return {
    stack: all.filter((n) => STACK_VAR_NAMES.has(n)),
    content: all.filter((n) => !STACK_VAR_NAMES.has(n)),
  };
}
