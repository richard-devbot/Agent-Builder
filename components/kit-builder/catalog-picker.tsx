"use client";

/** Kit Studio picker for the external skill catalog (Stack step → Skill catalog tab). */

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, PackageCheck, RotateCcw, Search, Terminal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOMAINS, SOURCE_LABEL, type CatalogSource, type DomainId } from "@/lib/skill-catalog/domains";
import { searchSkills, useCatalog } from "@/lib/skill-catalog/client";
import { DOMAIN_ACCENT, DOMAIN_ICON } from "@/components/skill-catalog/domain-icon";
import { Chip, SelectableRow, tileGridClass } from "./primitives";
import type { KitBuilderState } from "./use-kit-builder-state";

const PAGE = 48;
const SOURCES: Exclude<CatalogSource, "curated">[] = ["google", "skills-sh", "aaskills"];

export function CatalogPicker({ s }: { s: KitBuilderState }) {
  const { index, error } = useCatalog();
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<DomainId | null>(null);
  const [source, setSource] = useState<CatalogSource | null>(null);
  const [showSelected, setShowSelected] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const results = useMemo(() => {
    if (showSelected) return [...s.catalogSel.values()];
    const pool = (index?.skills ?? []).filter(
      (k) => (!domain || k.domain === domain) && (!source || k.source === source),
    );
    return searchSkills(pool, query);
  }, [index, domain, source, query, showSelected, s.catalogSel]);

  const reset = () => setLimit(PAGE);

  if (error) return <p className="py-6 text-center text-sm text-destructive">{error}. Run `npm run skills:sync`.</p>;
  if (!index)
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading the skill catalog…
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSelected(false);
              reset();
            }}
            placeholder={`Search ${index.skills.length.toLocaleString()} skills: “bigquery”, “playwright”, “seo audit”…`}
            aria-label="Search the skill catalog"
            className="h-9 pl-8 text-sm md:text-sm"
          />
        </div>
        <div className="flex gap-1">
          {SOURCES.map((src) => (
            <Chip
              key={src}
              active={source === src}
              onClick={() => {
                setSource(source === src ? null : src);
                setShowSelected(false);
                reset();
              }}
            >
              {SOURCE_LABEL[src]}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={showSelected}
          onClick={() => setShowSelected((v) => !v)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            showSelected ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          In this kit <span className="font-mono">{s.catalogSel.size}</span>
        </button>
      </div>

      {!showSelected && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {DOMAINS.map((d) => {
            const Icon = DOMAIN_ICON[d.id];
            const active = domain === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setDomain(active ? null : d.id);
                  reset();
                }}
                style={{ "--d": DOMAIN_ACCENT[d.id] } as React.CSSProperties}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-[var(--d)] bg-[color-mix(in_oklch,var(--d)_16%,transparent)] text-foreground"
                    : "bg-background/60 text-muted-foreground hover:border-[var(--d)] hover:text-foreground",
                )}
              >
                <Icon className="size-3.5 text-[var(--d)]" />
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {results.length.toLocaleString()} {showSelected ? "selected" : "matching"} ·{" "}
        <PackageCheck className="inline size-3 text-success" /> copied into the kit ·{" "}
        <Terminal className="inline size-3" /> added to skills-install.sh
      </p>

      {results.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {showSelected ? "No catalog skills in this kit yet." : "No skills match. Try another word or clear the filters."}
        </p>
      ) : (
        <div className={tileGridClass}>
          {results.slice(0, limit).map((k) => {
            const f = s.catalogStatus(k.id);
            const selected = s.catalogSel.has(k.id);
            return (
              <SelectableRow
                key={k.id}
                title={k.title}
                description={k.description}
                selected={selected}
                recommended={false}
                onToggle={() => s.toggleCatalogSkill(k)}
              >
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1 py-px font-medium",
                      k.copyable ? "bg-success/12 text-success" : "bg-muted",
                    )}
                  >
                    {k.copyable ? <PackageCheck className="size-3" /> : <Terminal className="size-3" />}
                    {k.copyable ? "In kit" : "Install"}
                  </span>
                  <span>{SOURCE_LABEL[k.source]}</span>
                  {k.category && <span className="truncate">· {k.category}</span>}
                  {selected && f?.status === "loading" && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Loader2 className="size-3 animate-spin" /> downloading
                    </span>
                  )}
                  {selected && f?.status === "error" && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <AlertTriangle className="size-3" /> download failed, using install command
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          s.retryCatalogSkill(k.id);
                        }}
                        className="inline-flex items-center gap-0.5 underline"
                      >
                        <RotateCcw className="size-2.5" /> retry
                      </button>
                    </span>
                  )}
                </span>
              </SelectableRow>
            );
          })}
        </div>
      )}

      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mx-auto h-8 rounded-lg border px-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Show more ({(results.length - limit).toLocaleString()} left)
        </button>
      )}
    </div>
  );
}
