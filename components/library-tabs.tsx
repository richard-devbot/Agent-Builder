import Link from "next/link";
import { Boxes, Library } from "lucide-react";
import { cn } from "@/lib/utils";

/** Switches between the two halves of the Library. */
export function LibraryTabs({ active, assetCount, skillCount }: { active: "assets" | "skills"; assetCount: number; skillCount: number }) {
  const tabs = [
    { id: "assets", href: "/browse", label: "SDLC assets", icon: Library, count: assetCount },
    { id: "skills", href: "/browse/skills", label: "Skill catalog", icon: Boxes, count: skillCount },
  ] as const;
  return (
    <nav aria-label="Library sections" className="inline-flex rounded-xl border bg-card/70 p-1">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-colors",
            active === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <t.icon className="size-4" />
          {t.label}
          <span className="font-mono text-[11px] opacity-75">{t.count.toLocaleString()}</span>
        </Link>
      ))}
    </nav>
  );
}
