/** Derived status shown in the navigator, the manifest and the Review step. */

import { PROVIDER_LABEL } from "@/lib/kit/build-kit";
import { PROJECT_TYPES } from "@/lib/kit/project-types";
import type { KitBuilderState } from "./use-kit-builder-state";

export type ReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  /** Optional checks never block; they only add value. */
  optional?: boolean;
  step: number;
};

export function readiness(s: KitBuilderState): ReadinessCheck[] {
  const type = PROJECT_TYPES.find((t) => t.id === s.projectType);
  return [
    {
      id: "assistant",
      label: "Target assistant",
      detail: PROVIDER_LABEL[s.provider],
      ok: true,
      step: 4,
    },
    {
      id: "tech",
      label: "Technologies",
      detail: s.tech.size ? `${s.tech.size} selected` : "None selected, so few recommendations apply",
      ok: s.tech.size > 0,
      step: 4,
    },
    {
      id: "type",
      label: "Project type",
      detail: type ? type.label : "Not set, so no starter playbook",
      ok: Boolean(type),
      step: 3,
    },
    {
      id: "org",
      label: "Organisation policies",
      detail: s.orgGuidelineSel.size ? `${s.orgGuidelineSel.size} always-on rules` : "None enabled",
      ok: s.orgGuidelineSel.size > 0,
      step: 2,
    },
    {
      id: "hooks",
      label: "Guardrail hooks",
      detail: s.selection.hooks.length ? `${s.selection.hooks.length} active` : "None active, so risky actions are not blocked",
      ok: s.selection.hooks.length > 0,
      step: 4,
    },
    {
      id: "context",
      label: "Project context",
      detail: s.intake.score
        ? `Discovery brief ${s.intake.score}% complete${s.discovery ? ", repository analysed" : ""}`
        : s.discovery
          ? "Repository analysed"
          : "Built by the discovery agent on first run",
      ok: s.intake.score >= 60 || Boolean(s.discovery),
      optional: true,
      step: 1,
    },
  ];
}

/** Short status line for each step in the navigator. */
export function stepStatus(s: KitBuilderState, n: number): string {
  switch (n) {
    case 1:
      if (s.intake.plan) return `Brief ${s.intake.score}% · plan ready`;
      if (s.intake.score) return `Brief ${s.intake.score}% complete`;
      return s.discovery || s.authoredSkills.length ? "Context added" : "Start here";
    case 2:
      return `${s.orgGuidelineSel.size} policies`;
    case 3:
      return PROJECT_TYPES.find((t) => t.id === s.projectType)?.label ?? "Type not set";
    case 4:
      return `${s.tech.size} tech · ${PROVIDER_LABEL[s.provider]}`;
    default:
      return `${s.files.length} files`;
  }
}
