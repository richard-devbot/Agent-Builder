import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Hammer,
  PencilRuler,
  Rocket,
  TestTube2,
} from "lucide-react";
import { PHASE_COLORS, PHASE_META } from "@/lib/taxonomy";
import { getAllAssets } from "@/lib/content";
import type { Phase } from "@/lib/schema";
import { cn } from "@/lib/utils";

const PHASE_ICON: Record<Phase, typeof Compass> = {
  discover: Compass,
  design: PencilRuler,
  build: Hammer,
  test: TestTube2,
  deploy: Rocket,
};

/** Tailwind classes per phase used to tint the icon, count, and hover ring. */
const PHASE_TINT: Record<
  Phase,
  { icon: string; ring: string; glow: string }
> = {
  discover: {
    icon: "text-sky-600 dark:text-sky-400",
    ring: "group-hover:ring-sky-400/40 dark:group-hover:ring-sky-400/30",
    glow: "group-hover:shadow-[0_8px_24px_-12px_rgb(14_165_233/0.35)]",
  },
  design: {
    icon: "text-violet-600 dark:text-violet-400",
    ring: "group-hover:ring-violet-400/40 dark:group-hover:ring-violet-400/30",
    glow: "group-hover:shadow-[0_8px_24px_-12px_rgb(139_92_246/0.35)]",
  },
  build: {
    icon: "text-emerald-600 dark:text-emerald-400",
    ring: "group-hover:ring-emerald-400/40 dark:group-hover:ring-emerald-400/30",
    glow: "group-hover:shadow-[0_8px_24px_-12px_rgb(16_185_129/0.35)]",
  },
  test: {
    icon: "text-amber-600 dark:text-amber-400",
    ring: "group-hover:ring-amber-400/40 dark:group-hover:ring-amber-400/30",
    glow: "group-hover:shadow-[0_8px_24px_-12px_rgb(245_158_11/0.35)]",
  },
  deploy: {
    icon: "text-rose-600 dark:text-rose-400",
    ring: "group-hover:ring-rose-400/40 dark:group-hover:ring-rose-400/30",
    glow: "group-hover:shadow-[0_8px_24px_-12px_rgb(244_63_94/0.35)]",
  },
};

export async function SDLCFlow() {
  const all = await getAllAssets();
  const counts = PHASE_META.reduce<Record<Phase, number>>(
    (acc, p) => {
      acc[p.slug] = all.filter((a) => a.phase === p.slug).length;
      return acc;
    },
    { discover: 0, design: 0, build: 0, test: 0, deploy: 0 },
  );

  return (
    <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-stretch md:gap-2">
      {PHASE_META.map((phase, idx) => {
        const Icon = PHASE_ICON[phase.slug];
        const count = counts[phase.slug];
        const tint = PHASE_TINT[phase.slug];
        const color = PHASE_COLORS[phase.slug];
        const isLast = idx === PHASE_META.length - 1;

        return (
          <div
            key={phase.slug}
            className="flex flex-col items-stretch md:flex-1 md:flex-row md:items-center"
          >
            <Link
              href={`/browse?phase=${phase.slug}`}
              className={cn(
                "group relative flex h-full flex-1 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all duration-200",
                "hover:-translate-y-0.5",
                tint.ring,
                tint.glow,
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md transition-colors",
                    color.chip,
                  )}
                >
                  <Icon className={cn("size-4", tint.icon)} aria-hidden />
                </span>
              </div>
              <div className="mt-4">
                <div className="text-base font-semibold tracking-tight">
                  {phase.name}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {phase.short}
                </div>
              </div>
              <div className="mt-4 inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {count}
                </span>
                <span>{count === 1 ? "asset" : "assets"}</span>
              </div>
            </Link>

            {!isLast ? (
              <div
                aria-hidden
                className={cn(
                  "flex items-center justify-center text-muted-foreground/40",
                  "py-1 md:py-0 md:px-1",
                )}
              >
                <ChevronDown className="h-5 w-5 md:hidden" />
                <ChevronRight className="hidden h-5 w-5 md:block" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
