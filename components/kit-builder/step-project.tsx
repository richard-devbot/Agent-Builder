"use client";

/**
 * Step 3 — Project. Pick a project type (illustrated cards), name the project,
 * then review/refine type-specific questions grouped into sections. A sticky
 * preview shows the facts and Discovery architecture the agent treats as ground truth.
 */

import { useState } from "react";
import { Check, ChevronsUpDown, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PROJECT_TYPES } from "@/lib/kit/project-types";
import { StepHeader, fieldLabelClass } from "./primitives";
import { TYPE_META, TypeArt } from "./project/type-art";
import { QuestionSection, SECTION_ORDER, answered } from "./project/question-section";
import { ProfilePreview } from "./project/profile-preview";
import type { KitBuilderState } from "./use-kit-builder-state";

const NEUTRAL = "#14b8a6";

export function StepProject({ s }: { s: KitBuilderState }) {
  const questions = s.baseProjectQuestions;
  const sections = SECTION_ORDER.map((sec) => ({ sec, qs: questions.filter((q) => q.section === sec) })).filter((x) => x.qs.length);
  // First unfinished section (or the first section when all are synced) starts open; the user can toggle any or expand/collapse all.
  const firstOpen = (sections.find((x) => x.qs.some((q) => !answered(s, q))) ?? sections[0])?.sec;
  const [open, setOpen] = useState<Set<string> | null>(null);
  const activeOpen = open ?? (firstOpen ? new Set([firstOpen]) : new Set<string>());
  const isOpen = (sec: string) => activeOpen.has(sec);
  const toggle = (sec: string) =>
    setOpen((prev) => {
      const next = new Set(prev ?? (firstOpen ? [firstOpen] : []));
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  const allExpanded = sections.length > 0 && sections.every((x) => activeOpen.has(x.sec));
  const toggleAll = () => {
    if (allExpanded) {
      setOpen(new Set());
    } else {
      setOpen(new Set(sections.map((x) => x.sec)));
    }
  };

  const accent = s.projectType ? TYPE_META[s.projectType].accent : NEUTRAL;
  const answeredQuestions = questions.filter((q) => answered(s, q));

  return (
    <div style={{ "--t": accent } as React.CSSProperties} className="flex flex-col gap-5">
      <StepHeader n={3} />

      {s.intake.hasContent && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-primary/35 bg-primary/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  Synced with Discovery: {s.projectName || s.intake.brief.title || "Agentic Workflow"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Pre-populated{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {answeredQuestions.length}/{questions.length}
                  </span>{" "}
                  project profile settings,{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {s.intake.liveAdk.agents.length}
                  </span>{" "}
                  ADK agents (<code className="font-mono text-[11px]">{s.intake.liveAdk.packageName}</code>), and{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {s.intake.brief.systems.length}
                  </span>{" "}
                  connected enterprise system{s.intake.brief.systems.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={toggleAll}
              >
                <ChevronsUpDown className="size-3.5" />
                {allExpanded ? "Collapse sections" : "Expand all sections"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={s.applyIntakePlan}
              >
                <RefreshCw className="size-3.5" /> Re-sync Discovery
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Project type */}
      <section aria-labelledby="project-type-title" id="project-type" className="scroll-mt-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="project-type-title" className="text-base font-semibold tracking-tight">
              What kind of project is this?
            </h2>
            <p className="text-xs text-muted-foreground">It sets the starter playbook and which questions we ask. Click again to clear.</p>
          </div>
          {s.projectType && (
            <button
              type="button"
              onClick={() => s.setProjectType(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" /> Clear type
            </button>
          )}
        </div>
        <div role="radiogroup" aria-label="Project type" className="grid grid-cols-1 gap-4 @3xl:grid-cols-3">
          {PROJECT_TYPES.map((t, i) => {
            const meta = TYPE_META[t.id];
            const active = s.projectType === t.id;
            const dimmed = s.projectType !== null && !active;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => s.setProjectType(active ? null : t.id)}
                style={{ "--t": meta.accent, "--i": i } as React.CSSProperties}
                className={cn(
                  "group stagger relative flex animate-fade-up flex-col overflow-hidden rounded-2xl border-2 bg-card text-left transition-all duration-300",
                  active
                    ? "border-[var(--t)] shadow-[0_18px_44px_-20px_var(--t)]"
                    : "border-border hover:-translate-y-1 hover:border-[color-mix(in_oklch,var(--t)_50%,var(--border))] hover:shadow-[0_16px_36px_-22px_var(--t)]",
                  dimmed && "opacity-60 hover:opacity-100",
                )}
              >
                <TypeArt type={t.id} active={active} />
                <span
                  className={cn(
                    "absolute top-3 right-3 flex size-6 items-center justify-center rounded-full border-2 transition-all duration-300",
                    active ? "scale-100 border-[var(--t)] bg-[var(--t)] text-white" : "scale-90 border-border bg-card/80",
                  )}
                >
                  {active && <Check className="size-3.5 animate-check" strokeWidth={3} />}
                </span>
                <span className="flex flex-1 flex-col p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--t)]">{meta.tagline}</span>
                  <span className="mt-0.5 text-lg font-semibold tracking-tight">{t.label}</span>
                  <span className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t.blurb}</span>
                  <span className="mt-3 space-y-1">
                    {meta.bestFor.map((b) => (
                      <span key={b} className="flex items-center gap-1.5 text-xs text-foreground/80">
                        <Check className="size-3 shrink-0 text-[var(--t)]" strokeWidth={3} /> {b}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-5 @5xl:grid-cols-[minmax(0,1fr)_22rem] @[96rem]:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-3" id="project-profile">
          {/* Identity */}
          <div className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-4 @3xl:flex-row @3xl:items-end">
            <div className="flex-1">
              <label htmlFor="project-name" className={fieldLabelClass}>
                Project name <span className="font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <Input
                id="project-name"
                value={s.projectName}
                onChange={(e) => s.setProjectName(e.target.value)}
                placeholder="e.g. my-team-agent"
                className="h-10 text-base"
              />
            </div>
            <div className="text-xs leading-relaxed text-muted-foreground @3xl:max-w-xs @3xl:pb-1">
              <p>Shown in the studio and written into the profile and the ADK package name.</p>
              {s.deploymentSetup.agentFolderName && (
                <p className="mt-0.5 font-mono text-[11px] text-foreground/80">
                  ADK package: <code>{s.deploymentSetup.agentFolderName}</code>
                </p>
              )}
            </div>
          </div>

          {!s.projectType && (
            <p className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
              Pick a project type above to unlock its questions. The general ones below apply to every project.
            </p>
          )}

          {sections.map(({ sec, qs }, i) => (
            <QuestionSection key={`${s.projectType}-${sec}`} s={s} section={sec} questions={qs} index={i} open={isOpen(sec)} onToggle={() => toggle(sec)} />
          ))}
        </div>

        <ProfilePreview s={s} questions={questions} />
      </div>
    </div>
  );
}
