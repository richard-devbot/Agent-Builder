"use client";

/** Step 2 — organisation-wide guidelines and engineering standards layered onto every project. */

import { useState } from "react";
import { BookOpenCheck, Building2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ORG_GUIDELINES,
  ORG_GUIDELINE_CATEGORY_LABEL,
  ORG_GUIDELINE_CATEGORY_ORDER,
  RECOMMENDED_ORG_GUIDELINE_IDS,
  type OrgGuidelineCategory,
} from "@/lib/kit/org-guidelines";
import {
  RECOMMENDED_STANDARD_TEMPLATE_IDS,
  STANDARD_CATEGORY_LABEL,
  STANDARD_CATEGORY_ORDER,
  STANDARD_TEMPLATES,
  type StandardCategory,
} from "@/lib/kit/standard-templates";
import {
  BulkActions,
  Count,
  Panel,
  SegmentTab,
  SelectableRow,
  StepHeader,
  fieldLabelClass,
  tileGridClass,
} from "./primitives";
import type { KitBuilderState } from "./use-kit-builder-state";

export function StepOrg({ s }: { s: KitBuilderState }) {
  const [tab, setTab] = useState<"policies" | "standards">("standards");

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

  const setStandardCategory = (cat: StandardCategory, on: boolean) =>
    s.setStandardTemplateSel((prev) => {
      const next = new Set(prev);
      for (const t of STANDARD_TEMPLATES) {
        if (t.category !== cat) continue;
        if (on) next.add(t.id);
        else next.delete(t.id);
      }
      return next;
    });

  return (
    <>
      <StepHeader
        n={2}
        actions={
          tab === "standards" ? (
            <BulkActions
              onAll={() =>
                s.setStandardTemplateSel(new Set(STANDARD_TEMPLATES.map((t) => t.id)))
              }
              onNone={() => s.setStandardTemplateSel(new Set())}
              onReset={() =>
                s.setStandardTemplateSel(new Set(RECOMMENDED_STANDARD_TEMPLATE_IDS))
              }
            />
          ) : (
            <BulkActions
              onAll={() => s.setOrgGuidelineSel(new Set(ORG_GUIDELINES.map((g) => g.id)))}
              onNone={() => s.setOrgGuidelineSel(new Set())}
              onReset={() => s.setOrgGuidelineSel(new Set(RECOMMENDED_ORG_GUIDELINE_IDS))}
            />
          )
        }
      />

      {s.intake.hasContent && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span>
              <strong>Recommended from Discovery:</strong> Auto-selected{" "}
              <span className="font-mono font-semibold">{s.discoveryRecommendedStdIds.size}</span>{" "}
              engineering standards and{" "}
              <span className="font-mono font-semibold">{s.discoveryRecommendedOrgIds.size}</span>{" "}
              organisation policies based on your{" "}
              <span className="font-mono uppercase">{s.intake.brief.riskTier}</span> risk tier
              {s.intake.brief.systems.length > 0
                ? ` and ${s.intake.brief.systems.map((sys) => sys.name).join(", ")}`
                : ""}.
            </span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={s.applyIntakePlan}>
            <RefreshCw className="size-3" /> Re-sync from Discovery
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Organisation governance mode"
          className="inline-flex rounded-xl border bg-muted/40 p-1"
        >
          <SegmentTab
            active={tab === "standards"}
            onClick={() => setTab("standards")}
            icon={BookOpenCheck}
            label="Engineering Standards (10 Categories)"
            count={`${s.standardTemplateSel.size}/${STANDARD_TEMPLATES.length}`}
          />
          <SegmentTab
            active={tab === "policies"}
            onClick={() => setTab("policies")}
            icon={ShieldCheck}
            label="Org Policies & Guardrails"
            count={`${s.orgGuidelineSel.size}/${ORG_GUIDELINES.length}`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Selected standards compile into <code className="font-mono">docs/engineering-standards.md</code>,{" "}
          <code className="font-mono">kit.lock.json</code>, and always-on workspace rules.
        </p>
      </div>

      {tab === "standards" ? (
        <>
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Panel
              icon={Building2}
              title="Organisation"
              description="Personalises the governance header and lockfile metadata."
            >
              <label htmlFor="organization-name" className={fieldLabelClass}>
                Organisation or team name
              </label>
              <Input
                id="organization-name"
                value={s.orgName}
                onChange={(e) => s.setOrgName(e.target.value)}
                placeholder="e.g. my-team"
                className="h-9"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Included in generated documentation and <code className="font-mono">kit.lock.json</code>.
              </p>
            </Panel>

            <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-5">
              {STANDARD_CATEGORY_ORDER.map((cat, i) => {
                const items = STANDARD_TEMPLATES.filter((t) => t.category === cat);
                const picked = items.filter((t) => s.standardTemplateSel.has(t.id)).length;
                const pct = items.length ? (picked / items.length) * 100 : 0;
                return (
                  <a
                    key={cat}
                    href={`#std-${cat}`}
                    style={{ "--i": i } as React.CSSProperties}
                    className="stagger flex animate-fade-up flex-col justify-between rounded-xl border bg-card/70 p-3 transition-colors hover:border-primary/40"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {STANDARD_CATEGORY_LABEL[cat]}
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

          {STANDARD_CATEGORY_ORDER.map((cat) => {
            const items = STANDARD_TEMPLATES.filter((t) => t.category === cat);
            if (items.length === 0) return null;
            const picked = items.filter((t) => s.standardTemplateSel.has(t.id)).length;
            return (
              <Panel
                key={cat}
                id={`std-${cat}`}
                icon={BookOpenCheck}
                title={STANDARD_CATEGORY_LABEL[cat]}
                meta={<Count tone={picked ? "brand" : "muted"}>{`${picked}/${items.length}`}</Count>}
                actions={
                  <BulkActions
                    onAll={() => setStandardCategory(cat, true)}
                    onNone={() => setStandardCategory(cat, false)}
                  />
                }
              >
                <div className={tileGridClass}>
                  {items.map((t) => (
                    <SelectableRow
                      key={t.id}
                      title={t.name}
                      description={t.description}
                      selected={s.standardTemplateSel.has(t.id)}
                      recommended={Boolean(t.recommended)}
                      onToggle={() => s.toggleStandardTemplate(t.id)}
                    >
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            t.enforcement === "hard"
                              ? "inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-destructive"
                              : "inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                          }
                        >
                          {t.enforcement === "hard" ? "Hard · Blocking" : "Soft · Advisory"}
                        </span>
                        {s.intake.hasContent && s.discoveryRecommendedStdIds.has(t.id) && (
                          <span className="inline-flex items-center gap-1 rounded bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                            <Sparkles className="size-2.5" /> Recommended from Discovery
                          </span>
                        )}
                      </span>
                    </SelectableRow>
                  ))}
                </div>
              </Panel>
            );
          })}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Panel
              icon={Building2}
              title="Organisation"
              description="Personalises the guidance in every rule."
            >
              <label htmlFor="organization-name-policies" className={fieldLabelClass}>
                Organisation or team name
              </label>
              <Input
                id="organization-name-policies"
                value={s.orgName}
                onChange={(e) => s.setOrgName(e.target.value)}
                placeholder="e.g. my-team"
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
                actions={
                  <BulkActions
                    onAll={() => setCategory(cat, true)}
                    onNone={() => setCategory(cat, false)}
                  />
                }
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
                    >
                      {s.intake.hasContent && s.discoveryRecommendedOrgIds.has(g.id) && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                          <Sparkles className="size-2.5" /> Recommended from Discovery
                        </span>
                      )}
                    </SelectableRow>
                  ))}
                </div>
              </Panel>
            );
          })}
        </>
      )}
    </>
  );
}
