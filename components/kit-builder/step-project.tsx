"use client";

/** Step 3 — project type, project name, and project-level questions. */

import { ClipboardList, FolderKanban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PROJECT_TYPES } from "@/lib/kit/project-types";
import { QuestionList } from "./question-list";
import { Count, OptionCard, Panel, StepHeader, fieldLabelClass } from "./primitives";
import type { KitBuilderState } from "./use-kit-builder-state";

const TYPE_GLYPH: Record<string, string> = { greenfield: "GF", brownfield: "BF", "legacy-migration": "LM" };

export function StepProject({ s }: { s: KitBuilderState }) {
  const answered = s.baseProjectQuestions.filter((q) => (s.projectAnswers[q.id] ?? []).length > 0).length;
  return (
    <>
      <StepHeader n={3} />

      <Panel
        id="project-type"
        icon={FolderKanban}
        title="Project type"
        description="Sets the starter playbook and which questions we ask. Click again to clear."
      >
        <div className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-3">
          {PROJECT_TYPES.map((t) => (
            <OptionCard
              key={t.id}
              active={s.projectType === t.id}
              glyph={TYPE_GLYPH[t.id]}
              title={t.label}
              description={t.blurb}
              onClick={() => s.setProjectType(s.projectType === t.id ? null : t.id)}
            />
          ))}
        </div>
      </Panel>

      <Panel
        id="project-profile"
        icon={ClipboardList}
        title="Project profile"
        description="Answers become a profile the agent treats as ground truth on every task."
        meta={
          s.baseProjectQuestions.length > 0 && (
            <Count tone={answered ? "brand" : "muted"}>{`${answered}/${s.baseProjectQuestions.length} answered`}</Count>
          )
        }
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-1 @4xl:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="border-b border-border/60 p-4 @4xl:border-r @4xl:border-b-0">
            <label htmlFor="project-name" className={fieldLabelClass}>
              Project name <span className="font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <Input
              id="project-name"
              value={s.projectName}
              onChange={(e) => s.setProjectName(e.target.value)}
              placeholder="e.g. Helix Billing Service"
              className="h-9"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Shown in the studio and written into the profile and ADK package name.
            </p>
          </div>
          <div className="min-w-0 p-4">
            <QuestionList s={s} questions={s.baseProjectQuestions} />
          </div>
        </div>
      </Panel>
    </>
  );
}
