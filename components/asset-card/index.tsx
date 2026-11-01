import Link from "next/link";
import {
  Accessibility,
  Activity,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Cable,
  Clock,
  Cloud,
  Component,
  Container,
  Database,
  DatabaseZap,
  FileText,
  FlaskConical,
  FormInput,
  Gauge,
  Gavel,
  GitBranch,
  GitPullRequest,
  Hammer,
  KeyRound,
  Landmark,
  Layers,
  LayoutTemplate,
  ListChecks,
  Lock,
  Megaphone,
  MonitorSmartphone,
  MousePointerClick,
  Network,
  Palette,
  PenTool,
  Plug,
  Puzzle,
  Rocket,
  Server,
  ShieldAlert,
  Shuffle,
  Split,
  Star,
  Telescope,
  TestTube,
  Ticket,
  UserRound,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { PhaseChip } from "@/components/phase-chip";
import type { Asset } from "@/lib/content";
import type { AssetType, Phase } from "@/lib/schema";
import { PHASE_COLORS, getCategoryName } from "@/lib/taxonomy";

export const TYPE_LABEL: Record<AssetType, string> = {
  template: "Template",
  skill: "Skill",
  "mcp-config": "MCP config",
  playbook: "Playbook",
};

export const TYPE_ICON: Record<AssetType, typeof FileText> = {
  template: FileText,
  skill: Layers,
  "mcp-config": Plug,
  playbook: Workflow,
};

type Icon = typeof FileText;

export const PHASE_ICON: Record<Phase, Icon> = {
  discover: Telescope,
  design: PenTool,
  build: Hammer,
  test: FlaskConical,
  deploy: Rocket,
};

/** One glyph per taxonomy category; callers fall back to TYPE_ICON for unknown ones. */
export const CATEGORY_ICON: Record<string, Icon | undefined> = {
  "product-briefs": FileText,
  "user-stories": Users,
  personas: UserRound,
  "epic-breakdown": Split,
  "acceptance-criteria": ListChecks,
  "jira-tickets": Ticket,
  architecture: Network,
  "system-design": Boxes,
  adr: Gavel,
  "api-design": Webhook,
  "database-design": Database,
  "ux-design": Palette,
  wireframes: LayoutTemplate,
  "design-systems": Component,
  accessibility: Accessibility,
  governance: Landmark,
  "frontend-development": MonitorSmartphone,
  "backend-development": Server,
  "api-development": Webhook,
  "database-development": DatabaseZap,
  auth: KeyRound,
  integrations: Cable,
  forms: FormInput,
  "state-management": Shuffle,
  "secure-coding": Lock,
  "unit-testing": TestTube,
  "integration-testing": Puzzle,
  "e2e-testing": MousePointerClick,
  "code-review": GitPullRequest,
  performance: Gauge,
  "security-review": ShieldAlert,
  dockerization: Container,
  "ci-cd": GitBranch,
  "infrastructure-as-code": Cloud,
  monitoring: Activity,
  documentation: BookOpen,
  "release-notes": Megaphone,
};

/**
 * Icon-led showcase tile for the library rails: a phase-tinted artwork panel
 * with the category glyph, then title, summary and meta. Fixed width so it can
 * sit in a horizontal scroll-snap rail.
 */
export function AssetTile({ asset }: { asset: Asset }) {
  const Glyph = CATEGORY_ICON[asset.category] ?? TYPE_ICON[asset.type];
  const TypeIcon = TYPE_ICON[asset.type];
  const color = PHASE_COLORS[asset.phase];
  return (
    <Link
      href={`/asset/${asset.type}/${asset.slug}`}
      style={{ "--tile": color.accent } as React.CSSProperties}
      className="asset-tile group relative flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-card/80 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-[color-mix(in_oklch,var(--tile)_50%,var(--border))] hover:shadow-[0_18px_40px_-18px_var(--tile)] focus-visible:ring-2 focus-visible:ring-primary sm:w-72"
    >
      {/* Artwork */}
      <div className="relative h-32 overflow-hidden bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_oklch,var(--tile)_32%,transparent),transparent_60%)]">
        <div aria-hidden className="bg-grid absolute inset-0 opacity-70" />
        <Glyph
          aria-hidden
          strokeWidth={1}
          className="absolute -right-5 -bottom-6 size-32 rotate-[-12deg] text-[var(--tile)] opacity-15 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110"
        />
        <span className="absolute top-5 left-5 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-[color-mix(in_oklch,var(--tile)_85%,black)] text-white shadow-lg shadow-[color-mix(in_oklch,var(--tile)_40%,transparent)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-[-6deg]">
          <Glyph className="size-6" aria-hidden />
        </span>
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
          <TypeIcon className="size-3" aria-hidden />
          {TYPE_LABEL[asset.type]}
        </span>
        {asset.featured && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning backdrop-blur">
            <Star className="size-2.5 fill-current" aria-hidden /> Featured
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4 pt-3">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--tile)]">{getCategoryName(asset.category)}</p>
        <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug transition-colors group-hover:text-primary">
          {asset.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{asset.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="capitalize">{asset.difficulty}</span>
            {asset.estimatedTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden /> {asset.estimatedTime}
              </span>
            )}
          </span>
          <ArrowUpRight
            className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}

export function AssetCard({ asset, index = 0 }: { asset: Asset; index?: number }) {
  const TypeIcon = TYPE_ICON[asset.type];
  const tags = [...(asset.stack ?? []), ...(asset.tags ?? [])];
  const uniqueTags = Array.from(new Set(tags)).slice(0, 3);

  return (
    <Link
      href={`/asset/${asset.type}/${asset.slug}`}
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
      className="surface card-hover stagger group flex h-full animate-fade-up flex-col p-4 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <TypeIcon className="size-3.5" aria-hidden />
          </span>
          {TYPE_LABEL[asset.type]}
        </span>
        {asset.featured && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            <Star className="size-2.5 fill-current" aria-hidden />
            Featured
          </span>
        )}
      </div>

      <h3 className="mt-3 text-[14px] font-semibold leading-snug transition-colors group-hover:text-primary">
        {asset.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {asset.description}
      </p>

      <div className="mb-3 mt-3 flex flex-wrap gap-1">
        {uniqueTags.map((t) => (
          <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <PhaseChip phase={asset.phase} size="xs" />
          <span className="capitalize">{asset.difficulty}</span>
        </span>
        <ArrowUpRight
          className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function AssetCardGrid({ assets }: { assets: Asset[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {assets.map((a, i) => (
        <AssetCard key={`${a.type}:${a.slug}`} asset={a} index={i} />
      ))}
    </div>
  );
}
