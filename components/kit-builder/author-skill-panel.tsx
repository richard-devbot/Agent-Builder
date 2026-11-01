"use client";

/**
 * "AI-author a skill" panel (discovery step) — uploads a reference document
 * to the author-skill Lambda and adds the generated SKILL.md to the kit.
 * Shown disabled when NEXT_PUBLIC_AUTHOR_SKILL_API is not configured.
 */

import { useRef, useState } from "react";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authorSkill } from "@/lib/kit/author-skill-client";
import { extractText } from "@/lib/intake/extract-text";
import type { KitSkill } from "@/lib/kit/skills";

const MAX_DOC_CHARS = 200_000;

export function AuthorSkillPanel({
  technologies,
  projectName,
  notes,
  authored,
  onAdd,
  onRemove,
  disabled = false,
}: {
  technologies: string[];
  projectName?: string;
  notes?: string;
  authored: KitSkill[];
  onAdd: (skill: KitSkill) => void;
  onRemove: (slug: string) => void;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [docText, setDocText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(file: File | undefined) {
    setError(null);
    if (!file) return;
    let text: string;
    try {
      text = await extractText(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
      return;
    }
    if (text.length > MAX_DOC_CHARS) {
      setError(`Document too large (max ${MAX_DOC_CHARS.toLocaleString()} characters).`);
      return;
    }
    setFileName(file.name);
    setDocText(text);
  }

  async function generate() {
    if (!fileName || !docText) return;
    setLoading(true);
    setError(null);
    try {
      const skill = await authorSkill({
        technologies,
        projectName: projectName || undefined,
        notes: notes || undefined,
        document: { name: fileName, text: docText },
      });
      onAdd(skill);
      setFileName(null);
      setDocText(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skill generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="surface gap-0 p-4 ring-0">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">AI-author a skill</span>
        <Badge variant="secondary" className="text-[11px]">
          Beta
        </Badge>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
        Upload a reference document (conventions, architecture notes, API
        guidelines — .md,.markdown,.txt,.pdf,.doc,.docx,.csv,.xls,.xlsx) and we&apos;ll author a stack-specific skill
        from it, added straight into your kit.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".md,.markdown,.txt,.pdf,.doc,.docx,.csv,.xls,.xlsx"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={disabled || loading}
        >
          <FileUp className="size-3.5" />
          {fileName ?? "Choose document"}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={generate}
          disabled={disabled || !docText || loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Generate skill
            </>
          )}
        </Button>
      </div>

      {disabled && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-warning" aria-hidden />
          Requires the skill-authoring service. Not connected in this environment.
        </p>
      )}

      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}

      {authored.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {authored.map((s) => (
            <li
              key={s.slug}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.description}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(s.slug)}
                aria-label={`Remove ${s.name}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
