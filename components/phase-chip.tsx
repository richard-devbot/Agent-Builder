import { cn } from "@/lib/utils";
import { PHASE_COLORS, PHASE_META_BY_SLUG } from "@/lib/taxonomy";
import type { Phase } from "@/lib/schema";

type Size = "xs" | "sm";

export function PhaseChip({
  phase,
  size = "sm",
  showDot = true,
  className,
}: {
  phase: Phase;
  size?: Size;
  showDot?: boolean;
  className?: string;
}) {
  const color = PHASE_COLORS[phase];
  const meta = PHASE_META_BY_SLUG[phase];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 font-medium",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        color.chip,
        className,
      )}
    >
      {showDot ? (
        <span
          aria-hidden
          className={cn(
            "inline-block rounded-full",
            color.dot,
            size === "xs" ? "size-1" : "size-1.5",
          )}
        />
      ) : null}
      {meta.name}
    </span>
  );
}
