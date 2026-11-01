import Fuse, { type IFuseOptions } from "fuse.js";
import type { Asset } from "./content";

export type SearchHit = Asset;

const FUSE_OPTIONS: IFuseOptions<Asset> = {
  includeScore: false,
  ignoreLocation: true,
  threshold: 0.34,
  minMatchCharLength: 2,
  keys: [
    { name: "title", weight: 6 },
    { name: "description", weight: 4 },
    { name: "category", weight: 2 },
    { name: "tags", weight: 2 },
    { name: "stack", weight: 1.5 },
    { name: "body", weight: 1 },
  ],
};

export function buildIndex(assets: Asset[]): Fuse<Asset> {
  return new Fuse(assets, FUSE_OPTIONS);
}

export function searchAssets(assets: Asset[], query: string): Asset[] {
  const q = query.trim();
  if (!q) return assets;
  const fuse = buildIndex(assets);
  return fuse.search(q).map((r) => r.item);
}

export type SearchEntry = Pick<
  Asset,
  "title" | "description" | "type" | "slug" | "phase" | "category" | "tags" | "stack"
>;

export function toSearchEntries(assets: Asset[]): SearchEntry[] {
  return assets.map((a) => ({
    title: a.title,
    description: a.description,
    type: a.type,
    slug: a.slug,
    phase: a.phase,
    category: a.category,
    tags: a.tags,
    stack: a.stack,
  }));
}
