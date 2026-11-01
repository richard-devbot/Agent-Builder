"use client";

/** Right rail: live manifest of the kit — assistant, counts, file tree, export. */

import { useMemo, useState } from "react";
import {
  Bot,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROVIDER_LABEL } from "@/lib/kit/build-kit";
import { PROVIDER_META } from "./providers";
import type { KitBuilderState } from "./use-kit-builder-state";

type FileNode = { path: string; name: string };

/** Group generated files by their top-level folder; root files come first. */
function groupFiles(files: { path: string }[]) {
  const groups = new Map<string, FileNode[]>();
  for (const f of files) {
    const slash = f.path.indexOf("/");
    const dir = slash === -1 ? "" : f.path.slice(0, slash);
    const name = slash === -1 ? f.path : f.path.slice(slash + 1);
    groups.set(dir, [...(groups.get(dir) ?? []), { path: f.path, name }]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

export function KitManifest({ s }: { s: KitBuilderState }) {
  const sel = s.selection;
  const meta = PROVIDER_META[s.provider];
  const groups = useMemo(() => groupFiles(s.files), [s.files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const counts = [
    { label: "Agents", value: sel.agents.length, icon: Bot },
    { label: "Skills", value: sel.skills.length + s.catalogSel.size, icon: Sparkles },
    { label: "Rules", value: sel.rules.length, icon: ScrollText },
    { label: "Commands", value: sel.commands.length, icon: TerminalSquare },
    { label: "MCP", value: sel.mcpServers.length, icon: Plug },
    { label: "Hooks", value: sel.hooks.length, icon: ShieldCheck },
  ];

  const toggleDir = (dir: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/60 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kit manifest</p>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            Live
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            s.setStep(4);
            requestAnimationFrame(() => document.getElementById("assistant")?.scrollIntoView({ behavior: "smooth" }));
          }}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-3 text-left transition-colors hover:border-primary/40"
          title="Change target assistant"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-xs font-bold text-primary-foreground">
            {meta.glyph}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{PROVIDER_LABEL[s.provider]}</span>
            <span className="block truncate font-mono text-[10.5px] text-muted-foreground">{meta.blurb}</span>
          </span>
        </button>

        <dl className="mt-3 grid grid-cols-3 gap-1.5">
          {counts.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border bg-background/50 px-2 py-1.5">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Icon className="size-3" /> {label}
              </dt>
              {/* key on the value replays the pop animation whenever the count changes */}
              <dd key={value} className="mt-0.5 animate-scale-in font-mono text-base font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Files</p>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{s.files.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        <ul aria-label="Generated kit files" className="font-mono text-[11.5px]">
          {groups.map(([dir, nodes]) => {
            const isOpen = !collapsed.has(dir);
            return (
              <li key={dir || "root"}>
                {dir && (
                  <button
                    type="button"
                    onClick={() => toggleDir(dir)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-foreground/85 transition-colors hover:bg-muted"
                  >
                    <ChevronRight className={cn("size-3 shrink-0 transition-transform duration-200", isOpen && "rotate-90")} />
                    <Folder className="size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{dir}/</span>
                    <span className="text-[10px] text-muted-foreground">{nodes.length}</span>
                  </button>
                )}
                {isOpen && (
                  <ul className={cn(dir && "ml-[1.05rem] border-l border-border/70 pl-1")}>
                    {nodes.map((f) => (
                      <li key={f.path}>
                        <button
                          type="button"
                          onClick={() => s.setOpenFile(f.path)}
                          aria-label={`Preview ${f.path}`}
                          title={f.path}
                          className={cn(
                            "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-primary/10 hover:text-foreground",
                            s.fileEdits.has(f.path) ? "text-warning" : "text-muted-foreground",
                          )}
                        >
                          <FileText className="size-3 shrink-0 opacity-60 group-hover:text-primary group-hover:opacity-100" />
                          <span className="min-w-0 truncate">{f.name}</span>
                          {s.fileEdits.has(f.path) && <span className="ml-auto text-[9px] uppercase">edited</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-border/60 bg-background/70 p-3 backdrop-blur">
        <Button className="w-full" onClick={s.download}>
          <Download className="size-4" /> Generate kit (.zip)
        </Button>
        <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">Unzip into your repository root.</p>
      </div>
    </div>
  );
}
