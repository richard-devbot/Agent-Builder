"use client";

/** The conversation with the Discovery agent: messages, question cards, attachments and composer. */

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Briefcase,
  Code2,
  FileSearch,
  FileText,
  GitBranch,
  Link2,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  StickyNote,
  UploadCloud,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { IntakeRole } from "@/contracts/intake";
import { ACCEPTED_DOCS } from "@/lib/intake/extract-text";
import { ROLE_LABEL } from "@/lib/intake/brief";
import { QuestionCard } from "./question-card";
import { RichText } from "./rich-text";
import type { Busy, ChatMessage, IntakeState } from "./use-intake";

const ROLES: { id: IntakeRole; icon: typeof Code2; blurb: string }[] = [
  { id: "developer", icon: Code2, blurb: "Stack, repos, environments" },
  { id: "business", icon: Briefcase, blurb: "Outcomes and workflows, no jargon" },
  { id: "manager", icon: Users, blurb: "Scope, timeline, budget, risk" },
];

const STARTERS: Record<IntakeRole, string[]> = {
  developer: [
    "We need to migrate a .NET Framework monolith to .NET 8 without downtime.",
    "Our React app has no tests and every release breaks something.",
    "Build an internal API that syncs orders from Shopify into our ERP.",
  ],
  business: [
    "Finance re-keys 400 supplier invoices a week from PDF into SAP.",
    "Customers wait two days for answers our support team already has in docs.",
    "Field engineers fill in paper forms that someone types up every Friday.",
  ],
  manager: [
    "We have one quarter to replace a legacy claims system before the vendor contract ends.",
    "Three teams build the same reporting dashboards in different ways.",
    "I need a pilot that proves AI can cut onboarding time for new hires.",
  ],
};

const BUSY_TEXT: Record<Exclude<Busy, null>, string> = {
  reading: "Extracting text from your files…",
  analyzing: "Material analyst is reading what you shared…",
  thinking: "Updating the brief and working out what to ask next…",
  planning: "Solution architect is designing your agents and skills…",
};

export function ChatPanel({ intake, onOpenBlueprint }: { intake: IntakeState; onOpenBlueprint: () => void }) {
  const [draft, setDraft] = useState("");
  const [drag, setDrag] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const empty = intake.messages.length === 0;

  // Follow the conversation as it grows.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [intake.messages.length, intake.busy]);

  const send = (text = draft) => {
    if (!text.trim() || intake.busy) return;
    intake.send(text);
    setDraft("");
  };

  return (
    <section
      aria-label="Discovery chat"
      className="relative flex min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/70 lg:h-[calc(100dvh-14.5rem)]"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) intake.addFiles(e.dataTransfer.files);
      }}
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-r from-primary/10 via-transparent to-transparent px-4 py-3">
        <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-md shadow-primary/25">
          <Bot className="size-4.5" />
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card",
              intake.busy ? "animate-pulse bg-warning" : "bg-success",
            )}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Discovery agent</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {intake.busy ? BUSY_TEXT[intake.busy] : intake.ai?.configured ? `Gemini · ${intake.ai.model}` : "Guided mode · connect Gemini for full AI"}
          </p>
        </div>
        <RoleSwitch role={intake.role} onChange={intake.setRole} />
      </header>

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {empty ? (
          <Welcome intake={intake} onStarter={(t) => send(t)} />
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col gap-4">
            {intake.messages.map((m) => (
              <li key={m.id}>
                <Message m={m} intake={intake} onOpenBlueprint={onOpenBlueprint} />
              </li>
            ))}
            {intake.busy && intake.busy !== "reading" && <Typing text={BUSY_TEXT[intake.busy]} />}
          </ol>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background/60 p-3">
        {intake.materials.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {intake.materials.map((m) => (
              <span key={m.id} className="inline-flex max-w-56 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px]">
                <MaterialIcon kind={m.kind} />
                <span className="truncate" title={m.name}>
                  {m.name}
                </span>
                <button type="button" onClick={() => intake.removeMaterial(m.id)} aria-label={`Remove ${m.name}`} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border bg-card p-1.5 shadow-sm transition-colors focus-within:border-primary/50">
          <AttachMenu
            disabled={Boolean(intake.busy)}
            onFiles={() => fileInput.current?.click()}
            onAdd={(kind, name, text) => intake.addMaterial(kind, name, text)}
          />
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={empty ? "Describe the problem you want solved…" : "Reply, add context, or ask the agent anything…"}
            aria-label="Message the Discovery agent"
            className="max-h-36 min-h-9 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button size="icon" onClick={() => send()} disabled={!draft.trim() || Boolean(intake.busy)} aria-label="Send message">
            {intake.busy === "thinking" ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line · drop files anywhere here. Don&apos;t paste passwords or keys.</p>
          {!empty && (
            <Button size="sm" variant={intake.done ? "default" : "outline"} onClick={intake.buildPlan} disabled={Boolean(intake.busy)}>
              {intake.busy === "planning" ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              {intake.plan ? "Rebuild blueprint" : "Build blueprint"}
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPTED_DOCS}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) intake.addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {drag && (
        <div className="pointer-events-none absolute inset-2 z-10 flex animate-fade-in flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
          <UploadCloud className="size-8 text-primary" />
          <p className="text-sm font-medium">Drop to share with the agent</p>
          <p className="text-xs text-muted-foreground">PDF, Word, Excel, CSV, Markdown, text</p>
        </div>
      )}
    </section>
  );
}

function RoleSwitch({ role, onChange }: { role: IntakeRole; onChange: (r: IntakeRole) => void }) {
  return (
    <div role="radiogroup" aria-label="I am a" className="hidden rounded-lg border bg-background/60 p-0.5 sm:flex">
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={role === r.id}
          onClick={() => onChange(r.id)}
          title={r.blurb}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium transition-colors",
            role === r.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <r.icon className="size-3.5" />
          <span className="hidden xl:inline">{ROLE_LABEL[r.id]}</span>
        </button>
      ))}
    </div>
  );
}

function Welcome({ intake, onStarter }: { intake: IntakeState; onStarter: (t: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl animate-fade-up flex-col items-center py-4 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-xl shadow-primary/30">
        <Sparkles className="size-7" />
        <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20 [animation-duration:2.5s]" />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">What problem should we solve?</h2>
      <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
        Describe it in your own words and share any documents you have. I&apos;ll read them, ask only what&apos;s missing, and turn it into a brief and a
        blueprint of agents and skills.
      </p>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">I am a</p>
      <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
        {ROLES.map((r) => {
          const active = intake.role === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => intake.setRole(r.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all duration-200",
                active ? "border-primary/60 bg-primary/[0.08] shadow-md shadow-primary/10" : "bg-background/50 hover:-translate-y-0.5 hover:border-primary/35",
              )}
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <r.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{ROLE_LABEL[r.id]}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{r.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Or start from an example</p>
      <div className="mt-2 flex w-full flex-col gap-2">
        {STARTERS[intake.role].map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => onStarter(t)}
            style={{ "--i": i } as React.CSSProperties}
            className="stagger group flex animate-fade-up items-center gap-3 rounded-xl border bg-background/50 px-3.5 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
          >
            <Send className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="flex-1">{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-primary-foreground">
      <Bot className="size-3.5" />
    </span>
  );
}

function ModeTag({ mode }: { mode: "ai" | "guided" }) {
  return <span className="ml-1.5 align-middle text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{mode === "ai" ? "AI" : "Guided"}</span>;
}

function Message({ m, intake, onOpenBlueprint }: { m: ChatMessage; intake: IntakeState; onOpenBlueprint: () => void }) {
  if (m.role === "user") {
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-line text-primary-foreground shadow-sm">
          {m.text}
          {m.attachments && m.attachments.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {m.attachments.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[11px]">
                  <FileText className="size-3" /> {a}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    );
  }

  const bubble = (
    <div className="rounded-2xl rounded-tl-sm border bg-muted/40 px-3.5 py-2.5 text-sm leading-relaxed">
      <RichText text={m.text} />
      <ModeTag mode={m.mode} />
    </div>
  );

  return (
    <div className="flex animate-fade-up items-start gap-2.5">
      <AgentAvatar />
      <div className="min-w-0 flex-1 space-y-2.5">
        {m.kind === "analysis" && (
          <div className="overflow-hidden rounded-xl border bg-background/60">
            <p className="flex items-center gap-1.5 border-b border-border/60 bg-primary/5 px-3 py-2 text-xs font-semibold">
              <FileSearch className="size-3.5 text-primary" /> Material analysis
            </p>
            <ul className="divide-y divide-border/60">
              {m.insights.map((ins) => (
                <li key={ins.materialId} className="px-3 py-2.5">
                  <p className="text-[13px] font-medium">{ins.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ins.summary}</p>
                  {ins.facts.length > 0 && (
                    <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-xs marker:text-primary/60">
                      {ins.facts.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {(ins.technologies.length > 0 || ins.gaps.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ins.technologies.map((t) => (
                        <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary">
                          {t}
                        </span>
                      ))}
                      {ins.gaps.map((g) => (
                        <span key={g} className="rounded bg-warning/10 px-1.5 py-0.5 text-[10.5px] text-warning">
                          Gap: {g}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {bubble}
        {m.kind === "questions" && (
          <div className="space-y-2">
            {m.questions.map((q, i) => (
              <fieldset key={q.id} disabled={m.submitted} className={cn(m.submitted && "opacity-60")}>
                <QuestionCard
                  q={q}
                  index={i}
                  value={m.answers[q.id] ?? ""}
                  onChange={(v) => intake.setAnswer(m.id, q.id, v)}
                  onEnter={() => intake.submitAnswers(m.id)}
                />
              </fieldset>
            ))}
            {!m.submitted && (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => intake.submitAnswers(m.id)} disabled={Boolean(intake.busy)}>
                  Skip
                </Button>
                <Button size="sm" onClick={() => intake.submitAnswers(m.id)} disabled={Boolean(intake.busy)}>
                  <Send className="size-3.5" /> Send answers
                </Button>
              </div>
            )}
          </div>
        )}
        {m.kind === "plan" && (
          <Button size="sm" onClick={onOpenBlueprint}>
            <Sparkles className="size-3.5" /> Open blueprint
          </Button>
        )}
      </div>
    </div>
  );
}

function Typing({ text }: { text: string }) {
  return (
    <li className="flex animate-fade-in items-center gap-2.5">
      <AgentAvatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-muted/40 px-3.5 py-2.5">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </li>
  );
}

function MaterialIcon({ kind }: { kind: string }) {
  const Icon = kind === "repo" ? GitBranch : kind === "link" ? Link2 : kind === "note" ? StickyNote : FileText;
  return <Icon className="size-3 shrink-0 text-primary" />;
}

type Adder = "repo" | "link" | "note";

function AttachMenu({
  disabled,
  onFiles,
  onAdd,
}: {
  disabled: boolean;
  onFiles: () => void;
  onAdd: (kind: Adder, name: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adder, setAdder] = useState<Adder | null>(null);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");

  const close = () => {
    setOpen(false);
    setAdder(null);
    setValue("");
    setLabel("");
  };
  const commit = () => {
    const v = value.trim();
    if (!v) return;
    if (adder === "note") onAdd("note", label.trim() || "Note", v);
    // Links and repos are references: the agent sees the URL and your description, not the page.
    else if (adder) onAdd(adder, v, label.trim() ? `${v}\n${label.trim()}` : v);
    close();
  };

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="icon" onClick={() => (open ? close() : setOpen(true))} disabled={disabled} aria-label="Attach" aria-expanded={open}>
        <Paperclip className="size-4" />
      </Button>
      {open && (
        <div className="absolute bottom-11 left-0 z-20 w-72 animate-scale-in rounded-xl border bg-popover p-1.5 shadow-xl">
          {!adder ? (
            <>
              {(
                [
                  ["file", UploadCloud, "Upload files", "PDF, Word, Excel, CSV, Markdown"],
                  ["repo", GitBranch, "Repository URL", "Recorded as a reference"],
                  ["link", Link2, "Link", "Recorded as a reference"],
                  ["note", StickyNote, "Paste notes", "Emails, meeting notes, requirements"],
                ] as const
              ).map(([id, Icon, title, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id === "file") {
                      close();
                      onFiles();
                    } else setAdder(id);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                >
                  <Icon className="size-4 text-primary" />
                  <span>
                    <span className="block text-[13px] font-medium">{title}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                  </span>
                </button>
              ))}
            </>
          ) : (
            <div className="space-y-2 p-1.5">
              {adder === "note" ? (
                <>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Title, e.g. Kick-off notes" className="h-8 text-sm" autoFocus />
                  <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste text…" className="min-h-24 text-sm" />
                </>
              ) : (
                <>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commit()}
                    placeholder={adder === "repo" ? "https://github.com/org/repo" : "https://…"}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What is it? (optional)" className="h-8 text-sm" />
                </>
              )}
              <div className="flex justify-end gap-1.5">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdder(null)}>
                  Back
                </Button>
                <Button type="button" size="sm" onClick={commit} disabled={!value.trim()}>
                  Share
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
