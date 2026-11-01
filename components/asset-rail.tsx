"use client";

/**
 * Horizontal, scroll-snapping row of asset tiles with arrow controls, faded
 * edges and a progress bar. "Show all" switches the row to a wrapped grid.
 * Tiles animate in as they scroll into the rail (CSS scroll-driven animation,
 * see `.rail-scroller` in globals.css).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GalleryHorizontal, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export function AssetRail({
  id,
  icon,
  title,
  subtitle,
  count,
  accent,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState(false);
  const [pos, setPos] = useState({ start: true, end: false, progress: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setPos({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft >= max - 4,
      progress: max > 0 ? el.scrollLeft / max : 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, grid]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const scrollable = !grid && !(pos.start && pos.end);

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32" style={{ "--rail": accent } as React.CSSProperties}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--rail)_16%,transparent)] text-[var(--rail)] ring-1 ring-[color-mix(in_oklch,var(--rail)_30%,transparent)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
            {title}
            <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
          </h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setGrid((g) => !g)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background/60 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            aria-pressed={grid}
          >
            {grid ? <GalleryHorizontal className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
            <span className="hidden sm:inline">{grid ? "Scroll view" : "Show all"}</span>
          </button>
          {!grid && (
            <>
              <RailButton label={`Scroll ${title} left`} disabled={pos.start} onClick={() => page(-1)}>
                <ChevronLeft className="size-4" />
              </RailButton>
              <RailButton label={`Scroll ${title} right`} disabled={pos.end} onClick={() => page(1)}>
                <ChevronRight className="size-4" />
              </RailButton>
            </>
          )}
        </div>
      </div>

      <div
        ref={ref}
        onScroll={measure}
        className={cn(
          grid
            ? "grid animate-fade-in grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 *:w-auto!"
            : "rail-scroller flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pt-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          scrollable && !pos.start && !pos.end && "rail-fade-both",
          scrollable && pos.start && "rail-fade-end",
          scrollable && pos.end && "rail-fade-start",
        )}
      >
        {children}
      </div>

      {scrollable && (
        <div className="mx-auto mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-[var(--rail)] transition-[width] duration-150"
            style={{ width: `${Math.max(12, pos.progress * 100)}%` }}
          />
        </div>
      )}
    </section>
  );
}

function RailButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg border bg-background/60 text-foreground transition-all hover:border-[var(--rail)] hover:text-[var(--rail)] active:scale-95 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
