/**
 * Kit files for skills picked from the external catalog. Licensed skills are
 * written verbatim (their SKILL.md already carries frontmatter) with their
 * reference files; the rest become `npx skills add` lines in skills-install.sh.
 */

import type { Provider } from "@/lib/kit/build-kit";
import type { KitFile } from "@/lib/kit/zip";
import { sourceUrl, type CatalogSkill } from "@/lib/skill-catalog/domains";
import type { CatalogFetch } from "./use-kit-builder-state";

/** Project skill directory per assistant, as used by the skills CLI (vercel-labs/skills docs/agents.md). */
const SKILLS_DIR: Record<Provider, string> = {
  "claude-code": ".claude/skills",
  copilot: ".github/skills",
  cursor: ".agents/skills",
  "gemini-cli": ".gemini/skills",
  "google-adk": ".agents/skills",
};

/** `--agent` value for the skills CLI; ADK has no CLI target, so installs default to .agents/skills. */
const CLI_AGENT: Partial<Record<Provider, string>> = {
  "claude-code": "claude-code",
  copilot: "github-copilot",
  cursor: "cursor",
  "gemini-cli": "gemini-cli",
};

/** Folder names must be safe path segments. */
const safe = (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "skill";

export function catalogFiles(
  selected: CatalogSkill[],
  fetched: Map<string, CatalogFetch>,
  provider: Provider,
): KitFile[] {
  if (selected.length === 0) return [];
  const files: KitFile[] = [];
  const installs: CatalogSkill[] = [];
  const dir = SKILLS_DIR[provider];

  for (const skill of selected) {
    const f = fetched.get(skill.id);
    if (skill.copyable && f?.status === "ready") {
      const base = `${dir}/${safe(skill.name)}`;
      files.push({ path: `${base}/SKILL.md`, contents: f.files.body });
      for (const ref of f.files.refs) files.push({ path: `${base}/${ref.path}`, contents: ref.contents });
    } else {
      // Install-only by licence, or the download failed: fall back to the CLI.
      installs.push(skill);
    }
  }

  const agent = CLI_AGENT[provider];
  const lines = installs
    .filter((s) => s.install)
    .map((s) => `${s.install}${agent ? ` --agent ${agent}` : ""} --yes`);
  if (lines.length) {
    files.push({
      path: "skills-install.sh",
      contents: [
        "#!/usr/bin/env bash",
        "# Installs catalog skills whose licence does not allow bundling them in this kit.",
        "# Requires Node.js (npx). Review each skill's source before installing.",
        "set -euo pipefail",
        "",
        ...installs.filter((s) => s.install).map((s, i) => `# ${s.title}: ${sourceUrl(s) ?? ""}\n${lines[i]}`),
        "",
      ].join("\n"),
    });
  }

  files.push({
    path: "SKILL-SOURCES.md",
    contents: [
      "# Third-party skills",
      "",
      "Skills in this kit that come from the external catalog, with their source and licence.",
      "",
      "| Skill | Source | Licence | Delivery |",
      "| --- | --- | --- | --- |",
      ...selected.map((s) => {
        const bundled = s.copyable && fetched.get(s.id)?.status === "ready";
        return `| ${s.title} | ${sourceUrl(s) ?? s.repo ?? "-"} | ${s.license ?? "unknown"} | ${bundled ? `bundled in \`${dir}/${safe(s.name)}\`` : "skills-install.sh"} |`;
      }),
      "",
    ].join("\n"),
  });
  return files;
}
