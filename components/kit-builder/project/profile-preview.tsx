"use client";

/** Sticky "what the agent will know" card: completeness ring, compiled facts, and what the type adds to the kit. */

import { BookOpen, Check, ScrollText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_TYPES } from "@/lib/kit/project-types";
import type { ProjectQuestion } from "@/lib/kit/project-questions";
import { TYPE_META } from "./type-art";
import { answered } from "./question-section";
import type { KitBuilderState } from "../use-kit-builder-state";

function factText(q: ProjectQuestion, values: string[]): string {
  if (!q.options) return values[0]?.trim() ?? "";
  return values.map((id) => q.options?.find((o) => o.id === id)?.label).filter(Boolean).join(", ");
}

export function ProfilePreview({ s, questions }: { s: KitBuilderState; questions: ProjectQuestion[] }) {
  const type = PROJECT_TYPES.find((t) => t.id === s.projectType);
  const done = questions.filter((q) => answered(s, q));
  const pct = questions.length ? Math.round((done.length / questions.length) * 100) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border bg-card/80 @5xl:sticky @5xl:top-0">
      <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-br from-[color-mix(in_oklch,var(--t)_14%,transparent)] to-transparent p-4">
        <div className="relative size-14 shrink-0">
          <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
            <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
            <circle
              cx="28"
              cy="28"
              r={r}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - (c * pct) / 100}
              className="stroke-[var(--t)] transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project profile</p>
          <p className="truncate text-sm font-semibold">{s.projectName || "Untitled project"}</p>
          <p className="text-xs text-muted-foreground">
            {type ? type.label : "No type yet"} · {done.length} of {questions.length} facts
          </p>
        </div>
      </div>

      <div className="max-h-[calc(100dvh-26rem)] overflow-y-auto p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What the agent will know</p>
        {done.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Answers appear here as facts. They&apos;re written into your instruction file as ground truth, so the agent never has to guess them.
          </p>
        ) : (
          <ul className="space-y-2">
            {done.map((q) => (
              <li key={q.id} className="flex animate-fade-in gap-2 text-xs">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--t)]" strokeWidth={3} />
                <span className="min-w-0">
                  <span className="font-semibold">{q.label}:</span>{" "}
                  <span className="text-muted-foreground">{factText(q, s.projectAnswers[q.id] ?? [])}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border/60 bg-muted/20 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Adds to your kit</p>
        <ul className="space-y-1.5 text-xs">
          <Added icon={ScrollText} label="Project profile rule" on={done.length > 0} />
          <Added icon={BookOpen} label={type ? TYPE_META[type.id].adds.playbook : "Starter playbook (pick a type)"} on={Boolean(type)} />
          <Added icon={Sparkles} label={type ? TYPE_META[type.id].adds.rule : "Operating rule (pick a type)"} on={Boolean(type)} />
        </ul>
      </div>
    </aside>
  );
}

function Added({ icon: Icon, label, on }: { icon: typeof BookOpen; label: string; on: boolean }) {
  return (
    <li className={cn("flex items-center gap-2 transition-colors", on ? "text-foreground" : "text-muted-foreground/70")}>
      <Icon className={cn("size-3.5", on ? "text-[var(--t)]" : "")} />
      {label}
      {on && <Check className="ml-auto size-3.5 text-success" strokeWidth={3} />}
    </li>
  );
}
