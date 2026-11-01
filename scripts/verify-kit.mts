/**
 * Regression harness: builds a full kit (every agent/rule/command/hook/skill/
 * MCP server in the catalog) for all three providers and prints a stable JSON
 * snapshot of paths + contents. Run on `main` and on the branch; the two
 * snapshots must be byte-identical to prove the ProviderProfile refactor is
 * behaviour-preserving.
 */
import { buildKit, type Selection, type Provider } from "../lib/kit/build-kit";
import { AGENTS } from "../lib/kit/agents";
import { RULES } from "../lib/kit/rules";
import { COMMANDS } from "../lib/kit/commands";
import { HOOKS } from "../lib/kit/hooks";
import { getKitSkills } from "../lib/kit/skills";
import { getKitMcpServers } from "../lib/kit/mcp-servers";

const PROVIDERS: Provider[] = ["claude-code", "copilot", "cursor"];

async function main() {
  const skills = await getKitSkills();
  const mcpServers = await getKitMcpServers();
  const sel: Selection = {
    technologies: ["nextjs", "typescript", "postgres"],
    agents: [...AGENTS],
    rules: [...RULES],
    skills,
    hooks: [...HOOKS],
    commands: [...COMMANDS],
    mcpServers,
  };

  const out: Record<string, { path: string; contents: string }[]> = {};
  for (const p of PROVIDERS) {
    out[p] = buildKit(sel, p)
      .map((f) => ({ path: f.path, contents: f.contents }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
