import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Database,
  GitBranch,
  Layers,
  ListChecks,
  Lock,
  Map,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeading, StatGrid, type Stat } from "@/components/page-header";
import { getAllPlaybooks } from "@/lib/content";
import { cn } from "@/lib/utils";

export const metadata = { title: "Playbooks" };

type Icon = React.ComponentType<{ className?: string }>;

const COMING_SOON = [
  {
    name: "Data Engineering",
    tagline: "dbt models, lakehouse table contracts, orchestration and data governance.",
    icon: Database,
  },
] as const;

const STATS: Stat[] = [
  { icon: GitBranch, label: "Phase-gated", value: "Measurable exit criteria", hint: "Each step ends with a definition of done." },
  { icon: ShieldCheck, label: "Risk control", value: "Strangler-fig coexistence", hint: "Incremental cutover with a rollback path." },
  { icon: Users, label: "Accountability", value: "Separation of duties", hint: "Builders, validators and human approvers stay distinct." },
];

/** Icon per playbook; data platforms get the database glyph. */
const ICON_FOR_SLUG: Record<string, Icon> = {
  "custom-web-app": Layers,
  "database-migration-playbook": Database,
  "azure-data-platform-modernization-playbook": Database,
  "legacy-etl-to-azure-modernization-playbook": Database,
};

/** Frontmatter time estimates can be a full sentence; cards show the first clause. */
function shortTime(t: string | null): string | null {
  if (!t) return null;
  return t.split(/\s[—–-]\s|;|,/)[0].trim();
}

export default async function PlaybooksPage() {
  const playbooks = await getAllPlaybooks();
  const sorted = [...playbooks].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return (
    <>
      <PageHeader
        eyebrow="Delivery playbooks"
        icon={Map}
        title="Modernisation and delivery,"
        highlight="step by step."
        description="Phased, spec-driven blueprints for core migrations and new builds. Each one chains discovery prompts, parity tests and rollback runbooks."
        actions={
          <Button variant="outline" render={<Link href="/browse" />}>
            Browse single templates <ArrowRight className="size-3.5" />
          </Button>
        }
      >
        <StatGrid items={STATS} />
      </PageHeader>

      <section aria-labelledby="choose-heading" className="container-page py-8">
        <SectionHeading
          title="Choose a starting point"
          aside={`${sorted.length} available · ${COMING_SOON.length} planned`}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sorted.map((pb, i) => (
            <PlaybookCard
              key={pb.slug}
              index={i}
              href={`/playbook/${pb.slug}`}
              icon={ICON_FOR_SLUG[pb.slug] ?? Workflow}
              title={pb.title}
              description={pb.description}
              steps={pb.steps.length || null}
              time={shortTime(pb.totalEstimatedTime ?? pb.estimatedTime ?? null)}
            />
          ))}
          {COMING_SOON.map((c, i) => (
            <PlaybookCard
              key={c.name}
              index={sorted.length + i}
              icon={c.icon}
              title={c.name}
              description={c.tagline}
              steps={null}
              time={null}
            />
          ))}
        </div>

        <div className="surface mt-8 flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            Have a delivery pattern that worked? Submit it through the governance review.
          </p>
          <Button variant="ghost" render={<Link href="/contribute" />}>
            Contribute a playbook <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </section>
    </>
  );
}

/** A playbook card. Without `href` it renders as a disabled "planned" card. */
function PlaybookCard({
  href,
  icon: Icon,
  title,
  description,
  steps,
  time,
  index,
}: {
  href?: string;
  icon: Icon;
  title: string;
  description: string;
  steps: number | null;
  time: string | null;
  index: number;
}) {
  const planned = !href;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]">
          <Icon className="size-4.5" aria-hidden />
        </span>
        {planned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            <Lock className="size-2.5" aria-hidden /> Planned
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 text-[10.5px] font-medium text-success">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            Available
          </span>
        )}
      </div>

      <h3 className="mt-3 text-[15px] font-semibold leading-snug transition-colors group-hover:text-primary">
        {title}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-auto flex items-center gap-4 border-t border-border/60 pt-3 text-xs text-muted-foreground [margin-top:auto]">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="size-3.5" aria-hidden />
          <span className="font-medium text-foreground tabular-nums">{steps ?? "—"}</span> steps
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{time ?? "—"}</span>
        </span>
        {!planned && (
          <ArrowRight className="ml-auto size-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
        )}
      </div>
    </>
  );

  const className = cn(
    "surface stagger group flex h-full min-h-48 animate-fade-up flex-col gap-0 p-4",
    planned ? "cursor-not-allowed opacity-60" : "card-hover",
  );
  const style = { "--i": index } as React.CSSProperties;

  return planned ? (
    <div aria-disabled className={className} style={style}>
      {body}
    </div>
  ) : (
    <Link href={href} className={className} style={style}>
      {body}
    </Link>
  );
}
