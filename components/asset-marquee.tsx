import Link from "next/link";
import { CATEGORY_ICON, TYPE_ICON } from "@/components/asset-card";
import type { Asset } from "@/lib/content";
import { PHASE_COLORS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

/**
 * Two counter-scrolling rows of icon chips that drift continuously (CSS only).
 * Hovering pauses a row. The duplicated half exists only so the loop is
 * seamless, so it is hidden from assistive tech and the tab order.
 */
export function AssetMarquee({ assets }: { assets: Asset[] }) {
  const half = Math.ceil(assets.length / 2);
  const rows = [assets.slice(0, half), assets.slice(half)];
  return (
    <div className="marquee relative flex flex-col gap-3 overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      {rows.map((row, r) => (
        <div
          key={r}
          className={cn("flex w-max animate-marquee gap-3", r === 1 && "[animation-direction:reverse]")}
          style={{ "--marquee-duration": `${Math.max(30, row.length * 4)}s` } as React.CSSProperties}
        >
          {[0, 1].map((copy) =>
            row.map((a) => {
              const Glyph = CATEGORY_ICON[a.category] ?? TYPE_ICON[a.type];
              return (
                <Link
                  key={`${copy}-${a.type}-${a.slug}`}
                  href={`/asset/${a.type}/${a.slug}`}
                  aria-hidden={copy === 1 || undefined}
                  tabIndex={copy === 1 ? -1 : undefined}
                  style={{ "--tile": PHASE_COLORS[a.phase].accent } as React.CSSProperties}
                  className="group flex shrink-0 items-center gap-2.5 rounded-full border bg-card/80 py-1.5 pr-4 pl-1.5 transition-colors hover:border-[var(--tile)]"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--tile)_18%,transparent)] text-[var(--tile)] transition-transform duration-300 group-hover:rotate-[-10deg] group-hover:scale-110">
                    <Glyph className="size-4" aria-hidden />
                  </span>
                  <span className="max-w-56 truncate text-[13px] font-medium">{a.title}</span>
                </Link>
              );
            }),
          )}
        </div>
      ))}
    </div>
  );
}
