import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <div className="surface w-full max-w-md animate-scale-in p-8 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Compass className="size-5" aria-hidden />
        </span>
        <p className="eyebrow mt-4">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          It may have moved, or the asset isn&apos;t in the library yet.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button render={<Link href="/" />}>
            <Home className="size-3.5" /> Kit Studio
          </Button>
          <Button variant="outline" render={<Link href="/browse" />}>
            <Search className="size-3.5" /> Search library
          </Button>
        </div>
      </div>
    </div>
  );
}
