import { promises as fs } from "node:fs";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import {
  ASSET_TYPES,
  type AssetFrontmatter,
  type AssetType,
  assetFrontmatterSchema,
} from "./schema";

const CONTENT_DIR = path.join(process.cwd(), "content");

const TYPE_TO_FOLDER: Record<AssetType, string> = {
  template: "templates",
  skill: "skills",
  "mcp-config": "mcp-configs",
  playbook: "playbooks",
};

export type Asset = AssetFrontmatter & {
  body: string;
  filePath: string;
};

async function readMdxFiles(type: AssetType): Promise<Asset[]> {
  const folder = path.join(CONTENT_DIR, TYPE_TO_FOLDER[type]);

  let entries: string[];
  try {
    entries = await fs.readdir(folder);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const mdxFiles = entries.filter((name) => name.endsWith(".mdx"));

  return Promise.all(
    mdxFiles.map(async (filename) => {
      const filePath = path.join(folder, filename);
      const raw = await fs.readFile(filePath, "utf-8");
      const { data, content } = matter(raw);

      const parsed = assetFrontmatterSchema.safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        throw new Error(
          `Invalid frontmatter in ${path.relative(process.cwd(), filePath)}:\n${issues}`,
        );
      }

      const fm = parsed.data;
      if (fm.type !== type) {
        throw new Error(
          `Type mismatch in ${path.relative(process.cwd(), filePath)}: ` +
            `frontmatter says "${fm.type}" but file is in "${TYPE_TO_FOLDER[type]}/"`,
        );
      }

      const expectedFilename = `${fm.slug}.mdx`;
      if (filename !== expectedFilename) {
        throw new Error(
          `Filename/slug mismatch: ${path.relative(process.cwd(), filePath)} ` +
            `should be named "${expectedFilename}" to match slug "${fm.slug}"`,
        );
      }

      return { ...fm, body: content, filePath };
    }),
  );
}

export const getAllAssets = cache(async (): Promise<Asset[]> => {
  const groups = await Promise.all(ASSET_TYPES.map(readMdxFiles));
  const assets = groups.flat();

  const seen = new Map<string, string>();
  for (const a of assets) {
    const key = `${a.type}:${a.slug}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate slug "${a.slug}" for type "${a.type}": ` +
          `${seen.get(key)} and ${a.filePath}`,
      );
    }
    seen.set(key, a.filePath);
  }

  // Validate that every playbook step's PRIMARY asset references an
  // existing asset. Alternatives, relevant skills, and relevant MCP
  // configs may reference forward-looking slugs that aren't in the
  // repo yet — those are skipped at render time, not failed at build.
  const slugIndex = new Set(assets.map((a) => a.slug));
  for (const a of assets) {
    if (a.type !== "playbook") continue;
    for (const s of a.steps) {
      if (!slugIndex.has(s.primaryAsset)) {
        throw new Error(
          `Playbook "${a.slug}" step ${s.number} primary asset "${s.primaryAsset}" not found`,
        );
      }
    }
  }

  return assets.sort((a, b) => a.title.localeCompare(b.title));
});

export async function getAllPlaybooks(): Promise<
  Extract<Asset, { type: "playbook" }>[]
> {
  const all = await getAllAssets();
  return all.filter(
    (a): a is Extract<Asset, { type: "playbook" }> => a.type === "playbook",
  );
}

export async function getPlaybookBySlug(
  slug: string,
): Promise<Extract<Asset, { type: "playbook" }> | null> {
  const all = await getAllAssets();
  const found = all.find((a) => a.type === "playbook" && a.slug === slug);
  return (found as Extract<Asset, { type: "playbook" }> | undefined) ?? null;
}

/**
 * Pull the first ` ```text ... ``` ` (or ` ```prompt ... ```) block out of an
 * MDX body — that's the substitutable prompt body.
 *
 * Used by playbook step pages to fill `{{variables}}` and present the
 * filled prompt for copy/paste.
 */
export function extractPromptBody(body: string): string | null {
  const match = body.match(/```(?:text|prompt)\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

export async function getAssetsByType(type: AssetType): Promise<Asset[]> {
  const all = await getAllAssets();
  return all.filter((a) => a.type === type);
}

export async function getAssetBySlug(
  type: AssetType,
  slug: string,
): Promise<Asset | null> {
  const all = await getAllAssets();
  return all.find((a) => a.type === type && a.slug === slug) ?? null;
}

export async function getAssetsByCategory(category: string): Promise<Asset[]> {
  const all = await getAllAssets();
  return all.filter((a) => a.category === category);
}

export async function getAssetsByPhase(
  phase: AssetFrontmatter["phase"],
): Promise<Asset[]> {
  const all = await getAllAssets();
  return all.filter((a) => a.phase === phase);
}

export async function getFeaturedAssets(): Promise<Asset[]> {
  const all = await getAllAssets();
  return all.filter((a) => a.featured);
}

export function extractSkillMd(body: string): string | null {
  // Match a fenced ```markdown block, supporting longer fences (````markdown)
  // so embedded SKILL.md content can itself contain ``` code fences without
  // being truncated. The closing fence must use the same number of backticks.
  const match = body.match(/(`{3,})markdown\s*\n([\s\S]*?)\n\1/);
  return match ? match[2].trim() : null;
}

export async function getRelatedAssets(
  asset: Asset,
  limit = 4,
): Promise<Asset[]> {
  const all = await getAllAssets();
  const others = all.filter(
    (a) => !(a.type === asset.type && a.slug === asset.slug),
  );

  const explicit = new Set(asset.relatedAssets ?? []);
  const explicitMatches = others.filter((a) => explicit.has(a.slug));

  const assetTags = new Set([...(asset.tags ?? []), ...(asset.stack ?? [])]);
  const ranked = others
    .filter((a) => !explicit.has(a.slug))
    .map((a) => {
      const otherTags = new Set([...(a.tags ?? []), ...(a.stack ?? [])]);
      let overlap = 0;
      for (const t of assetTags) if (otherTags.has(t)) overlap++;
      const samePhase = a.phase === asset.phase ? 1 : 0;
      const sameCategory = a.category === asset.category ? 2 : 0;
      return { asset: a, score: overlap + samePhase + sameCategory };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.asset);

  return [...explicitMatches, ...ranked].slice(0, limit);
}
