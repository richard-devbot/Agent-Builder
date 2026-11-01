"use client";

/** Step 2 — organisation-wide guidelines layered onto every project. */

import { Building2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  ORG_GUIDELINES,
  ORG_GUIDELINE_CATEGORY_LABEL,
  ORG_GUIDELINE_CATEGORY_ORDER,
  RECOMMENDED_ORG_GUIDELINE_IDS,
  type OrgGuidelineCategory,
} from "@/lib/kit/org-guidelines";
import {
  BulkActions,
  Count,
  Panel,
  SelectableRow,
  StepHeader,
  fieldLabelClass,
  tileGridClass,
} from "./primitives";
import type { KitBuilderState } from "./use-kit-builder-state";

export function StepOrg({ s }: { s: KitBuilderState }) {
  const setCategory = (cat: OrgGuidelineCategory, on: boolean) =>
    s.setOrgGuidelineSel((prev) => {
      const next = new Set(prev);
      for (const g of ORG_GUIDELINES) {
        if (g.category !== cat) continue;
        if (on) next.add(g.id);
        else next.delete(g.id);
      }
      return next;
    });

  return (
    <>
      <StepHeader
        n={2}
        actions={
          <BulkActions
            onAll={() => s.setOrgGuidelineSel(new Set(ORG_GUIDELINES.map((g) => g.id)))}
            onNone={() => s.setOrgGuidelineSel(new Set())}
            onReset={() => s.setOrgGuidelineSel(new Set(RECOMMENDED_ORG_GUIDELINE_IDS))}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel icon={Building2} title="Organisation" description="Personalises the guidance in every rule.">
          <label htmlFor="organization-name" className={fieldLabelClass}>
            Organisation or team name
          </label>
          <Input
            id="organization-name"
            value={s.orgName}
            onChange={(e) => s.setOrgName(e.target.value)}
            placeholder="Your team"
            className="h-9"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            This does not configure cloud IAM or enforce permissions.
          </p>
        </Panel>

        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4 @4xl:grid-cols-2 @6xl:grid-cols-4">
          {ORG_GUIDELINE_CATEGORY_ORDER.map((cat, i) => {
            const items = ORG_GUIDELINES.filter((g) => g.category === cat);
            const picked = items.filter((g) => s.orgGuidelineSel.has(g.id)).length;
            const pct = items.length ? (picked / items.length) * 100 : 0;
            return (
              <a
                key={cat}
                href={`#org-${cat}`}
                style={{ "--i": i } as React.CSSProperties}
                className="stagger flex animate-fade-up flex-col justify-between rounded-xl border bg-card/70 p-3 transition-colors hover:border-primary/40"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {ORG_GUIDELINE_CATEGORY_LABEL[cat]}
                </span>
                <span className="mt-2 font-mono text-xl font-semibold tabular-nums">
                  {picked}
                  <span className="text-sm text-muted-foreground">/{items.length}</span>
                </span>
                <span className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </a>
            );
          })}
        </div>
      </div>

      {ORG_GUIDELINE_CATEGORY_ORDER.map((cat) => {
        const items = ORG_GUIDELINES.filter((g) => g.category === cat);
        if (items.length === 0) return null;
        const picked = items.filter((g) => s.orgGuidelineSel.has(g.id)).length;
        return (
          <Panel
            key={cat}
            id={`org-${cat}`}
            icon={ShieldCheck}
            title={ORG_GUIDELINE_CATEGORY_LABEL[cat]}
            meta={<Count tone={picked ? "brand" : "muted"}>{`${picked}/${items.length}`}</Count>}
            actions={<BulkActions onAll={() => setCategory(cat, true)} onNone={() => setCategory(cat, false)} />}
          >
            <div className={tileGridClass}>
              {items.map((g) => (
                <SelectableRow
                  key={g.id}
                  title={g.name}
                  description={g.description}
                  selected={s.orgGuidelineSel.has(g.id)}
                  recommended={Boolean(g.recommended)}
                  onToggle={() => s.toggleOrgGuideline(g.id)}
                />
              ))}
            </div>
          </Panel>
        );
      })}
    </>
  );
}
