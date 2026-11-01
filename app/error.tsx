"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <div className="surface w-full max-w-md animate-scale-in p-8 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold">This page failed to load</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Something went wrong while rendering. Try again, or head back to the Kit Studio.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw className="size-3.5" /> Try again
          </Button>
          <Button variant="outline" render={<Link href="/" />}>
            Kit Studio
          </Button>
        </div>
      </div>
    </div>
  );
}
