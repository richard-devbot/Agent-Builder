import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { AssetCardGrid } from "@/components/asset-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getAllAssets, getAssetsByCategory } from "@/lib/content";
import {
  CATEGORY_BY_SLUG,
  PHASE_META_BY_SLUG,
  getCategoryName,
} from "@/lib/taxonomy";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const all = await getAllAssets();
  const slugs = Array.from(new Set(all.map((a) => a.category)));
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const meta = CATEGORY_BY_SLUG[slug];
  return {
    title: meta?.name ?? getCategoryName(slug),
    description: meta?.description,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const meta = CATEGORY_BY_SLUG[slug];
  const assets = await getAssetsByCategory(slug);

  if (!meta && assets.length === 0) notFound();

  const phase = meta ? PHASE_META_BY_SLUG[meta.phase] : null;
  const name = meta?.name ?? getCategoryName(slug);

  return (
    <>
      <PageHeader
        eyebrow={phase ? `${phase.name} · Collection` : "Collection"}
        icon={FolderOpen}
        title={name}
        description={meta?.description}
        actions={
          <span className="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
            {assets.length} {assets.length === 1 ? "asset" : "assets"}
          </span>
        }
      >
        <Breadcrumbs
          items={[
            { label: "Library", href: "/browse" },
            ...(phase ? [{ label: phase.name, href: `/browse?phase=${phase.slug}` }] : []),
            { label: name },
          ]}
        />
      </PageHeader>

      <section className="container-page py-6">
        {assets.length === 0 ? (
          <EmptyState
            title="No assets here yet"
            description="This category exists in the taxonomy but has no curated content yet."
            action={<Button render={<Link href="/browse" />}>Browse the library</Button>}
          />
        ) : (
          <AssetCardGrid assets={assets} />
        )}
      </section>
    </>
  );
}
