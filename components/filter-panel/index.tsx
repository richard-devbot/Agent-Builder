"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; count?: number };
export type FilterGroup = {
  key: string;
  label: string;
  options: FilterOption[];
};

/** Long groups (tech stack has ~45 entries) collapse to this many until expanded. */
const VISIBLE_OPTIONS = 8;

export function FilterPanel({
  groups,
  className,
}: {
  groups: FilterGroup[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectedByKey = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const g of groups) {
      const raw = params.get(g.key);
      map[g.key] = new Set(raw ? raw.split(",").filter(Boolean) : []);
    }
    return map;
  }, [groups, params]);

  const totalSelected = useMemo(
    () => Object.values(selectedByKey).reduce((sum, set) => sum + set.size, 0),
    [selectedByKey],
  );

  const updateUrl = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [pathname, router],
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      const after = new Set(selectedByKey[key]);
      if (after.has(value)) after.delete(value);
      else after.add(value);
      if (after.size === 0) next.delete(key);
      else next.set(key, Array.from(after).join(","));
      updateUrl(next);
    },
    [params, selectedByKey, updateUrl],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    for (const g of groups) next.delete(g.key);
    updateUrl(next);
  }, [groups, params, updateUrl]);

  return (
    <aside className={cn("space-y-1 transition-opacity", pending && "opacity-70", className)}>
      <div className="flex h-8 items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold">Filters</h2>
        {totalSelected > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-7 animate-fade-in px-2 text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Clear {totalSelected}
          </Button>
        )}
      </div>
      {groups.map((group) => (
        <FilterSection
          key={group.key}
          group={group}
          selected={selectedByKey[group.key]}
          onToggle={(v) => toggle(group.key, v)}
        />
      ))}
    </aside>
  );
}

function FilterSection({
  group,
  selected,
  onToggle,
}: {
  group: FilterGroup;
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const long = group.options.length > VISIBLE_OPTIONS;
  // Selected options stay visible even when the list is collapsed.
  const shown =
    long && !expanded
      ? group.options.filter((o, i) => i < VISIBLE_OPTIONS || selected.has(o.value))
      : group.options;

  return (
    <div className="border-t border-border/60 py-2 first-of-type:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {group.label}
          {selected.size > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
              {selected.size}
            </span>
          )}
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 flex flex-col gap-px">
            {group.options.length === 0 ? (
              <div className="px-2 py-1 text-xs text-muted-foreground">None</div>
            ) : (
              shown.map((opt) => {
                const checked = selected.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted",
                      checked && "bg-primary/8 text-foreground",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => onToggle(opt.value)} />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {typeof opt.count === "number" && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{opt.count}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 px-2 text-xs font-medium text-primary hover:underline"
            >
              {expanded ? "Show less" : `Show ${group.options.length - VISIBLE_OPTIONS} more`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
