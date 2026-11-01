"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getIntake,
  resetPlaybook,
  setIntake,
  type IntakeValues,
} from "@/lib/playbook-state";
import type { IntakeField } from "@/lib/schema";

type Props = {
  playbookSlug: string;
  intakeFields: IntakeField[];
  /**
   * Path the user lands on once intake is submitted, e.g. `/playbook/foo/step/1`.
   * Pass `null` for "guide-mode" playbooks (no structured steps) — the form
   * just saves intake to localStorage and toasts a confirmation; no navigation.
   */
  firstStepHref: string | null;
};

/**
 * Intake values are stored in localStorage as a flat string map. For
 * stack-selector fields, we expand to three keys: `${name}_frontend`,
 * `${name}_backend`, `${name}_database` — and also short aliases
 * `frontend` / `backend` / `database` for convenient prompt substitution.
 */
function flattenStackValues(name: string, value: { frontend: string; backend: string; database: string }): IntakeValues {
  return {
    [`${name}_frontend`]: value.frontend,
    [`${name}_backend`]: value.backend,
    [`${name}_database`]: value.database,
    frontend: value.frontend,
    backend: value.backend,
    database: value.database,
  };
}

function emptyState(fields: IntakeField[]): IntakeValues {
  const out: IntakeValues = {};
  for (const f of fields) {
    if (f.type === "stack-selector") {
      Object.assign(
        out,
        flattenStackValues(f.name, { frontend: "", backend: "", database: "" }),
      );
    } else {
      out[f.name] = "";
    }
  }
  return out;
}

export function PlaybookIntakeForm({
  playbookSlug,
  intakeFields,
  firstStepHref,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<IntakeValues>(() =>
    emptyState(intakeFields),
  );
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    const stored = getIntake(playbookSlug);
    if (Object.keys(stored).length > 0) {
      setValues((v) => ({ ...v, ...stored }));
    }
    setHydrated(true);
  }, [playbookSlug]);

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function setStack(
    name: string,
    key: "frontend" | "backend" | "database",
    value: string,
  ) {
    setValues((v) => ({
      ...v,
      [`${name}_${key}`]: value,
      [key]: value, // keep the short alias in sync
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Required-field guard
    for (const f of intakeFields) {
      if (!f.required) continue;
      if (f.type === "stack-selector") {
        const fe = values[`${f.name}_frontend`];
        const be = values[`${f.name}_backend`];
        const db = values[`${f.name}_database`];
        if (!fe || !be || !db) {
          toast.error(`Please choose all three options for "${f.label}".`);
          return;
        }
      } else if (!values[f.name] || values[f.name].trim() === "") {
        toast.error(`"${f.label}" is required.`);
        return;
      }
    }

    setIntake(playbookSlug, values);
    if (firstStepHref) {
      startTransition(() => {
        router.push(firstStepHref);
      });
    } else {
      // Guide-mode playbook: no step pages to navigate to. Just save and toast.
      toast.success("Context saved.");
    }
  }

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
    setValues(emptyState(intakeFields));
    toast.success("Playbook reset.");
  }

  function handleBriefUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result ?? "").toString().trim();
      if (!text) {
        toast.error("File is empty.");
        return;
      }
      // Pre-fill the first textarea field (typically `oneLiner`).
      const firstTextarea = intakeFields.find((f) => f.type === "textarea");
      if (firstTextarea) {
        set(firstTextarea.name, text);
        toast.success(`Loaded ${file.name} into "${firstTextarea.label}".`);
      } else {
        toast.error("No textarea field to load brief into.");
      }
    };
    reader.onerror = () => toast.error("Couldn't read the file.");
    reader.readAsText(file);
    // Reset the input so re-uploading the same file fires onChange again.
    event.target.value = "";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      {intakeFields.map((field) => (
        <FieldRow key={field.name} field={field}>
          {field.type === "textarea" ? (
            <Textarea
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={(e) => set(field.name, e.target.value)}
              placeholder={field.placeholder ?? ""}
              required={field.required}
              rows={5}
              className="resize-y"
            />
          ) : field.type === "text" ? (
            <Input
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={(e) => set(field.name, e.target.value)}
              placeholder={field.placeholder ?? ""}
              required={field.required}
            />
          ) : field.type === "stack-selector" && field.options ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["frontend", "backend", "database"] as const).map((key) => {
                const value = values[`${field.name}_${key}`] ?? "";
                const id = `${field.name}-${key}`;
                return (
                  <div key={key}>
                    <label
                      htmlFor={id}
                      className="mb-1.5 block text-xs font-medium capitalize text-muted-foreground"
                    >
                      {key}
                    </label>
                    <select
                      id={id}
                      value={value}
                      onChange={(e) => setStack(field.name, key, e.target.value)}
                      required={field.required}
                      className={cn(
                        "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm",
                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value === "" && "text-muted-foreground",
                      )}
                    >
                      <option value="">Choose {key}…</option>
                      {(field.options![key] ?? []).map((opt) => (
                        <option key={opt} value={opt} className="text-foreground">
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          ) : null}
        </FieldRow>
      ))}

      {/* Optional brief.txt upload */}
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Have a brief.txt already?
            </div>
            <div className="text-muted-foreground">
              Upload it to pre-fill the one-liner above.
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            render={
              <label className="cursor-pointer">
                <Upload className="mr-1.5 size-3.5" aria-hidden />
                Upload brief
                <input
                  type="file"
                  accept=".txt,text/plain,.md,text/markdown"
                  onChange={handleBriefUpload}
                  className="sr-only"
                />
              </label>
            }
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={handleReset}
          disabled={!hydrated}
        >
          <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
          Reset playbook
        </Button>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
              Loading…
            </>
          ) : firstStepHref ? (
            <>Begin Step 1 →</>
          ) : (
            <>Save my context</>
          )}
        </Button>
      </div>
    </form>
  );
}

function FieldRow({
  field,
  children,
}: {
  field: IntakeField;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={field.name}
        className="block text-sm font-semibold text-foreground"
      >
        {field.label}
        {field.required ? (
          <span className="ml-1 text-destructive">*</span>
        ) : null}
      </label>
      {field.helpText ? (
        <p className="mt-1 text-xs text-muted-foreground">{field.helpText}</p>
      ) : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}
