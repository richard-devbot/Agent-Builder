"use client";

/**
 * Full-width skill catalog explorer: domain rail, source/licence filters,
 * ranked search and a paged tile grid. Filter state lives in the URL so
 * domain tiles elsewhere can deep-link here.
 */

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Download, Layers, Loader2, PackageCheck, Search, Terminal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import {
  DOMAINS,
  DOMAIN_BY_ID,
  SOURCE_LABEL,
  sourceUrl,
  type CatalogSkill,
  type CatalogSource,
  type DomainId,
} from "@/lib/skill-catalog/domains";
import { fetchSkillFiles, searchSkills, useCatalog } from "@/lib/skill-catalog/client";
import { DOMAIN_ACCENT, DOMAIN_ICON } from "./domain-icon";

const PAGE = 60;
const SOURCES: (CatalogSource | "all")[] = ["all", "curated", "google", "skills-sh", "aaskills"];

export function SkillExplorer({ curated }: { curated: CatalogSkill[] }) {
  const { index, error } = useCatalog();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const domain = (params.get("domain") as DomainId | null) ?? null;
  const source = (params.get("source") as CatalogSource | null) ?? "all";
  const kitOnly = params.get("kit") === "1";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<CatalogSkill | null>(null);

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    setLimit(PAGE);
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  };

  const all = useMemo(() => [...curated, ...(index?.skills ?? [])], [curated, index]);
  // Domain counts reflect the source/licence filters but not the domain itself.
  const scoped = useMemo(
    () => all.filter((s) => (source === "all" || s.source === source) && (!kitOnly || s.copyable)),
    [all, source, kitOnly],
  );
  const counts = useMemo(() => {
    const c = new Map<DomainId, number>();
    for (const s of scoped) c.set(s.domain, (c.get(s.domain) ?? 0) + 1);
    return c;
  }, [scoped]);
  const results = useMemo(() => {
    const inDomain = domain ? scoped.filter((s) => s.domain === domain) : scoped;
    const found = searchSkills(inDomain, query);
    // Without a query, lead with curated and Google skills, then alphabetical.
    if (query.trim()) return found;
    const rank: Record<CatalogSource, number> = { curated: 0, google: 1, "skills-sh": 2, aaskills: 3 };
    return [...found].sort((a, b) => rank[a.source] - rank[b.source] || a.title.localeCompare(b.title));
  }, [scoped, domain, query]);

  const sourceCount = (s: CatalogSource | "all") =>
    all.filter((x) => (s === "all" || x.source === s) && (!kitOnly || x.copyable)).length;

  return (
    <div className="page-wide grid gap-6 py-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Domain rail */}
      <aside className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Domains</p>
        <nav aria-label="Skill domains" className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          <DomainButton active={!domain} onClick={() => setParam("domain", null)} label="All domains" count={scoped.length} />
          {DOMAINS.map((d) => (
            <DomainButton
              key={d.id}
              active={domain === d.id}
              onClick={() => setParam("domain", d.id)}
              label={d.label}
              count={counts.get(d.id) ?? 0}
              icon={DOMAIN_ICON[d.id]}
              accent={DOMAIN_ACCENT[d.id]}
            />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="sticky top-14 z-10 -mx-1 space-y-3 bg-background/85 px-1 py-2 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                onBlur={() => setParam("q", query.trim() || null)}
                placeholder="Search skills by name, purpose, technology or vendor…"
                aria-label="Search skills"
                className="h-10 pl-9"
              />
            </div>
            <button
              type="button"
              aria-pressed={kitOnly}
              onClick={() => setParam("kit", kitOnly ? null : "1")}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors",
                kitOnly ? "border-primary/50 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              title="Only skills whose licence lets the kit include the full SKILL.md"
            >
              <PackageCheck className="size-4" /> Included in kits
            </button>
          </div>
          <div role="tablist" aria-label="Source" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {SOURCES.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={source === s}
                onClick={() => setParam("source", s === "all" ? null : s)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  source === s ? "border-primary bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "all" ? "All sources" : SOURCE_LABEL[s]}
                <span className="font-mono text-[10px] opacity-75">{index || s === "curated" ? sourceCount(s) : "…"}</span>
              </button>
            ))}
          </div>
        </div>

        {domain && (
          <div className="flex items-center gap-3">
            <DomainBadge domain={domain} />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{DOMAIN_BY_ID[domain].label}</h2>
              <p className="text-xs text-muted-foreground">{DOMAIN_BY_ID[domain].blurb}</p>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {error ? (
            <span className="text-destructive">{error}. Run `npm run skills:sync` to build the catalog.</span>
          ) : !index ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Loading catalog…</span>
          ) : (
            `${results.length.toLocaleString()} skills`
          )}
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
          {results.slice(0, limit).map((s, i) => (
            <SkillTile key={s.id} skill={s} index={i % PAGE} onOpen={() => setOpen(s)} />
          ))}
        </div>

        {results.length > limit && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({(results.length - limit).toLocaleString()} left)
            </Button>
          </div>
        )}
      </div>

      <SkillSheet skill={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function DomainButton({
  active,
  onClick,
  label,
  count,
  icon: Icon = Layers,
  accent = "var(--primary)",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      style={{ "--d": accent } as React.CSSProperties}
      className={cn(
        "group flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-[color-mix(in_oklch,var(--d)_14%,transparent)] font-semibold" : "text-foreground/80 hover:bg-muted",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklch,var(--d)_15%,transparent)] text-[var(--d)] transition-transform group-hover:scale-110">
        <Icon className="size-3.5" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
    </button>
  );
}

function DomainBadge({ domain, size = "md" }: { domain: DomainId; size?: "sm" | "md" }) {
  const Icon = DOMAIN_ICON[domain];
  return (
    <span
      style={{ "--d": DOMAIN_ACCENT[domain] } as React.CSSProperties}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--d)_85%,black)] text-white shadow-md shadow-[color-mix(in_oklch,var(--d)_35%,transparent)]",
        size === "md" ? "size-11" : "size-9",
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}

function SkillTile({ skill, index, onOpen }: { skill: CatalogSkill; index: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ "--i": Math.min(index, 18), "--d": DOMAIN_ACCENT[skill.domain] } as React.CSSProperties}
      className="group stagger relative flex animate-fade-up flex-col overflow-hidden rounded-xl border bg-card/70 p-4 text-left transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_oklch,var(--d)_50%,var(--border))] hover:shadow-[0_14px_32px_-18px_var(--d)]"
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(90%_100%_at_0%_0%,color-mix(in_oklch,var(--d)_22%,transparent),transparent_70%)]" />
      <div className="relative flex items-start gap-3">
        <span className="transition-transform duration-300 group-hover:-rotate-6">
          <DomainBadge domain={skill.domain} size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug group-hover:text-primary">{skill.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {SOURCE_LABEL[skill.source]}
            {skill.category ? ` · ${skill.category}` : ""}
          </p>
        </div>
      </div>
      <p className="relative mt-2.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
      <div className="relative mt-auto flex items-center gap-1.5 pt-3 text-[10.5px]">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
            skill.copyable ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {skill.copyable ? <PackageCheck className="size-3" /> : <Terminal className="size-3" />}
          {skill.copyable ? "In kit" : "Install"}
        </span>
        {skill.license && <span className="truncate text-muted-foreground">{skill.license}</span>}
        {skill.risk === "critical" && <span className="ml-auto rounded bg-warning/12 px-1.5 py-0.5 font-medium text-warning">Runs commands</span>}
      </div>
    </button>
  );
}

function SkillSheet({ skill, onClose }: { skill: CatalogSkill | null; onClose: () => void }) {
  const [preview, setPreview] = useState<{ id: string; body?: string; error?: string; loading?: boolean } | null>(null);
  const link = skill ? sourceUrl(skill) : null;
  const current = preview && skill && preview.id === skill.id ? preview : null;

  const loadPreview = async (s: CatalogSkill) => {
    setPreview({ id: s.id, loading: true });
    try {
      const { body } = await fetchSkillFiles({ ...s, refs: [] });
      setPreview({ id: s.id, body });
    } catch (e) {
      setPreview({ id: s.id, error: (e as Error).message });
    }
  };

  return (
    <Sheet open={skill !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {skill && (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex items-start gap-3">
                <DomainBadge domain={skill.domain} />
                <div className="min-w-0">
                  <SheetTitle className="text-base leading-snug">{skill.title}</SheetTitle>
                  <SheetDescription className="mt-0.5 font-mono text-[11px]">{skill.name}</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-5 p-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{skill.description}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                {[
                  ["Domain", DOMAIN_BY_ID[skill.domain].label],
                  ["Source", SOURCE_LABEL[skill.source]],
                  ["Category", skill.category],
                  ["Licence", skill.license],
                  ["Version", skill.version],
                  ["Repository", skill.repo],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 break-words font-medium">{v}</dd>
                    </div>
                  ))}
              </dl>

              <div
                className={cn(
                  "rounded-lg border p-3 text-xs leading-relaxed",
                  skill.copyable ? "border-success/30 bg-success/5" : "bg-muted/40",
                )}
              >
                {skill.copyable
                  ? "Kit Studio copies this SKILL.md (and its reference files) into generated kits, pinned to the indexed commit."
                  : "The licence does not allow copying this skill into kits. Kit Studio adds the install command below to skills-install.sh instead."}
              </div>

              {skill.install && (
                <div>
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Install</p>
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{skill.install}</code>
                    <CopyButton value={skill.install} size="sm" label="Copy" />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {link && (
                  <Button variant="outline" size="sm" render={<a href={link} target="_blank" rel="noreferrer" />}>
                    View source <ArrowUpRight className="size-3.5" />
                  </Button>
                )}
                {skill.copyable && skill.source !== "curated" && (
                  <Button variant="outline" size="sm" onClick={() => loadPreview(skill)} disabled={current?.loading}>
                    {current?.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Preview SKILL.md
                  </Button>
                )}
                {skill.source === "curated" && (
                  <Button variant="outline" size="sm" render={<a href={`/asset/skill/${skill.path}`} />}>
                    Open in Library <ArrowUpRight className="size-3.5" />
                  </Button>
                )}
              </div>

              {current?.error && <p className="text-xs text-destructive">{current.error}</p>}
              {current?.body && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    aria-label="Close preview"
                    className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                  <pre className="max-h-[50vh] overflow-auto rounded-lg border bg-muted/40 p-3 text-[11px] leading-5 whitespace-pre-wrap">
                    {current.body}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
