"use client";

/**
 * Presentational building blocks for the Kit Studio workspace. Grids use
 * container queries (`@container` is set on the canvas) so they respond to the
 * space the canvas actually has between the two side rails, not the viewport.
 */

import {
  Boxes,
  Building2,
  Check,
  ClipboardCheck,
  ClipboardList,
  Pencil,
  RotateCcw,
  Telescope,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { KitMcpServer } from "@/lib/kit/mcp-servers";
import { matches } from "./use-kit-builder-state";

export const STEPS = [
  {
    n: 1,
    label: "Discovery",
    hint: "Intake & AI follow-up",
    icon: Telescope,
    blurb:
      "Tell us the problem, share your materials, and the follow-up agent asks what's missing. It turns the answers into a brief, a delivery plan and custom agents and skills for your kit.",
  },
  {
    n: 2,
    label: "Organisation",
    hint: "Policies & guardrails",
    icon: Building2,
    blurb:
      "Company-wide governance, security, compliance and brand policies. Each one you keep becomes an always-on rule in the kit.",
  },
  {
    n: 3,
    label: "Project",
    hint: "Type & profile",
    icon: ClipboardList,
    blurb:
      "Choose the kind of project and answer a few questions. The answers become a profile the agent treats as ground truth.",
  },
  {
    n: 4,
    label: "Stack",
    hint: "Assistant & capabilities",
    icon: Boxes,
    blurb:
      "Pick the target assistant and your technologies. We pre-select matching skills, agents, rules, commands, MCP servers and hooks.",
  },
  {
    n: 5,
    label: "Review",
    hint: "Check & export",
    icon: ClipboardCheck,
    blurb:
      "Check readiness, inspect what the kit contains, open any file in the manifest, then generate the zip.",
  },
] as const;

/** Canvas heading for the active step. */
export function StepHeader({ n, actions }: { n: number; actions?: React.ReactNode }) {
  const step = STEPS[n - 1];
  const Icon = step.icon;
  return (
    <header className="flex flex-col gap-4 border-b border-border/60 pb-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-lg shadow-primary/20">
          <Icon className="size-5" />
          <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-foreground font-mono text-[10px] font-bold text-background">
            {n}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Step {String(n).padStart(2, "0")} <span className="text-border">/</span> {String(STEPS.length).padStart(2, "0")}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{step.label}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{step.blurb}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block on the canvas: header strip, then body. */
export function Panel({
  id,
  icon: Icon,
  title,
  description,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-4 overflow-hidden rounded-xl border bg-card/70", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-muted/30 px-4 py-3">
        {Icon && <Icon className="size-4 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {meta}
          </div>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small numeric pill, e.g. "12/18". */
export function Count({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 font-mono text-[10.5px] font-medium tabular-nums",
        tone === "brand" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export const fieldLabelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** Group label with a hairline rule running to the right edge. */
export function GroupLabel({ children, count }: { children: React.ReactNode; count?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
      {count && <Count>{count}</Count>}
      <span aria-hidden className="h-px flex-1 bg-border/70" />
    </div>
  );
}

/** Toggle token, used for technologies, filters and question answers. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all duration-150 active:scale-95",
        active
          ? "border-primary/50 bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "border-border bg-background/60 text-foreground/75 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
      )}
    >
      {active ? (
        <Check className="size-3 animate-check" strokeWidth={3} />
      ) : (
        <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/40" />
      )}
      {children}
    </button>
  );
}

/** Segmented tab used inside the canvas (capability categories, filters). */
export function SegmentTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className={cn("size-3.5", active && "text-primary")} />}
      {label}
      {count && <Count tone={active ? "brand" : "muted"}>{count}</Count>}
    </button>
  );
}

/** Single-select tile (project type, provider). */
export function OptionCard({
  active,
  title,
  description,
  mono,
  glyph,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  mono?: boolean;
  glyph?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200",
        active
          ? "border-primary/60 bg-primary/[0.07] shadow-md shadow-primary/10"
          : "bg-background/50 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm",
      )}
    >
      {glyph && (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold transition-colors",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          {glyph}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug">{title}</span>
        <span className={cn("mt-0.5 block text-xs leading-relaxed text-muted-foreground", mono && "font-mono text-[11px]")}>
          {description}
        </span>
      </span>
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          active ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {active && <Check className="size-2.5 animate-check" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

/** Responsive tile grid sized by the canvas container. */
export const tileGridClass = "grid grid-cols-1 gap-2 @xl:grid-cols-2 @5xl:grid-cols-3 @[100rem]:grid-cols-4";

/** Multi-select tile with a real checkbox; the whole tile is the hit target. */
export function SelectableRow({
  title,
  description,
  selected,
  recommended,
  onToggle,
  onEdit,
  children,
}: {
  title: string;
  description: string;
  selected: boolean;
  recommended: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 overflow-hidden rounded-lg border py-2.5 pr-2 pl-3 transition-all duration-200",
        selected
          ? "border-primary/40 bg-primary/[0.05]"
          : "bg-background/50 hover:border-primary/30 hover:bg-muted/40",
      )}
    >
      {/* Accent stripe on the leading edge marks selection at a glance. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] origin-top bg-gradient-to-b from-brand to-brand-2 transition-transform duration-300",
          selected ? "scale-y-100" : "scale-y-0",
        )}
      />
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Include ${title}`} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold leading-snug">{title}</span>
            {recommended && (
              <span className="inline-flex h-4 items-center rounded px-1 text-[9.5px] font-semibold uppercase tracking-wider text-success ring-1 ring-success/30">
                Match
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{description}</span>
          {children}
        </span>
      </label>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          title={`Edit ${title}`}
          aria-label={`Edit ${title}`}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-50 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Select all / clear / reset-to-recommended controls for a list of toggles. */
export function BulkActions({
  onAll,
  onNone,
  onReset,
}: {
  onAll: () => void;
  onNone: () => void;
  onReset?: () => void;
}) {
  const btn =
    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className="flex items-center rounded-lg border bg-background/60 p-0.5">
      <button type="button" className={btn} onClick={onAll}>
        Select all
      </button>
      <button type="button" className={btn} onClick={onNone}>
        Clear
      </button>
      {onReset && (
        <button type="button" className={btn} onClick={onReset} title="Back to stack-based recommendations">
          <RotateCcw className="size-3" /> Recommended
        </button>
      )}
    </div>
  );
}

export function PackedRows<T>({
  packs,
  items,
  packOf,
  idOf,
  titleOf,
  descOf,
  recOf,
  selectedOf,
  onToggle,
  onEdit,
  tech,
}: {
  packs: Record<string, string>;
  items: readonly T[];
  packOf: (item: T) => string;
  idOf: (item: T) => string;
  titleOf: (item: T) => string;
  descOf: (item: T) => string;
  recOf: (item: T) => string[];
  selectedOf: (item: T) => boolean;
  onToggle: (item: T) => void;
  onEdit: (item: T) => void;
  tech: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {Object.entries(packs).map(([packId, packLabel]) => {
        const group = items.filter((i) => packOf(i) === packId);
        if (group.length === 0) return null;
        const picked = group.filter(selectedOf).length;
        return (
          <div key={packId}>
            <GroupLabel count={`${picked}/${group.length}`}>{packLabel}</GroupLabel>
            <div className={tileGridClass}>
              {group.map((item) => (
                <SelectableRow
                  key={idOf(item)}
                  title={titleOf(item)}
                  description={descOf(item)}
                  selected={selectedOf(item)}
                  recommended={matches(recOf(item), tech)}
                  onToggle={() => onToggle(item)}
                  onEdit={() => onEdit(item)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function McpServerRow({
  server,
  selected,
  recommended,
  onToggle,
}: {
  server: KitMcpServer;
  selected: boolean;
  recommended: boolean;
  onToggle: () => void;
}) {
  return (
    <SelectableRow
      title={server.name}
      description={server.description}
      selected={selected}
      recommended={recommended}
      onToggle={onToggle}
    >
      {selected && server.envVars.length > 0 && (
        <span className="mt-2 flex animate-fade-in flex-wrap gap-1">
          {server.envVars.map((v) => (
            <span
              key={v.name}
              className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
            >
              {v.name}
            </span>
          ))}
        </span>
      )}
    </SelectableRow>
  );
}
