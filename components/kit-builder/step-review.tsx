"use client";

/** Step 5 — readiness checks and a summary of everything in the kit before generating. */

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Library,
  Circle,
  Download,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROVIDER_LABEL } from "@/lib/kit/build-kit";
import { Count, Panel, StepHeader } from "./primitives";
import { PROVIDER_META } from "./providers";
import { readiness } from "./readiness";
import type { KitBuilderState } from "./use-kit-builder-state";

type ContentGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  items: { key: string; label: string; open: () => void }[];
};

export function StepReview({ s }: { s: KitBuilderState }) {
  const sel = s.selection;
  const provider = s.provider;
  const authoredSlugs = new Set(s.authoredSkills.map((a) => a.slug));
  const checks = readiness(s);
  const blocking = checks.filter((c) => !c.ok && !c.optional);

  /** Prefer exact path, then endsWith, then includes, then a content search. */
  function findFile(patterns: string[], fallbacks: string[] = []) {
    return (
      patterns.map((p) => s.files.find((f) => f.path === p)).find(Boolean) ??
      patterns.map((p) => s.files.find((f) => f.path.endsWith(p))).find(Boolean) ??
      patterns.map((p) => s.files.find((f) => f.path.includes(p))).find(Boolean) ??
      fallbacks.map((p) => s.files.find((f) => f.contents.includes(p))).find(Boolean)
    );
  }
  const openFirst = (patterns: string[], fallbacks: string[] = []) => {
    const file = findFile(patterns, fallbacks);
    if (file) s.setOpenFile(file.path);
  };

  const groups: ContentGroup[] = [
    {
      title: "Agents",
      icon: Bot,
      description: "Specialist subagents such as planners, validators and reviewers.",
      items: sel.agents.map((a) => ({
        key: a.id,
        label: a.name,
        open: () => openFirst([`/agents/${a.id}.md`, `/agents/${a.id}.`]),
      })),
    },
    {
      title: "Skills",
      icon: Sparkles,
      description: "Reusable capability instructions, including any AI-authored ones.",
      items: sel.skills.map((sk) => ({
        key: sk.slug,
        label: authoredSlugs.has(sk.slug) ? `${sk.slug} (AI-authored)` : sk.slug,
        open: () => openFirst([`/skills/${sk.skillName}/SKILL.md`, `${sk.skillName}/SKILL.md`]),
      })),
    },
    {
      title: "Catalog skills",
      icon: Library,
      description: "Third-party skills: bundled when licensed, otherwise in skills-install.sh.",
      items: [...s.catalogSel.values()].map((c) => ({
        key: c.id,
        label: c.name,
        open: () => openFirst([`/${c.name}/SKILL.md`, "skills-install.sh"]),
      })),
    },
    {
      title: "Rules",
      icon: ScrollText,
      description: "Development guidelines, organisation policies and the project profile.",
      items: sel.rules.map((r) => ({
        key: r.id,
        label: r.name,
        open: () =>
          openFirst(
            provider === "claude-code"
              ? ["CLAUDE.md"]
              : provider === "copilot"
                ? [`.github/instructions/${r.id}.instructions.md`]
                : provider === "cursor"
                  ? [`.cursor/rules/${r.id}.mdc`]
                  : [],
            [r.id, r.name],
          ),
      })),
    },
    {
      title: "Guardrail hooks",
      icon: ShieldCheck,
      description: "Pre-execution guards that block high-risk actions.",
      items: sel.hooks.map((h) => ({
        key: h.id,
        label: h.name,
        open: () =>
          openFirst(
            provider === "claude-code"
              ? [`.claude/hooks/${h.scriptName}`]
              : [`guardrails/${h.scriptName}`, `.claude/hooks/${h.scriptName}`],
            [h.scriptName, h.name, h.id],
          ),
      })),
    },
    {
      title: "Commands",
      icon: TerminalSquare,
      description: "Slash commands available inside your assistant.",
      items: sel.commands.map((c) => ({
        key: c.id,
        label: `/${c.id}`,
        open: () =>
          openFirst(
            provider === "claude-code"
              ? [`.claude/commands/${c.id}.md`]
              : provider === "copilot"
                ? [`.github/prompts/${c.id}.prompt.md`]
                : provider === "cursor"
                  ? [`.cursor/commands/${c.id}.md`]
                  : [],
            [`/${c.id}`, c.id, c.name],
          ),
      })),
    },
    {
      title: "MCP servers",
      icon: Plug,
      description: "External tool integrations wired into the MCP configuration.",
      items: sel.mcpServers.map((m) => ({
        key: m.slug,
        label: m.name,
        open: () =>
          openFirst(
            provider === "claude-code"
              ? [".claude/mcp.json", "SETUP.md", "setup-mcp.sh"]
              : provider === "copilot"
                ? [".github/copilot-mcp.json", "SETUP.md", "setup-mcp.sh"]
                : provider === "cursor"
                  ? [".cursor/mcp.json", "SETUP.md", "setup-mcp.sh"]
                  : ["SETUP.md"],
            [m.slug, m.serverName, m.name],
          ),
      })),
    },
  ];

  return (
    <>
      <StepHeader
        n={5}
        actions={
          <Button onClick={s.download}>
            <Download className="size-4" /> Generate kit
          </Button>
        }
      />

      {/* Summary banner */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/12 via-card to-card p-5">
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative flex flex-col gap-4 @3xl:flex-row @3xl:items-center @3xl:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary font-mono text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25">
              {PROVIDER_META[provider].glyph}
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">{s.projectName || "Untitled kit"}</p>
              <p className="text-sm text-muted-foreground">
                {PROVIDER_LABEL[provider]} · {s.orgName}
              </p>
            </div>
          </div>
          <dl className="flex gap-6">
            {[
              { label: "Files", value: s.files.length },
              { label: "Capabilities", value: sel.agents.length + sel.skills.length + s.catalogSel.size + sel.commands.length + sel.mcpServers.length },
              { label: "Guardrails", value: sel.rules.length + sel.hooks.length },
            ].map((m) => (
              <div key={m.label}>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</dt>
                <dd className="font-mono text-2xl font-semibold tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 @5xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel
          id="readiness"
          icon={blocking.length ? AlertTriangle : CheckCircle2}
          title="Readiness"
          meta={
            <Count tone={blocking.length ? "muted" : "brand"}>
              {blocking.length ? `${blocking.length} to review` : "All set"}
            </Count>
          }
          bodyClassName="p-2"
          className="@5xl:self-start"
        >
          <ul>
            {checks.map((c, i) => (
              <li key={c.id} style={{ "--i": i } as React.CSSProperties} className="stagger animate-fade-in">
                <button
                  type="button"
                  onClick={() => s.setStep(c.step)}
                  className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                  title={`Go to step ${c.step}`}
                >
                  {c.ok ? (
                    <CheckCircle2 className="mt-px size-4 shrink-0 text-success" />
                  ) : c.optional ? (
                    <Circle className="mt-px size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="mt-px size-4 shrink-0 text-warning" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      {c.label}
                      {c.optional && <span className="text-[10px] font-normal text-muted-foreground">optional</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div id="contents" className="grid min-w-0 scroll-mt-4 grid-cols-1 gap-3 @3xl:grid-cols-2 @[90rem]:grid-cols-3">
          {groups.map((g, i) => {
            const Icon = g.icon;
            return (
              <section
                key={g.title}
                style={{ "--i": i } as React.CSSProperties}
                className="stagger flex animate-fade-up flex-col rounded-xl border bg-card/70 p-4"
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">{g.title}</h3>
                  <span className="ml-auto font-mono text-lg font-semibold tabular-nums">{g.items.length}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{g.description}</p>
                {g.items.length > 0 ? (
                  <div className="mt-3 flex max-h-40 flex-wrap content-start gap-1.5 overflow-y-auto">
                    {g.items.map((it) => (
                      <button
                        key={it.key}
                        type="button"
                        onClick={it.open}
                        className="inline-flex items-center rounded-md border bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={cn("mt-3 text-xs italic text-muted-foreground")}>None selected.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
