import type { MetadataRoute } from "next";
import { getAllAssets } from "@/lib/content";
import { siteConfig } from "@/lib/site-config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const all = await getAllAssets();
  const base = siteConfig.url.replace(/\/$/, "");
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/browse`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/integrations`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/playbooks`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/contribute`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const assetRoutes: MetadataRoute.Sitemap = all
    .filter((a) => a.type !== "playbook")
    .map((a) => ({
      url: `${base}/asset/${a.type}/${a.slug}`,
      lastModified: new Date(a.updatedAt),
      changeFrequency: "monthly" as const,
      priority: a.featured ? 0.8 : 0.6,
    }));

  const playbookRoutes: MetadataRoute.Sitemap = all
    .filter((a) => a.type === "playbook")
    .flatMap((a) => {
      const playbookUrls: MetadataRoute.Sitemap = [
        {
          url: `${base}/playbook/${a.slug}`,
          lastModified: new Date(a.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.95,
        },
      ];
      // Step pages — keep them indexable but lower priority than the intake.
      if (a.type === "playbook") {
        for (const s of a.steps) {
          playbookUrls.push({
            url: `${base}/playbook/${a.slug}/step/${s.number}`,
            lastModified: new Date(a.updatedAt),
            changeFrequency: "monthly" as const,
            priority: 0.5,
          });
        }
      }
      return playbookUrls;
    });

  const categories = Array.from(new Set(all.map((a) => a.category)));
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((slug) => {
    const lastUpdated = all
      .filter((a) => a.category === slug)
      .map((a) => new Date(a.updatedAt).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    return {
      url: `${base}/category/${slug}`,
      lastModified: lastUpdated ? new Date(lastUpdated) : now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    };
  });

  return [
    ...staticRoutes,
    ...assetRoutes,
    ...playbookRoutes,
    ...categoryRoutes,
  ];
}
