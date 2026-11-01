"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { getProgress } from "@/lib/playbook-state";
import { cn } from "@/lib/utils";

type Step = { number: number; title: string };

type Props = {
  playbookSlug: string;
  steps: Step[];
  /** When provided, that step is highlighted as the current one. */
  currentStep?: number;
};

export function PlaybookProgressBar({
  playbookSlug,
  steps,
  currentStep,
}: Props) {
  const [completed, setCompleted] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCompleted(getProgress(playbookSlug).completed);
    setHydrated(true);
    // Refresh on focus, in case another tab updated progress.
    function onFocus() {
      setCompleted(getProgress(playbookSlug).completed);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [playbookSlug]);

  const completedCount = hydrated ? completed.length : 0;
  const total = steps.length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  return (
    <div className="surface space-y-2.5 p-3.5">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="font-mono">
          {completedCount} / {total} complete
        </span>
        <span className="font-mono">{percent}%</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="flex flex-wrap gap-1.5">
        {steps.map((s) => {
          const isDone = completed.includes(s.number);
          const isCurrent = currentStep === s.number;
          const baseClass = cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
            isCurrent
              ? "bg-primary text-primary-foreground"
              : isDone
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
          );
          return (
            <li key={s.number}>
              <Link
                href={`/playbook/${playbookSlug}/step/${s.number}`}
                className={baseClass}
                title={s.title}
              >
                <span className="font-mono">
                  {String(s.number).padStart(2, "0")}
                </span>
                {isDone ? (
                  <Check className="size-3" aria-hidden />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
