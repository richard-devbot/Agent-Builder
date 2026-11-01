"use client";

/** Blueprint tab: the solution plan, the agent-team graph, drafts to review, and apply-to-kit. */

import { useMemo, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Eye, Flag, Layers, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PROJECT_TYPES } from "@/lib/kit/project-types";
import { techLabel } from "@/lib/kit/technologies";
import { SOURCE_LABEL, type CatalogSkill } from "@/lib/skill-catalog/domains";
import { useCatalog } from "@/lib/skill-catalog/client";
import { BlueprintGraph } from "./blueprint-graph";
import type { KitBuilderState } from "../use-kit-builder-state";

type Draft = { kind: "agent" | "skill"; name: string; title: string; body: string };

export function BlueprintView({ s }: { s: KitBuilderState }) {
  const { intake } = s;
  const plan = intake.plan;
  const { index } = useCatalog();
  const [draft, setDraft] = useState<Draft | null>(null);

  // Resolve recommended ids to names: curated skills come from the kit, the rest from the catalog.
  const byId = useMemo(() => {
    const m = new Map<string, Pick<CatalogSkill, "title" | "source" | "copyable">>();
    for (const k of s.skills) m.set(`curated:${k.slug}`, { title: k.name, source: "curated", copyable: true });
    for (const k of index?.skills ?? []) m.set(k.id, k);
    return m;
  }, [s.skills, index]);
  const names = useMemo(() => new Map([...byId].map(([id, v]) => [id, v.title])), [byId]);

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Wand2 className="size-5" />
        </span>
        <p className="text-sm font-semibold">No blueprint yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Chat with the agent until the brief looks right, then build the blueprint. The architect designs the stack, milestones and a team of
          custom agents and skills.
        </p>
        <Button size="sm" onClick={intake.buildPlan} disabled={!intake.hasContent || Boolean(intake.busy)}>
          <Wand2 className="size-3.5" /> Build blueprint
        </Button>
      </div>
    );
  }

  const type = PROJECT_TYPES.find((t) => t.id === plan.projectType);
  const drafts = [
    ...plan.customAgents.map((a) => ({ kind: "agent" as const, ...a })),
    ...plan.customSkills.map((k) => ({ kind: "skill" as const, ...k })),
  ];

  return (
    <div className="space-y-5 p-4">
      {/* Apply bar */}
      <div className={cn("rounded-xl border p-3", intake.applied ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/[0.06]")}>
        {intake.applied ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-4" /> Applied to the kit
            </p>
            <Button size="sm" onClick={() => s.setStep(2)}>
              Continue <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Sets project type and technologies, adds {intake.accepted.length} ticked item{intake.accepted.length === 1 ? "" : "s"} and the brief.
            </p>
            <Button size="sm" onClick={s.applyIntakePlan}>
              <CheckCircle2 className="size-3.5" /> Apply to kit
            </Button>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm leading-relaxed">{plan.summary}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {type && <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{type.label}</span>}
          {plan.technologies.map((t) => (
            <span key={t} className="rounded-md border bg-background/70 px-2 py-0.5 text-[11px] font-medium">
              {techLabel(t)}
            </span>
          ))}
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{intake.planMode === "ai" ? "AI blueprint" : "Guided blueprint"}</span>
        </div>
      </div>

      <section>
        <Title icon={Bot} title="Agent team" />
        <BlueprintGraph plan={plan} catalogNames={names} accepted={intake.accepted} />
      </section>

      {plan.milestones.length > 0 && (
        <section>
          <Title icon={Flag} title="Milestones" />
          <ol className="relative space-y-2 border-l border-primary/25 pl-4">
            {plan.milestones.map((m, i) => (
              <li key={m.title} style={{ "--i": i } as React.CSSProperties} className="stagger relative animate-fade-up">
                <span className="absolute top-1 -left-[1.4rem] flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="text-[13px] font-semibold">{m.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{m.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {drafts.length > 0 && (
        <section>
          <Title icon={Sparkles} title="Custom drafts" hint="Open one to read or edit." />
          <div className="space-y-2">
            {drafts.map((d) => {
              const key = `${d.kind}:${d.name}`;
              const checked = intake.accepted.includes(key);
              const Icon = d.kind === "agent" ? Bot : Sparkles;
              return (
                <div key={key} className={cn("flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors", checked ? "border-primary/40 bg-primary/[0.05]" : "bg-background/50")}>
                  <Checkbox checked={checked} onCheckedChange={() => intake.toggleAccepted(key)} aria-label={`Include ${d.title}`} className="mt-0.5" />
                  <Icon className={cn("mt-0.5 size-4 shrink-0", d.kind === "agent" ? "text-brand-2" : "text-primary")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug">
                      {d.title} <span className="ml-1 text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground">{d.kind}</span>
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ kind: d.kind, name: d.name, title: d.title, body: d.body })} aria-label={`Open ${d.title}`}>
                    <Eye className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {plan.skills.length > 0 && (
        <section>
          <Title icon={Layers} title="Reusable catalog skills" hint="First match per need is ticked." />
          <div className="space-y-3">
            {plan.skills.map((rec) => (
              <div key={rec.need}>
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">{rec.need}</p>
                <div className="space-y-1.5">
                  {rec.skillIds.map((id) => {
                    const k = byId.get(id);
                    const checked = intake.accepted.includes(id);
                    return (
                      <label
                        key={id}
                        className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors", checked ? "border-primary/40 bg-primary/[0.05]" : "bg-background/50 hover:border-primary/30")}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => intake.toggleAccepted(id)} />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{k?.title ?? id.split(":").pop()}</span>
                        <span className="shrink-0 text-[10.5px] text-muted-foreground">
                          {k ? SOURCE_LABEL[k.source] : "Catalog"}
                          {k && !k.copyable ? " · install" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.kind === "agent" ? "Agent" : "Skill"}: {draft?.title}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{draft?.name}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft?.body ?? ""}
            onChange={(e) => setDraft((d) => d && { ...d, body: e.target.value })}
            aria-label="Draft content"
            className="max-h-[60dvh] min-h-[45dvh] font-mono text-xs leading-6"
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (draft) intake.editDraft(draft.kind, draft.name, draft.body);
                setDraft(null);
              }}
            >
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Title({ icon: Icon, title, hint }: { icon: typeof Flag; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5 text-primary" /> {title}
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
