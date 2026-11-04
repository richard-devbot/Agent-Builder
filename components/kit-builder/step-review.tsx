"use client";

/**
 * Step 6 — Review & Push to GitLab.
 * Existing file tree/preview plus primary "Push to GitLab" action (Phase D)
 * and secondary "Download ZIP" action.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  GitBranch,
  Library,
  Loader2,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABEL } from "@/lib/kit/build-kit";
import {
  loadLastPushRecord,
  saveLastPushRecord,
  type GitLabPushRecord,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Count, Panel, StepHeader } from "./primitives";
import { PROVIDER_META } from "./providers";
import { readiness } from "./readiness";
import { buildCiVariablesFromSetup } from "./step-deployment-setup";
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

  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [pushResult, setPushResult] = useState<GitLabPushRecord | null>(() =>
    loadLastPushRecord(),
  );

  async function pushToGitLab() {
    const projectSlug =
      s.deploymentSetup.gitlabProjectSlug.trim() ||
      s.projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const agentFolder =
      s.deploymentSetup.agentFolderName.trim() ||
      s.projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "") ||
      "team_agent";

    if (!projectSlug) {
      toast.error(
        "Set a GitLab project slug in Step 5 (Deployment Setup) before pushing.",
      );
      s.setStep(5);
      return;
    }

    setPushing(true);
    setPushError(null);
    try {
      const res = await fetch("/api/gitlab/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupPath: s.deploymentSetup.gitlabGroupPath.trim() || undefined,
          projectName: projectSlug,
          agentFolderName: agentFolder,
          kitVersion: "2.13.0",
          ciVariables: buildCiVariablesFromSetup(s.deploymentSetup),
          files: s.files.map((f) => ({
            path: f.path,
            contents: f.contents,
          })),
        }),
      });
      const data = (await res.json()) as Partial<GitLabPushRecord> & {
        error?: string;
      };
      if (!res.ok) {
        setPushError({
          status: res.status,
          message:
            data.error || `GitLab push failed with status ${res.status}.`,
        });
        toast.error(data.error || "GitLab push failed.");
        return;
      }
      if (data.projectUrl && data.commitSha && data.projectId) {
        const record: GitLabPushRecord = {
          projectId: data.projectId,
          projectPath: data.projectPath || projectSlug,
          projectUrl: data.projectUrl,
          commitSha: data.commitSha,
          branch: data.branch || "main",
          mergeRequestUrl: data.mergeRequestUrl,
          pipelineUrl: data.pipelineUrl,
          pushedAt: new Date().toISOString(),
        };
        saveLastPushRecord(record);
        setPushResult(record);
        toast.success("Kit committed and pushed to GitLab.");
      }
    } catch {
      setPushError({
        status: 500,
        message: "Network error while pushing kit to GitLab.",
      });
      toast.error("Network error while pushing kit to GitLab.");
    } finally {
      setPushing(false);
    }
  }

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
        n={6}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={s.download}>
              <Download className="size-4" /> Download ZIP
            </Button>
            <Button onClick={pushToGitLab} disabled={pushing}>
              {pushing ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Pushing to GitLab…
                </>
              ) : (
                <>
                  <UploadCloud className="size-4" /> Push to GitLab
                </>
              )}
            </Button>
          </div>
        }
      />

      {pushError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">GitLab Push Error ({pushError.status})</p>
              <p className="mt-0.5">{pushError.message}</p>
            </div>
          </div>
          {pushError.status === 401 && (
            <Link
              href="/api/gitlab/login?returnTo=/studio"
              prefetch={false}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-destructive px-3 font-medium text-white"
            >
              <GitBranch className="size-3.5" /> Re-authenticate GitLab
            </Link>
          )}
        </div>
      )}

      {pushResult && (
        <div className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
              <CheckCircle2 className="size-4" /> Pushed to GitLab ({pushResult.branch})
            </p>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <a
                href={pushResult.projectUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-foreground underline"
              >
                {pushResult.projectPath} <ExternalLink className="size-3" />
              </a>
              <span>
                Commit: <code className="font-mono">{pushResult.commitSha.slice(0, 8)}</code>
              </span>
              {pushResult.mergeRequestUrl && (
                <a
                  href={pushResult.mergeRequestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline"
                >
                  Merge Request <ExternalLink className="size-3" />
                </a>
              )}
              {pushResult.pipelineUrl && (
                <a
                  href={pushResult.pipelineUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline"
                >
                  Pipeline <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
          <Button size="sm" onClick={() => s.setStep(7)}>
            Deploy to Cloud <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}

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
                {PROVIDER_LABEL[provider]}{s.orgName ? ` · ${s.orgName}` : ""}
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
