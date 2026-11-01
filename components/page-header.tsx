import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;

/** Compact page intro used by every top-level route. */
export function PageHeader({
  eyebrow,
  icon: EyebrowIcon,
  title,
  highlight,
  description,
  actions,
  children,
  className,
  wide = false,
}: {
  eyebrow?: string;
  icon?: Icon;
  title: string;
  /** Trailing part of the title rendered in the brand gradient. */
  highlight?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Rendered under the intro, e.g. a <StatGrid>. */
  children?: ReactNode;
  className?: string;
  /** Span the full viewport width instead of the centred page container. */
  wide?: boolean;
}) {
  return (
    <section className={cn("relative border-b border-border/60", className)}>
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <div className={cn("relative py-8 md:py-10", wide ? "page-wide" : "container-page")}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl animate-fade-up">
            {eyebrow && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                {EyebrowIcon && <EyebrowIcon className="size-3" />}
                {eyebrow}
              </div>
            )}
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-[2.125rem]">
              {title}
              {highlight && (
                <>
                  {" "}
                  <span className="text-gradient">{highlight}</span>
                </>
              )}
            </h1>
            {description && (
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex min-w-0 animate-fade-up flex-wrap items-center gap-2 [animation-delay:80ms] lg:shrink-0">
              {actions}
            </div>
          )}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

export type Stat = {
  icon: Icon;
  label: string;
  value: string;
  hint?: string;
};

/** Dense KPI row: icon + label + value, one line of supporting text. */
export function StatGrid({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5",
        items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
    >
      {items.map((s, i) => (
        <div
          key={s.label}
          style={{ "--i": i } as React.CSSProperties}
          className="surface stagger group flex animate-fade-up items-start gap-3 p-3.5"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-110">
            <s.icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-0.5 text-sm font-semibold leading-snug">{s.value}</div>
            {s.hint && (
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{s.hint}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Section title row used inside pages. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  aside,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {aside && <div className="shrink-0 text-xs text-muted-foreground">{aside}</div>}
    </div>
  );
}
