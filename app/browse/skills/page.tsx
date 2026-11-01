import { Suspense } from "react";
import { Boxes } from "lucide-react";
import { LibraryTabs } from "@/components/library-tabs";
import { PageHeader } from "@/components/page-header";
import { SkillExplorer } from "@/components/skill-catalog/explorer";
import { getAllAssets } from "@/lib/content";
import { getCatalogIndex, getCuratedCatalogSkills } from "@/lib/skill-catalog/server";

export const metadata = { title: "Skill catalog" };

export default async function SkillCatalogPage() {
  const [curated, index, assets] = await Promise.all([getCuratedCatalogSkills(), getCatalogIndex(), getAllAssets()]);
  const total = curated.length + index.skills.length;
  const kitReady = curated.length + index.skills.filter((s) => s.copyable).length;
  return (
    <>
      <PageHeader
        wide
        eyebrow="Skill catalog"
        icon={Boxes}
        title={`${total.toLocaleString()} agent skills,`}
        highlight="organised by domain."
        description={`Curated skills plus Google's official skills, the skills.sh topic collections and Agentic Awesome Skills. ${kitReady.toLocaleString()} can be copied straight into a kit; the rest install with one command.`}
        actions={<LibraryTabs active="skills" assetCount={assets.filter((a) => a.type !== "playbook").length} skillCount={total} />}
      />
      <Suspense>
        <SkillExplorer curated={curated} />
      </Suspense>
    </>
  );
}
