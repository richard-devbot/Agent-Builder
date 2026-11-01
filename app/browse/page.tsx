import Link from "next/link";
import { ArrowRight, Library, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AssetTile, PHASE_ICON, TYPE_ICON, TYPE_LABEL } from "@/components/asset-card";
import { AssetMarquee } from "@/components/asset-marquee";
import { AssetRail } from "@/components/asset-rail";
import { LibraryTabs } from "@/components/library-tabs";
import { DOMAIN_ACCENT, DOMAIN_ICON } from "@/components/skill-catalog/domain-icon";
import { DOMAINS } from "@/lib/skill-catalog/domains";
import { getCatalogIndex, getCuratedCatalogSkills } from "@/lib/skill-catalog/server";
import { EmptyState } from "@/components/empty-state";
import { FilterPanel, type FilterGroup } from "@/components/filter-panel";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { getAllAssets, getAllPlaybooks, type Asset } from "@/lib/content";
import { ASSET_TYPES, PHASES } from "@/lib/schema";
import { PHASE_COLORS, PHASE_META_BY_SLUG } from "@/lib/taxonomy";
import { searchAssets } from "@/lib/search";
import { cn } from "@/lib/utils";

export const metadata = { title: "Library" };

type SP = Record<string, string | string[] | undefined>;

function parseList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const raw = Array.isArray(v) ? v.join(",") : v;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function filterAssets(
  assets: Asset[],
  filters: {
    q: string;
    phase: string[];
    type: string[];
    stack: string[];
    projectType: string[];
  },
): Asset[] {
  const facetFiltered = assets.filter((a) => {
    if (filters.phase.length && !filters.phase.includes(a.phase)) return false;
    if (filters.type.length && !filters.type.includes(a.type)) return false;
    if (
      filters.stack.length &&
      !(a.stack ?? []).some((s) => filters.stack.includes(s))
    ) {
      return false;
    }
    if (
      filters.projectType.length &&
      !(a.projectType ?? []).some((p) => filters.projectType.includes(p))
    ) {
      return false;
    }
    return true;
  });
  return searchAssets(facetFiltered, filters.q);
}

function buildOptions<T extends string>(
  values: T[],
  labelFor: (v: T) => string,
): { value: T; label: string; count: number }[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: labelFor(value), count }));
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const phase = parseList(sp.phase);
  const type = parseList(sp.type);
  const stack = parseList(sp.stack);
  const projectType = parseList(sp.projectType);

  const [allRaw, playbooks, catalog, curatedSkills] = await Promise.all([
    getAllAssets(),
    getAllPlaybooks(),
    getCatalogIndex(),
    getCuratedCatalogSkills(),
  ]);
  const catalogSkills = [...curatedSkills, ...catalog.skills];
  // Browse is the "library" view — playbooks live on home, exclude them here.
  const all = allRaw.filter((a) => a.type !== "playbook");
  const filtered = filterAssets(all, { q, phase, type, stack, projectType });
  const featuredPlaybook = playbooks[0] ?? null;

  const stackOptions = buildOptions(
    all.flatMap((a) => a.stack ?? []),
    (s) => s,
  );
  const projectTypeOptions = buildOptions(
    all.flatMap((a) => a.projectType ?? []),
    (s) => s,
  );

  const groups: FilterGroup[] = [
    {
      key: "phase",
      label: "SDLC phase",
      options: PHASES.filter((p) => all.some((a) => a.phase === p)).map(
        (p) => ({
          value: p,
          label: PHASE_META_BY_SLUG[p].name,
          count: all.filter((a) => a.phase === p).length,
        }),
      ),
    },
    {
      key: "type",
      label: "Asset type",
      options: ASSET_TYPES.filter((t) => all.some((a) => a.type === t)).map(
        (t) => ({
          value: t,
          label: TYPE_LABEL[t] ?? t,
          count: all.filter((a) => a.type === t).length,
        }),
      ),
    },
    {
      key: "stack",
      label: "Tech stack",
      options: stackOptions,
    },
    {
      key: "projectType",
      label: "Project type",
      options: projectTypeOptions,
    },
  ];

  const totalSelected =
    phase.length + type.length + stack.length + projectType.length;

  const filtering = Boolean(q) || totalSelected > 0;
  const marqueeAssets = all.filter((a) => a.featured).slice(0, 28);
  const typeTiles = ASSET_TYPES.filter((t) => all.some((a) => a.type === t)).map((t) => ({
    type: t,
    count: all.filter((a) => a.type === t).length,
    active: type.includes(t),
    href: toggleParam(sp, "type", t),
  }));
  const phasesShown = PHASES.filter((p) => filtered.some((a) => a.phase === p));

  return (
    <>
      <PageHeader
        wide
        eyebrow="Capability library"
        icon={Library}
        title="Standardised SDLC assets,"
        highlight="ready to copy."
        description={`${all.length} reviewed templates, skills and MCP configurations. Scroll each delivery phase, or search and filter.`}
        actions={
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <LibraryTabs active="assets" assetCount={all.length} skillCount={catalogSkills.length} />
          {featuredPlaybook ? (
            <Link
              href={`/playbook/${featuredPlaybook.slug}`}
              className="surface card-hover group flex w-full min-w-0 items-center gap-3 px-3.5 py-2.5 sm:w-auto sm:max-w-sm"
            >
              <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 text-xs">
                <span className="block font-semibold text-foreground">Prefer a guided path?</span>
                <span className="block truncate text-muted-foreground">
                  {featuredPlaybook.title} · {featuredPlaybook.steps.length} steps
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ) : null}
          </div>
        }
      >
        <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {typeTiles.map((t, i) => {
            const Icon = TYPE_ICON[t.type];
            return (
              <Link
                key={t.type}
                href={t.href}
                scroll={false}
                aria-pressed={t.active}
                style={{ "--i": i } as React.CSSProperties}
                className={cn(
                  "group stagger relative flex w-60 shrink-0 snap-start animate-fade-up items-center gap-4 sm:w-auto overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5",
                  t.active ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10" : "bg-card/70 hover:border-primary/40",
                )}
              >
                <Icon
                  aria-hidden
                  strokeWidth={1}
                  className="absolute -right-4 -bottom-5 size-24 rotate-[-12deg] text-primary opacity-10 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110"
                />
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-md shadow-primary/25 transition-transform duration-300 group-hover:rotate-[-6deg]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-2xl font-semibold tabular-nums leading-none">{t.count}</span>
                  <span className="mt-1 block text-[13px] font-medium">{TYPE_PLURAL[t.type]}</span>
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">{t.active ? "Filtering" : "Filter"}</span>
              </Link>
            );
          })}
        </div>
        {!filtering && marqueeAssets.length > 0 && (
          <div className="mt-5">
            <AssetMarquee assets={marqueeAssets} />
          </div>
        )}
      </PageHeader>

      <div className="sticky top-14 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="page-wide flex items-center gap-2 py-2.5">
          <SearchInput className="min-w-0 flex-1 sm:max-w-sm" />
          <nav aria-label="Jump to phase" className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {phasesShown.map((p) => {
              const Icon = PHASE_ICON[p];
              return (
                <a
                  key={p}
                  href={`#${p}`}
                  style={{ "--rail": PHASE_COLORS[p].accent } as React.CSSProperties}
                  className="group inline-flex h-8 items-center gap-1.5 rounded-full border bg-card/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-[var(--rail)] hover:text-foreground"
                >
                  <Icon className="size-3.5 text-[var(--rail)] transition-transform group-hover:scale-110" aria-hidden />
                  {PHASE_META_BY_SLUG[p].name}
                </a>
              );
            })}
          </nav>
          <FilterSheet groups={groups} totalSelected={totalSelected} />
          {filtering && (
            <Button variant="ghost" size="sm" render={<Link href="/browse" scroll={false} />}>
              <X className="size-3.5" /> Reset
            </Button>
          )}
          <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
            {filtered.length} of {all.length}
          </span>
        </div>
      </div>

      <div className="page-wide space-y-10 py-8">
        {filtered.length === 0 ? (
          <EmptyState
            title="No assets match your filters"
            description="Try removing a filter or clearing the search."
            action={
              <Button variant="outline" render={<Link href="/browse" />}>
                Reset filters
              </Button>
            }
          />
        ) : (
          phasesShown.map((phase) => {
            const meta = PHASE_META_BY_SLUG[phase];
            const Icon = PHASE_ICON[phase];
            // Featured first, then alphabetical, so each rail opens on the strongest assets.
            const items = filtered
              .filter((a) => a.phase === phase)
              .sort((a, b) => (a.featured !== b.featured ? (a.featured ? -1 : 1) : a.title.localeCompare(b.title)));
            return (
              <AssetRail
                key={phase}
                id={phase}
                icon={<Icon className="size-5" aria-hidden />}
                title={meta.name}
                subtitle={`${meta.short} · ${meta.description}`}
                count={items.length}
                accent={PHASE_COLORS[phase].accent}
              >
                {items.map((a) => (
                  <AssetTile key={`${a.type}:${a.slug}`} asset={a} />
                ))}
              </AssetRail>
            );
          })
        )}

        {!filtering && (
          <section aria-labelledby="catalog-domains" className="pt-2">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Skill catalog</p>
                <h2 id="catalog-domains" className="mt-1 text-lg font-semibold tracking-tight">
                  {catalogSkills.length.toLocaleString()} agent skills by domain
                </h2>
                <p className="text-xs text-muted-foreground">Curated, Google, skills.sh and Agentic Awesome Skills in one searchable catalog.</p>
              </div>
              <Button variant="outline" size="sm" render={<Link href="/browse/skills" />}>
                Open the catalog <ArrowRight className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {DOMAINS.map((d, i) => {
                const Icon = DOMAIN_ICON[d.id];
                const count = catalogSkills.filter((s) => s.domain === d.id).length;
                return (
                  <Link
                    key={d.id}
                    href={`/browse/skills?domain=${d.id}`}
                    style={{ "--i": i, "--d": DOMAIN_ACCENT[d.id] } as React.CSSProperties}
                    className="group stagger relative flex animate-fade-up flex-col overflow-hidden rounded-2xl border bg-card/70 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[color-mix(in_oklch,var(--d)_50%,var(--border))] hover:shadow-[0_16px_36px_-18px_var(--d)]"
                  >
                    <Icon
                      aria-hidden
                      strokeWidth={1}
                      className="absolute -right-4 -bottom-5 size-24 rotate-[-12deg] text-[var(--d)] opacity-10 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110"
                    />
                    <span className="flex size-11 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--d)_85%,black)] text-white shadow-md shadow-[color-mix(in_oklch,var(--d)_35%,transparent)] transition-transform duration-300 group-hover:-rotate-6">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="mt-3 text-sm font-semibold">{d.label}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.blurb}</span>
                    <span className="mt-2 font-mono text-xs font-semibold text-[var(--d)]">{count.toLocaleString()} skills</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

const TYPE_PLURAL: Record<string, string> = {
  template: "Prompt templates",
  skill: "Skill packs",
  "mcp-config": "MCP configs",
  playbook: "Playbooks",
};

/** Link target that toggles one value of a comma-list search param. */
function toggleParam(sp: SP, key: string, value: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v)) params.set(k, v.join(","));
  }
  const list = parseList(sp[key]);
  const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  if (next.length) params.set(key, next.join(","));
  else params.delete(key);
  const qs = params.toString();
  return qs ? `/browse?${qs}` : "/browse";
}

function FilterSheet({
  groups,
  totalSelected,
}: {
  groups: FilterGroup[];
  totalSelected: number;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="outline" size="sm" />}
      >
        <SlidersHorizontal className="size-3.5" />
        <span className="hidden sm:inline">Filters</span>
        {totalSelected > 0 ? (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
            {totalSelected}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-8">
          <FilterPanel groups={groups} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
