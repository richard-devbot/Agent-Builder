"use client";

/** File preview/edit dialog and the item body editor dialog. */

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import type { KitBuilderState } from "./use-kit-builder-state";

export function KitDialogs({ s }: { s: KitBuilderState }) {
  const open = s.files.find((f) => f.path === s.openFile) ?? null;
  const [editingFilePath, setEditingFilePath] = useState<string | null>(null);
  const [editingFileContent, setEditingFileContent] = useState<string>("");

  return (
    <>
      <Dialog open={open !== null} onOpenChange={(o) => !o && s.setOpenFile(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="break-all pr-6 font-mono text-sm leading-relaxed">{open?.path}</DialogTitle>
            <DialogDescription>Generated configuration. Review it before adding it to your repository.</DialogDescription>
          </DialogHeader>
          {open && editingFilePath === open.path ? (
            <div className="space-y-3">
              <Textarea
                value={editingFileContent}
                onChange={(e) => setEditingFileContent(e.target.value)}
                className="max-h-[60dvh] min-h-[45dvh] font-mono text-xs leading-6"
                aria-label={`Edit ${open.path}`}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    s.resetFileContent(open.path);
                    setEditingFilePath(null);
                  }}
                >
                  Reset to generated
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingFilePath(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    s.setFileContent(open.path, editingFileContent);
                    setEditingFilePath(null);
                  }}
                >
                  Save changes
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <pre
                tabIndex={0}
                aria-label="File contents"
                className="max-h-[60dvh] min-w-0 overflow-auto overscroll-contain rounded-xl border bg-muted/40 p-4 text-xs leading-6"
              >
                <code>{open?.contents}</code>
              </pre>
              <DialogFooter showCloseButton>
                {open && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingFilePath(open.path);
                        setEditingFileContent(open.contents);
                      }}
                    >
                      <Pencil className="mr-1.5 size-3.5" /> Edit file
                    </Button>
                    <CopyButton value={open.contents} label="Copy file" size="sm" />
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {s.editor && (
        <Dialog open onOpenChange={(o) => !o && s.setEditor(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Edit: {s.editor.title}</DialogTitle>
              <DialogDescription>
                Tailor this content for your team. Changes apply to the generated kit.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={s.editor.body}
              onChange={(e) => s.setEditor(s.editor && { ...s.editor, body: e.target.value })}
              aria-label={`Edit ${s.editor.title} content`}
              className="max-h-[50dvh] min-h-[35dvh] font-mono text-xs leading-6"
            />
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!s.editor) return;
                  const next = new Map(s.bodyEdits);
                  next.delete(s.editor.id);
                  s.setBodyEdits(next);
                  s.setEditor(null);
                }}
              >
                Reset to default
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!s.editor) return;
                  const next = new Map(s.bodyEdits);
                  next.set(s.editor.id, s.editor.body);
                  s.setBodyEdits(next);
                  s.setEditor(null);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
