"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resetPlaybook } from "@/lib/playbook-state";

type Deliverable = string;

type NextStep = {
  title: string;
  description?: string;
  href?: string;
};

type Props = {
  playbookSlug: string;
  deliverables: Deliverable[];
  nextSteps: NextStep[];
};

/**
 * Final-screen client component. Lists what the user's project SHOULD have
 * after walking the playbook (deliverables that live in their repo, NOT
 * captured by this site) and what to do next. Also offers a "Start a new
 * playbook" reset.
 */
export function CompletionScreen({
  playbookSlug,
  deliverables,
  nextSteps,
}: Props) {
  function handleReset() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Reset this playbook? Your intake answers and progress will be cleared. (Anything in your project repo is untouched.)",
      )
    ) {
      return;
    }
    resetPlaybook(playbookSlug);
    toast.success("Playbook reset.");
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          By now your project should have
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.015em]">
          Things that live in your repo
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The site doesn&apos;t store any of these — they&apos;re produced and
          owned by you, in your project. This is a checklist for you to
          verify in your own work.
        </p>
        <ul className="mt-4 space-y-2">
          {deliverables.map((d, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-sm"
            >
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden
              />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      {nextSteps.length > 0 ? (
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Recommended next steps
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.015em]">
            Where to go from here
          </h2>
          <ul className="mt-4 space-y-2">
            {nextSteps.map((s, i) => (
              <li
                key={i}
                className="surface card-hover px-4 py-3 text-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s.title}</span>
                  {s.href ? (
                    <Link
                      href={s.href}
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Open
                      <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  ) : null}
                </div>
                {s.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={handleReset}>
          <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
          Start a new run of this playbook
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/playbooks" />}>
            Pick another playbook
          </Button>
          <Button render={<Link href="/browse" />}>Browse all templates</Button>
        </div>
      </div>
    </div>
  );
}
