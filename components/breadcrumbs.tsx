import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {c.href && !last ? (
                <Link href={c.href} className="truncate transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate text-foreground">
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
