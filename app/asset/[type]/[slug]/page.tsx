import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AssetCard, TYPE_LABEL } from "@/components/asset-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CopyButton } from "@/components/copy-button";
import { MDXContent } from "@/components/mdx-content";
import { SectionHeading } from "@/components/page-header";
import {
  extractSkillMd,
  getAllAssets,
  getAssetBySlug,
  getRelatedAssets,
  type Asset,
} from "@/lib/content";
import { ASSET_TYPES, type AssetType } from "@/lib/schema";
import { PHASE_META_BY_SLUG, getCategoryName } from "@/lib/taxonomy";
import { claudeCodeOpenUrl } from "@/lib/site-config";

const COPY_LABEL: Record<AssetType, string> = {
  template: "Copy prompt",
  skill: "Copy skill",
  "mcp-config": "Copy config",
  playbook: "Copy playbook",
};

type Params = { type: string; slug: string };

function isAssetType(v: string): v is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(v);
}

export async function generateStaticParams(): Promise<Params[]> {
  const all = await getAllAssets();
  return all
    .filter((a) => a.type !== "playbook")
    .map((a) => ({ type: a.type, slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { type, slug } = await params;
  if (!isAssetType(type)) return {};
  const asset = await getAssetBySlug(type, slug);
  if (!asset) return {};
  return {
    title: asset.title,
    description: asset.description,
  };
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { type, slug } = await params;
  if (!isAssetType(type)) notFound();
  if (type === "playbook") redirect(`/playbook/${slug}`);
  const asset = await getAssetBySlug(type, slug);
  if (!asset) notFound();

  const related = await getRelatedAssets(asset, 4);
  const phase = PHASE_META_BY_SLUG[asset.phase];
  const claudeUrl = claudeCodeOpenUrl(asset.body);
  const exampleText = asset.type === "template" ? asset.output?.example : undefined;
  const skillMd = asset.type === "skill" ? extractSkillMd(asset.body) : null;

  return (
    <div className="container-page py-6">
      <Breadcrumbs
        items={[
          { label: "Library", href: "/browse" },
          { label: phase.name, href: `/browse?phase=${phase.slug}` },
          { label: asset.title },
        ]}
      />

      <header className="surface relative mt-4 overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-brand-2/5" />
        <div className="relative animate-fade-up">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="secondary">{TYPE_LABEL[asset.type]}</Badge>
            <Link href={`/browse?phase=${phase.slug}`}>
              <Badge variant="outline" className="transition-colors hover:border-primary/40">{phase.name}</Badge>
            </Link>
            <Link href={`/category/${asset.category}`}>
              <Badge variant="outline" className="transition-colors hover:border-primary/40">{getCategoryName(asset.category)}</Badge>
            </Link>
            {asset.featured ? (
              <Badge className="bg-warning/15 text-warning">Featured</Badge>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{asset.title}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground sm:text-[15px]">{asset.description}</p>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <ContentTabs asset={asset} exampleText={exampleText} />
        </div>

        <aside className="order-first lg:order-none">
          <div className="surface animate-fade-up space-y-4 p-4 lg:sticky lg:top-20">
            <div className="space-y-2">
              <CopyButton
                value={asset.body}
                label={COPY_LABEL[asset.type]}
                successMessage={`${TYPE_LABEL[asset.type]} copied`}
                className="w-full"
              />
              {skillMd ? (
                <CopyButton
                  value={skillMd}
                  label="Copy as Claude Code skill"
                  successMessage="SKILL.md copied — drop into ~/.claude/skills/"
                  variant="outline"
                  className="w-full"
                />
              ) : null}
              <Button
                variant="secondary"
                className="w-full gap-2"
                render={<a href={claudeUrl} target="_blank" rel="noreferrer noopener" />}
              >
                <Sparkles className="h-4 w-4" /> Open in Claude Code
              </Button>
            </div>
            <Separator />
            <DetailsList asset={asset} />
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-10">
          <SectionHeading eyebrow="Keep going" title="Related assets" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r, i) => (
              <AssetCard key={`${r.type}:${r.slug}`} asset={r} index={i} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ContentTabs({
  asset,
  exampleText,
}: {
  asset: Asset;
  exampleText?: string;
}) {
  return (
    <Tabs defaultValue="prompt" className="w-full">
      <TabsList>
        <TabsTrigger value="prompt">{tabLabelFor(asset.type)}</TabsTrigger>
        <TabsTrigger value="example" disabled={!exampleText}>
          Example
        </TabsTrigger>
        <TabsTrigger value="usage">How to use</TabsTrigger>
      </TabsList>
      <TabsContent value="prompt" className="mt-3 animate-fade-in">
        <article className="prose surface max-w-none p-5 sm:p-7">
          <MDXContent source={asset.body} />
        </article>
      </TabsContent>
      <TabsContent value="example" className="mt-3 animate-fade-in">
        {exampleText ? (
          <div className="surface p-5">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
              {exampleText}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No separate example. Many templates include an example output section in the prompt itself.
          </p>
        )}
      </TabsContent>
      <TabsContent value="usage" className="surface mt-3 animate-fade-in p-5">
        <UsageGuide asset={asset} />
      </TabsContent>
    </Tabs>
  );
}

function tabLabelFor(t: AssetType): string {
  switch (t) {
    case "template":
      return "Prompt";
    case "skill":
      return "Skill";
    case "mcp-config":
      return "Config";
    case "playbook":
      return "Playbook";
  }
}

function DetailsList({ asset }: { asset: Asset }) {
  const items: { label: string; value: string }[] = [
    { label: "Type", value: TYPE_LABEL[asset.type] },
    { label: "Phase", value: PHASE_META_BY_SLUG[asset.phase].name },
    { label: "Category", value: getCategoryName(asset.category) },
    { label: "Difficulty", value: capitalize(asset.difficulty) },
  ];
  if (asset.estimatedTime) items.push({ label: "Time", value: asset.estimatedTime });
  if (asset.author) items.push({ label: "Author", value: asset.author });
  items.push({ label: "Updated", value: asset.updatedAt });

  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-2">
        {items.map((it) => (
          <div key={it.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className="text-right">{it.value}</dd>
          </div>
        ))}
      </dl>
      {(asset.stack ?? []).length > 0 ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Stack
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(asset.stack ?? []).map((s) => (
              <Badge key={s} variant="secondary" className="text-xs font-normal">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {(asset.tags ?? []).length > 0 ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tags
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(asset.tags ?? []).map((t) => (
              <Badge key={t} variant="outline" className="text-xs font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UsageGuide({ asset }: { asset: Asset }) {
  if (asset.type === "template") {
    return (
      <div className="space-y-5 text-sm">
        <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
          <li>
            <span className="text-foreground">Click <em>Copy prompt</em></span>{" "}
            (or open it in Claude Code via the sidebar).
          </li>
          {(asset.inputs ?? []).length > 0 ? (
            <li>
              <span className="text-foreground">
                Substitute the <code className="rounded bg-muted px-1 py-0.5">{`{{variables}}`}</code>
              </span>{" "}
              listed below with your inputs.
            </li>
          ) : null}
          <li>
            <span className="text-foreground">Run it.</span> Iterate on the
            output — most templates work best after 1–2 refinements.
          </li>
        </ol>
        {(asset.inputs ?? []).length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">Inputs</h3>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {(asset.inputs ?? []).map((inp) => (
                <li key={inp.name} className="grid grid-cols-[140px_1fr] gap-3 p-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {inp.name}
                    </code>
                    {inp.required ? (
                      <span className="text-xs font-medium text-warning">required</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">optional</span>
                    )}
                  </div>
                  <p className="text-muted-foreground">{inp.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (asset.type === "skill") {
    return (
      <div className="space-y-5 text-sm">
        <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
          <li>
            <span className="text-foreground">Copy the skill</span> using the
            sidebar button.
          </li>
          <li>
            <span className="text-foreground">
              Drop it into{" "}
              <code className="rounded bg-muted px-1 py-0.5">~/.claude/skills/{asset.skillName}/</code>
            </span>{" "}
            (create folders as needed).
          </li>
          <li>
            <span className="text-foreground">Restart Claude Code.</span> The
            skill auto-triggers when its description matches.
          </li>
        </ol>
        {(asset.requires ?? []).length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">Requires</h3>
            <ul className="mt-2 list-inside list-disc text-muted-foreground">
              {(asset.requires ?? []).map((r, i) => {
                const entry = Object.entries(r)[0];
                return (
                  <li key={i}>
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      {entry[0]}
                    </code>
                    : {entry[1]}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (asset.type === "mcp-config") {
    return (
      <div className="space-y-5 text-sm">
        <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
          <li>
            <span className="text-foreground">Set the env vars</span> listed
            below in your shell profile.
          </li>
          <li>
            <span className="text-foreground">Copy the config</span> from the
            sidebar and paste into your{" "}
            <code className="rounded bg-muted px-1 py-0.5">{asset.configFormat}</code>{" "}
            MCP config file.
          </li>
          <li>
            <span className="text-foreground">Restart Claude Code.</span> Test
            with a simple query.
          </li>
        </ol>
        {(asset.envVars ?? []).length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">Environment variables</h3>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {(asset.envVars ?? []).map((env) => (
                <li key={env.name} className="grid grid-cols-[160px_1fr] gap-3 p-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {env.name}
                    </code>
                    {env.secret ? (
                      <span className="text-xs font-medium text-warning">secret</span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground">
                    <p>{env.description}</p>
                    {env.example ? (
                      <p className="mt-1 text-xs">
                        Example:{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          {env.example}
                        </code>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      See the body for usage instructions.
    </p>
  );
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
