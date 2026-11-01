/**
 * Skill loader for the Claude Kit Builder.
 *
 * Skills live as curated MDX under content/skills. Each skill embeds its
 * SKILL.md body inside a ` ```markdown ` fence. This module reads those files
 * at build time (via lib/content) and projects them into the tool-agnostic
 * `KitSkill` shape the assembler consumes:
 *   - Claude Code -> .claude/skills/<skillName>/SKILL.md
 *   - Copilot     -> .github/skills/<skillName>/SKILL.md
 *   - Cursor      -> .cursor/rules/<skillName>.mdc
 *
 * `recommendedFor` maps a skill to technology ids (see technologies.ts) so the
 * builder can auto-select it. "always" = recommended on every kit.
 */

import { extractSkillMd, getAssetsByType } from "../content";
import { SKILL_GROUPS, type SkillGroup } from "./skill-groups";

export { SKILL_GROUPS, type SkillGroup };

export type KitSkill = {
  /** Asset slug (stable id used in the picker). */
  slug: string;
  /** Human title. */
  name: string;
  /** Directory/file name used in the emitted skill (.claude/skills/<skillName>). */
  skillName: string;
  description: string;
  /** Tech ids that auto-recommend this skill; "always" = every kit. */
  recommendedFor: string[];
  /** Filter group label shown as a tab in the skill picker. */
  group: SkillGroup;
  /** SKILL.md markdown body, ready to drop into a kit. */
  body: string;
  /** Semantic content version from the asset's frontmatter. */
  version?: string;
};

const PHASE_GROUP: Record<string, SkillGroup> = {
  discover: "Discover & plan",
  design: "Design",
  build: "Build",
  test: "Test & QA",
  deploy: "Deploy & docs",
};

const SECURITY_CATEGORIES = new Set([
  "security-review",
  "secure-coding",
  "governance",
]);
const SECURITY_TAGS = new Set([
  "security",
  "governance",
  "guardrails",
  "owasp",
  "asvs",
  "appsec",
  "compliance",
]);

/** Security & governance skills surface in their own group regardless of phase. */
function skillGroup(
  phase: string,
  category: string,
  tags: string[],
): SkillGroup {
  if (
    SECURITY_CATEGORIES.has(category) ||
    tags.some((t) => SECURITY_TAGS.has(t.toLowerCase()))
  ) {
    return "Security & governance";
  }
  return PHASE_GROUP[phase] ?? "Build";
}

/**
 * Maps a skill slug to the technology ids that should auto-recommend it.
 * A slug absent from this map is still offered in the picker, just not
 * auto-selected (recommendedFor defaults to []).
 */
const RECOMMENDED_FOR: Record<string, string[]> = {
  "owasp-security-review-skill": ["always"],
  "secure-coding-guardrails-skill": ["always"],
  "pr-governance-gate-skill": ["github-actions", "azure-devops"],
  "code-reviewer-skill": ["always"],
  "test-generator-skill": ["jest", "pytest", "java", "spring-boot"],
  "documentation-skill": ["always"],
  "dependency-audit-skill": ["node", "javascript", "python"],
  "data-validation-skill": ["python", "fastapi", "django"],
  "component-library-skill": ["react", "nextjs", "angular", "vue"],
  "performance-profiler-skill": ["node", "python"],
  "database-migration-skill": ["sql", "postgres", "mysql", "sqlserver"],
  "spec-driven-builder": ["always"],
  "frontend-design-skill": ["react", "nextjs", "vue", "angular", "tailwind"],
  "code-coverage-skill": ["jest", "react", "typescript", "github-actions"],
  "brand-guidelines-skill": ["react", "nextjs", "tailwind"],
};

/**
 * Load all skills as KitSkill records. Server-only (reads the filesystem via
 * lib/content). Skills whose MDX lacks a ` ```markdown ` block fall back to
 * their description so the kit still emits a usable SKILL.md.
 */
export async function getKitSkills(): Promise<KitSkill[]> {
  const skills = await getAssetsByType("skill");

  return skills
    .map((asset): KitSkill | null => {
      if (asset.type !== "skill") return null;
      const md = extractSkillMd(asset.body);
      const body =
        md ?? `# ${asset.title}\n\n${asset.description}\n`;
      return {
        slug: asset.slug,
        name: asset.title,
        skillName: asset.skillName,
        description: asset.description,
        recommendedFor: RECOMMENDED_FOR[asset.slug] ?? [],
        group: skillGroup(asset.phase, asset.category, asset.tags ?? []),
        body,
        version: asset.version,
      } satisfies KitSkill;
    })
    .filter((s): s is KitSkill => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
