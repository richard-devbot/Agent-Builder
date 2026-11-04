"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LogOut, Menu, Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SessionUser } from "@/lib/auth/roles";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/studio", label: "Kit Studio" },
  { href: "/browse", label: "Library" },
  { href: "/playbooks", label: "Playbooks" },
  { href: "/contribute", label: "Governance" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/browse") return pathname.startsWith("/browse") || pathname.startsWith("/asset") || pathname.startsWith("/category");
  if (href === "/playbooks") return pathname.startsWith("/playbook");
  return pathname.startsWith(href);
}

export function SiteHeader({ user = null }: { user?: SessionUser | null }) {
  const pathname = usePathname();
  // Workspace-style pages span the full viewport, so their header does too.
  const fullBleed = ["/studio", "/browse"].some((p) => pathname.startsWith(p));
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className={cn("flex h-14 items-center gap-3", fullBleed ? "page-wide" : "container-page")}>
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-sm shadow-primary/20 transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
            <Bot className="size-4.5" aria-hidden />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">{siteConfig.name}</span>
            <span className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {siteConfig.edition}
            </span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="ml-6 hidden items-center gap-0.5 text-[13px] lg:flex">
          {NAV_LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {l.label}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-3 -bottom-[11px] h-0.5 origin-center rounded-full bg-primary transition-transform duration-300",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/browse"
            className="hidden h-8 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:inline-flex"
          >
            <Search className="size-3.5" aria-hidden />
            <span>Search library</span>
          </Link>
          {user && (
            <div className="hidden items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-xs sm:inline-flex">
              <Shield className="size-3.5 text-primary" aria-hidden />
              <span className="max-w-32 truncate font-medium">{user.name}</span>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {user.roles.join(", ")}
              </span>
              <form action="/api/auth/signout" method="POST" className="inline-flex">
                <button
                  type="submit"
                  title="Sign out"
                  className="ml-1 cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label="Sign out"
                >
                  <LogOut className="size-3.5" aria-hidden />
                </button>
              </form>
            </div>
          )}
          <ThemeToggle />
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}
      >
        <Menu className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>{siteConfig.name}</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile navigation" className="mt-2 flex flex-col gap-1 px-4">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                isActive(pathname, l.href) && "bg-primary/10 text-primary",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
