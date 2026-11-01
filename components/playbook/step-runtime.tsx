"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getIntake,
  getProgress,
  markStepComplete,
} from "@/lib/playbook-state";
import { fillStackOnly } from "@/lib/prompt-fill";

type CopyPromptButtonProps = {
  playbookSlug: string;
  promptTemplate: string | null;
  /** Visual label, defaults to "Copy prompt". */
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
};

/**
 * Copies the asset's raw prompt to the clipboard with stack-only
 * substitution applied (so `{{frontend}}` becomes `[your stack: Next.js (App Router)]`,
 * but `{{prd}}` stays as-is for the user to fill in their IDE).
 *
 * Designed to live on individual recommended-asset cards on the step page.
 */
export function CopyPromptButton({
  playbookSlug,
  promptTemplate,
  label = "Copy prompt",
  variant = "default",
}: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (!promptTemplate) {
      toast.error("This asset doesn't have a copy-able prompt body.");
      return;
    }
    try {
      const intake = getIntake(playbookSlug);
      const filled = fillStackOnly(promptTemplate, intake);
      await navigator.clipboard.writeText(filled);
      setCopied(true);
      toast.success("Prompt copied — paste it into your IDE.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select and copy manually.");
    }
  }

  if (!promptTemplate) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className="gap-1.5"
      onClick={handleClick}
    >
      {copied ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {label}
    </Button>
  );
}

type MarkCompleteButtonProps = {
  playbookSlug: string;
  stepNumber: number;
  isLastStep: boolean;
};

/**
 * Advances the user through the playbook. The "completion" is purely
 * navigational — it tracks where the user is in the journey, NOT a
 * claim that the work is done. The user verifies the definition-of-done
 * checklist in their own work; this just moves the playbook forward.
 */
export function MarkCompleteButton({
  playbookSlug,
  stepNumber,
  isLastStep,
}: MarkCompleteButtonProps) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [alreadyComplete, setAlreadyComplete] = useState(false);

  useEffect(() => {
    setAlreadyComplete(
      getProgress(playbookSlug).completed.includes(stepNumber),
    );
    setHydrated(true);
  }, [playbookSlug, stepNumber]);

  function handleClick() {
    markStepComplete(playbookSlug, stepNumber);
    if (isLastStep) {
      router.push(`/playbook/${playbookSlug}/complete`);
    } else {
      router.push(`/playbook/${playbookSlug}/step/${stepNumber + 1}`);
    }
  }

  return (
    <Button size="lg" onClick={handleClick} className="gap-2">
      {hydrated && alreadyComplete ? (
        <>
          <CheckCircle2 className="size-4" aria-hidden />
          {isLastStep ? "Finish playbook" : "Next step"}
          <ArrowRight className="size-4" aria-hidden />
        </>
      ) : (
        <>
          {isLastStep ? "Mark step complete & finish" : "Mark step complete"}
          <ArrowRight className="size-4" aria-hidden />
        </>
      )}
    </Button>
  );
}
