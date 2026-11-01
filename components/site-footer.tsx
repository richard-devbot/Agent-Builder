"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

const COLUMNS = [
  {
    title: "Build",
    links: [
      { href: "/studio", label: "Kit Studio" },
      { href: "/integrations", label: "Cloud Deploy" },
    ],
  },
  {
    title: "Library",
    links: [
      { href: "/browse", label: "All assets" },
      { href: "/playbooks", label: "Playbooks" },
    ],
  },
  {
    title: "Governance",
    links: [{ href: "/contribute", label: "Contribution charter" }],
  },
] as const;

export function SiteFooter() {
  const pathname = usePathname();
  // The studio workspace fills the viewport; a footer below it would only add scroll.
  if (pathname.startsWith("/studio")) return null;
  const wrap = pathname.startsWith("/browse") ? "page-wide" : "container-page";
  return (
    <footer className="mt-20 border-t border-border/60 bg-surface/60">
      <div className={`${wrap} grid gap-8 py-10 md:grid-cols-[1.4fr_repeat(3,1fr)]`}>
        <div>
          <div className="text-sm font-semibold">{siteConfig.name}</div>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {siteConfig.tagline}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            Runs in your browser. Your code is never uploaded.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {col.title}
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-foreground/80 transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60">
        <div className={`${wrap} flex flex-col gap-1 py-4 text-[11px] text-muted-foreground sm:flex-row sm:justify-between`}>
          <span>© {new Date().getFullYear()} {siteConfig.author}</span>
          <span>{siteConfig.edition}</span>
        </div>
      </div>
    </footer>
  );
}
