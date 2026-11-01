"use client";

/** Left rail: vertical step navigator, in-step jump links and overall readiness. */

import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./primitives";
import { readiness, stepStatus } from "./readiness";
import type { KitBuilderState } from "./use-kit-builder-state";

/** Jump links inside a step; ids match the Panel ids on that step's canvas. */
const SUB_SECTIONS: Record<number, { id: string; label: string }[]> = {
  3: [
    { id: "project-type", label: "Project type" },
    { id: "project-profile", label: "Project profile" },
  ],
  4: [
    { id: "assistant", label: "Target assistant" },
    { id: "technologies", label: "Technologies" },
    { id: "capabilities", label: "Capabilities" },
  ],
  5: [
    { id: "readiness", label: "Readiness" },
    { id: "contents", label: "Kit contents" },
  ],
};

export function StudioNav({ s }: { s: KitBuilderState }) {
  const checks = readiness(s).filter((c) => !c.optional);
  const passed = checks.filter((c) => c.ok).length;
  const pct = Math.round((passed / checks.length) * 100);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-2">
        <p className="eyebrow">Kit Studio</p>
        <p className="mt-0.5 truncate text-sm font-semibold" title={s.projectName || "Untitled kit"}>
          {s.projectName || "Untitled kit"}
        </p>
      </div>

      <nav aria-label="Kit builder steps" className="flex-1 px-2 py-2">
        <ol className="relative">
          {STEPS.map((step, i) => {
            const active = step.n === s.step;
            const done = step.n < s.step;
            const Icon = step.icon;
            const subs = SUB_SECTIONS[step.n];
            return (
              <li key={step.n} className="relative">
                {/* Connector between step markers. */}
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-10 bottom-0 left-[1.4rem] w-px transition-colors duration-500",
                      done ? "bg-success/50" : "bg-border",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => s.setStep(step.n)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group relative flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                    active ? "bg-primary/10" : "hover:bg-muted/70",
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-300",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30"
                        : done
                          ? "border-success/40 bg-background text-success"
                          : "border-border bg-background text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5 animate-check" strokeWidth={3} /> : <Icon className="size-3.5" />}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className={cn("block text-[13px] font-semibold leading-tight", !active && !done && "text-foreground/70")}>
                      {step.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
                      {stepStatus(s, step.n)}
                    </span>
                  </span>
                </button>
                {active && subs && (
                  <ul className="mt-0.5 mb-1.5 ml-[2.6rem] animate-fade-in space-y-px border-l border-primary/25 pl-2.5">
                    {subs.map((sub) => (
                      <li key={sub.id}>
                        <button
                          type="button"
                          onClick={() => document.getElementById(sub.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                          className="w-full rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {sub.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!(active && subs) && <div className="h-1" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="m-3 rounded-xl border bg-background/60 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Readiness</span>
          <span className="font-mono text-sm font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {passed} of {checks.length} recommended checks pass.
        </p>
        <p className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-success" /> Runs in your browser. No code is uploaded.
        </p>
      </div>
    </div>
  );
}
