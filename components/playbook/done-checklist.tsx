"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { getChecklist, setChecklist } from "@/lib/playbook-state";
import { cn } from "@/lib/utils";

/** Definition-of-done list with ticks saved per step in localStorage. */
export function DoneChecklist({
  playbookSlug,
  stepNumber,
  items,
}: {
  playbookSlug: string;
  stepNumber: number;
  items: string[];
}) {
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    // localStorage is only readable after mount; syncing it into state here is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecked(getChecklist(playbookSlug, stepNumber));
  }, [playbookSlug, stepNumber]);

  function toggle(i: number) {
    const next = checked.includes(i) ? checked.filter((n) => n !== i) : [...checked, i].sort((a, b) => a - b);
    setChecked(next);
    setChecklist(playbookSlug, stepNumber, next);
  }

  const done = checked.length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="surface p-3">
      <div className="mb-2 flex items-center gap-3 px-1">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("text-[11px] tabular-nums", done === items.length && items.length > 0 ? "font-semibold text-success" : "text-muted-foreground")}>
          {done}/{items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const on = checked.includes(i);
          return (
            <li key={i}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/60",
                  on && "bg-success/6",
                )}
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={() => toggle(i)}
                  className="mt-0.5 data-checked:border-success data-checked:bg-success"
                />
                <span className={cn("transition-colors", on && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                  {item}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
