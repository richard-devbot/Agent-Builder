/**
 * Browser-side access to the skill catalog. The index is a static file
 * (public/skill-catalog/index.json), fetched once per page and shared.
 */

import { useEffect, useState } from "react";
import { rawUrl, type CatalogIndex, type CatalogSkill } from "./domains";

export { searchSkills } from "./search";

let indexPromise: Promise<CatalogIndex> | null = null;

export function loadCatalog(): Promise<CatalogIndex> {
  indexPromise ??= fetch("/skill-catalog/index.json").then((r) => {
    if (!r.ok) throw new Error(`Skill catalog unavailable (${r.status})`);
    return r.json() as Promise<CatalogIndex>;
  });
  // A failed load is retried on the next call rather than cached forever.
  indexPromise.catch(() => (indexPromise = null));
  return indexPromise;
}

export function useCatalog(): { index: CatalogIndex | null; error: string | null } {
  const [state, setState] = useState<{ index: CatalogIndex | null; error: string | null }>({ index: null, error: null });
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (index) => live && setState({ index, error: null }),
      (e: Error) => live && setState({ index: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export type FetchedSkill = { body: string; refs: { path: string; contents: string }[] };

/** Download SKILL.md and its flat references, pinned to the indexed commit. */
export async function fetchSkillFiles(skill: CatalogSkill): Promise<FetchedSkill> {
  const url = rawUrl(skill);
  if (!url) throw new Error("No source for this skill");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SKILL.md fetch failed (${res.status})`);
  const body = await res.text();
  const refs = await Promise.all(
    (skill.refs ?? []).map(async (path) => {
      const r = await fetch(rawUrl(skill, path)!);
      return r.ok ? { path, contents: await r.text() } : null;
    }),
  );
  return { body, refs: refs.filter((r): r is { path: string; contents: string } => r !== null) };
}
