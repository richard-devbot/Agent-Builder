import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompletionScreen } from "@/components/playbook/completion-screen";
import {
  getAllAssets,
  getAllPlaybooks,
  getPlaybookBySlug,
} from "@/lib/content";
import type { Asset } from "@/lib/content";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const playbooks = await getAllPlaybooks();
  return playbooks.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const playbook = await getPlaybookBySlug(slug);
  if (!playbook) return {};
  return {
    title: `${playbook.title} — complete`,
    description: `What your project should have after walking the ${playbook.title}.`,
  };
}

function hrefForAsset(a: Asset): string {
  if (a.type === "playbook") return `/playbook/${a.slug}`;
  return `/asset/${a.type}/${a.slug}`;
}

export default async function PlaybookCompletePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const playbook = await getPlaybookBySlug(slug);
  if (!playbook) notFound();

  // If the playbook didn't define a wrapUp, fall back to listing each step's
  // primary deliverable (its title) so the screen still renders sensibly.
  const deliverables =
    playbook.wrapUp?.deliverables ??
    playbook.steps.map((s) => `Step ${s.number} done: ${s.title}`);

  // Resolve each next-step link against the asset index so we only surface
  // working links (forward-looking refs are dropped silently).
  const all = await getAllAssets();
  const bySlug = new Map<string, Asset>(all.map((a) => [a.slug, a]));
  const nextSteps =
    playbook.wrapUp?.nextSteps?.map((s) => {
      const linked = s.assetSlug ? bySlug.get(s.assetSlug) : undefined;
      return {
        title: s.title,
        description: s.description,
        href: linked ? hrefForAsset(linked) : undefined,
      };
    }) ?? [];

  return (
    <div className="container-page py-6">
      <Breadcrumbs
        items={[
          { label: "Playbooks", href: "/playbooks" },
          { label: playbook.title, href: `/playbook/${playbook.slug}` },
          { label: "Complete" },
        ]}
      />

      <header className="surface relative mt-4 overflow-hidden p-6 text-center sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success/12 via-transparent to-primary/10" />
        <div className="relative animate-scale-in">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success ring-1 ring-success/25">
            <Trophy className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Playbook complete</h1>
          <p className="mx-auto mt-1.5 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
            What your project should have now, and where to go next.
          </p>
        </div>
      </header>

      <div className="surface mt-5 animate-fade-up p-5 sm:p-6">
        <CompletionScreen
          playbookSlug={playbook.slug}
          deliverables={deliverables}
          nextSteps={nextSteps}
        />
      </div>
    </div>
  );
}
