"use client";

/**
 * Step 3 — Project. Pick a project type (illustrated cards), name the project,
 * then answer type-specific questions grouped into sections. A sticky preview
 * shows the facts the agent will treat as ground truth.
 */

import { useState } from "react";
import { Check, X } from "lucide-react";
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
  // First unfinished section starts open; the user can open any others.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const firstOpen = sections.find((x) => x.qs.some((q) => !answered(s, q)))?.sec;
  const isOpen = (sec: string) => open.has(sec) || (open.size === 0 && sec === firstOpen);
  const toggle = (sec: string) =>
    setOpen((prev) => {
      const next = new Set(prev.size === 0 && firstOpen ? [firstOpen] : prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });

  const accent = s.projectType ? TYPE_META[s.projectType].accent : NEUTRAL;

  return (
    <div style={{ "--t": accent } as React.CSSProperties} className="flex flex-col gap-5">
      <StepHeader n={3} />

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
                placeholder="e.g. Helix Billing Service"
                className="h-10 text-base"
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground @3xl:max-w-xs @3xl:pb-2">
              Shown in the studio and written into the profile and the ADK package name.
            </p>
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
