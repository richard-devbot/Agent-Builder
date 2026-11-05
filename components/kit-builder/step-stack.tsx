"use client";

/**
 * Step 4 — Target assistant, ADK runtime, technologies, stack follow-ups, and
 * kit capabilities — organized into a clean, minimal-by-default layout that
 * highlights what is active for the user's project without visual clutter.
 */

import { useState } from "react";
import {
  Bot,
  Boxes,
  Check,
  ChevronDown,
  ClipboardList,
  Filter,
  Layers,
  Library,
  Network,
  Plug,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TECHNOLOGIES, TECH_GROUP_LABEL, TECH_GROUP_ORDER, techLabel } from "@/lib/kit/technologies";
import { AGENTS, AGENT_PACK_LABEL } from "@/lib/kit/agents";
import { RULES, RULE_KIND_LABEL } from "@/lib/kit/rules";
import { HOOKS } from "@/lib/kit/hooks";
import { COMMANDS } from "@/lib/kit/commands";
import { PROVIDER_LABEL } from "@/lib/kit/build-kit";
import { APPROVED_GEMINI_MODELS } from "@/lib/config/public";
import {
  BulkActions,
  Chip,
  Count,
  GroupLabel,
  McpServerRow,
  OptionCard,
  Panel,
  SegmentTab,
  SelectableRow,
  StepHeader,
  fieldLabelClass,
  tileGridClass,
} from "./primitives";
import { PROVIDERS } from "./providers";
import { QuestionList } from "./question-list";
import { CatalogPicker } from "./catalog-picker";
import { matches, type KitBuilderState } from "./use-kit-builder-state";

const ADK_TOOLS_CATALOG = [
  {
    id: "context",
    name: "Project Context Grounding Tool",
    description: "Grounds the agent in verified architecture, conventions, and project facts from Step 1.",
  },
  {
    id: "validation",
    name: "Component Contract Validator Tool",
    description: "Validates code updates and API contracts against schema and typing standards.",
  },
  {
    id: "database",
    name: "Safe Read-Only Database Connector",
    description: "Executes parameterized read queries. Destructive SQL (DROP, TRUNCATE) is blocked.",
  },
  {
    id: "jira",
    name: "Jira / User Story Connector",
    description: "Pulls user stories, acceptance criteria, and task requirements into agent memory.",
  },
  {
    id: "memory",
    name: "Vertex AI Memory Bank Connector",
    description: "Episodic session memory keeping context and prior decisions across autonomous turns.",
  },
] as const;

const TECH_BY_GROUP = new Map(TECH_GROUP_ORDER.map((g) => [g, TECHNOLOGIES.filter((t) => t.group === g)]));

/** One capability item, normalised across skills, agents, rules, commands, MCP servers and hooks. */
type CapItem = {
  id: string;
  title: string;
  description: string;
  rec: string[];
  pack?: string;
  edit?: { key: string; body: string };
  mcp?: KitBuilderState["mcpServers"][number];
};

type CapTab = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  items: CapItem[];
  packs?: Record<string, string>;
  override: Map<string, boolean>;
  setOverride: (m: Map<string, boolean>) => void;
};

function capabilityTabs(s: KitBuilderState): CapTab[] {
  return [
    {
      id: "skills",
      label: "Skills",
      icon: Sparkles,
      hint: "Reusable skill packs, pre-selected from your stack and Discovery brief.",
      items: s.skills.map((sk) => ({
        id: sk.slug,
        title: sk.name,
        description: sk.description,
        rec: sk.recommendedFor,
        pack: sk.group,
        edit: { key: `skill:${sk.slug}`, body: sk.body },
      })),
      packs: Object.fromEntries(s.skillGroups.map((g) => [g.group, g.group])),
      override: s.skillOverride,
      setOverride: s.setSkillOverride,
    },
    {
      id: "agents",
      label: "Agents",
      icon: Bot,
      hint: "Specialist subagents. Security and core agents suit every kit.",
      items: AGENTS.map((a) => ({
        id: a.id,
        title: a.name,
        description: a.description,
        rec: a.recommendedFor,
        pack: a.pack,
        edit: { key: `agent:${a.id}`, body: a.body },
      })),
      packs: AGENT_PACK_LABEL,
      override: s.agentOverride,
      setOverride: s.setAgentOverride,
    },
    {
      id: "rules",
      label: "Rules",
      icon: Shield,
      hint: "Coding guardrails written into your tool's instruction files.",
      items: RULES.map((r) => ({
        id: r.id,
        title: r.name,
        description: r.description,
        rec: r.appliesTo,
        pack: r.kind,
        edit: { key: `rule:${r.id}`, body: r.body },
      })),
      packs: RULE_KIND_LABEL,
      override: s.ruleOverride,
      setOverride: s.setRuleOverride,
    },
    {
      id: "commands",
      label: "Commands",
      icon: Terminal,
      hint: "Reusable slash commands such as /pr-generation and /commit-message.",
      items: COMMANDS.map((c) => ({
        id: c.id,
        title: `/${c.name}`,
        description: c.description,
        rec: c.recommendedFor,
        edit: { key: `command:${c.id}`, body: c.body },
      })),
      override: s.commandOverride,
      setOverride: s.setCommandOverride,
    },
    {
      id: "mcp",
      label: "MCP servers",
      icon: Plug,
      hint: "External tools over Model Context Protocol, matched from your systems & stack.",
      items: s.mcpServers.map((m) => ({
        id: m.slug,
        title: m.name,
        description: m.description,
        rec: m.recommendedFor,
        mcp: m,
      })),
      override: s.mcpOverride,
      setOverride: s.setMcpOverride,
    },
    {
      id: "hooks",
      label: "Hooks",
      icon: ShieldAlert,
      hint: "Run before a tool executes and block destructive deletes, table drops and force-push.",
      items: HOOKS.map((h) => ({
        id: h.id,
        title: h.name,
        description: h.description,
        rec: h.recommendedFor,
      })),
      override: s.hookOverride,
      setOverride: s.setHookOverride,
    },
  ];
}

export function StepStack({ s }: { s: KitBuilderState }) {
  const [tabId, setTabId] = useState("skills");
  const [query, setQuery] = useState("");
  const [showAllCaps, setShowAllCaps] = useState(false);
  const [browseTechOpen, setBrowseTechOpen] = useState(false);
  const [stackQuestionsOpen, setStackQuestionsOpen] = useState(false);
  const [baseAdkToolsOpen, setBaseAdkToolsOpen] = useState(false);

  const tabs = capabilityTabs(s);
  const catalogOpen = tabId === "catalog";
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const isOn = (t: CapTab, item: CapItem) => s.isSelected(item.id, item.rec, t.override);

  const selectedInTab = tab.items.filter((i) => isOn(tab, i));
  const q = query.trim().toLowerCase();

  // When searching or when `showAllCaps` is toggled on (or nothing is selected yet), show all matching items;
  // otherwise default to the clean "Selected only" view so the page stays minimal and easy to scan.
  const effectiveShowAll = showAllCaps || Boolean(q) || selectedInTab.length === 0;
  const baseItems = effectiveShowAll ? tab.items : selectedInTab;
  const visible = q
    ? baseItems.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    : baseItems;

  const setAll = (on: boolean) => tab.setOverride(new Map(tab.items.map((i) => [i.id, on])));

  const renderItem = (item: CapItem) =>
    item.mcp ? (
      <McpServerRow
        key={item.id}
        server={item.mcp}
        selected={isOn(tab, item)}
        recommended={matches(item.rec, s.tech)}
        onToggle={() => s.toggle(item.id, item.rec, tab.override, tab.setOverride)}
      />
    ) : (
      <SelectableRow
        key={item.id}
        title={item.title}
        description={item.description}
        selected={isOn(tab, item)}
        recommended={matches(item.rec, s.tech)}
        onToggle={() => s.toggle(item.id, item.rec, tab.override, tab.setOverride)}
        onEdit={item.edit && (() => s.openEditor(item.edit!.key, item.title, item.edit!.body))}
      />
    );

  const selectedTechList = [
    ...TECHNOLOGIES.filter((t) => s.tech.has(t.id)).map((t) => ({ id: t.id, label: t.label })),
    ...s.customTechIds.map((id) => ({ id, label: techLabel(id) })),
  ];
  const showFullTechCatalog = browseTechOpen || selectedTechList.length === 0;

  const answeredStackQs = s.techProjectQuestions.filter((tq) => (s.projectAnswers[tq.id] ?? []).some((v) => v.trim()));

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        n={4}
        actions={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background/60 px-2.5 text-xs text-muted-foreground">
            <Layers className="size-3.5 text-primary" />
            Generating for <span className="font-semibold text-foreground">{PROVIDER_LABEL[s.provider]}</span>
          </span>
        }
      />

      {/* 1. Target Assistant & ADK Configuration (Unified Card) */}
      <Panel
        id="assistant"
        icon={Sparkles}
        title="1. Target assistant & runtime"
        description="Choose the target agent runtime or coding assistant. We generate its native file layout and execution model."
      >
        <div className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3 @6xl:grid-cols-5">
          {PROVIDERS.map((p) => (
            <OptionCard
              key={p.id}
              active={s.provider === p.id}
              glyph={p.glyph}
              title={PROVIDER_LABEL[p.id]}
              description={p.blurb}
              mono
              onClick={() => s.setProvider(p.id)}
            />
          ))}
        </div>

        {s.provider === "google-adk" && (
          <div className="mt-4 space-y-4 rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wrench className="size-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold">ADK Agent & Connectors Configuration</p>
                  <p className="text-[11px] text-muted-foreground">
                    Pinned in <code className="font-mono">{s.deploymentSetup.agentFolderName || s.intake.liveAdk.packageName || "agent"}/agent.py</code> and <code className="font-mono">deployment/agent-card.json</code>.
                  </p>
                </div>
              </div>
              {s.intake.hasContent && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-background/80 px-2.5 py-1 font-mono text-[11px] text-primary">
                  <Network className="size-3.5" />
                  {s.intake.liveAdk.agents.length} ADK agents · {s.intake.liveAdk.tools.length} tools synced
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
              <div>
                <label htmlFor="adk-model-select" className={fieldLabelClass}>
                  Foundation model
                </label>
                <select
                  id="adk-model-select"
                  value={s.adkModel}
                  onChange={(e) => s.setAdkModel(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <option value="">Select an approved model…</option>
                  {APPROVED_GEMINI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.note ? ` · ${m.note}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="adk-instruction-input" className={fieldLabelClass}>
                  Root coordinator prompt <span className="font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <Textarea
                  id="adk-instruction-input"
                  value={s.adkInstruction}
                  onChange={(e) => s.setAdkInstruction(e.target.value)}
                  placeholder="e.g. Coordinate specialist agents and enforce human approval gates…"
                  rows={2}
                  className="min-h-9 bg-background text-xs"
                />
              </div>
            </div>

            {/* Live Discovery ADK Topology Chips */}
            {s.intake.hasContent && (
              <div className="rounded-lg border bg-background/70 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Discovery ADK Topology ({s.intake.liveAdk.packageName})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {s.intake.liveAdk.agents.map((ag) => (
                    <span
                      key={ag.name}
                      className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 font-mono text-[11px]"
                    >
                      <Bot className="size-3 text-primary" />
                      {ag.name}
                      <span className="text-[10px] text-muted-foreground">({ag.type})</span>
                    </span>
                  ))}
                  {s.intake.liveAdk.tools.map((tl) => (
                    <span
                      key={tl.name}
                      className="inline-flex items-center gap-1 rounded-md border border-info/30 bg-info/5 px-2 py-0.5 font-mono text-[11px] text-info"
                    >
                      <Plug className="size-3" />
                      {tl.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Collapsible base ADK helper tools */}
            <div className="rounded-lg border bg-background/60">
              <button
                type="button"
                onClick={() => setBaseAdkToolsOpen((v) => !v)}
                aria-expanded={baseAdkToolsOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium hover:bg-muted/40"
              >
                <span className="flex items-center gap-2">
                  <span>Standard ADK helper tools</span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10.5px] text-primary">
                    {s.adkTools.size}/{ADK_TOOLS_CATALOG.length} enabled
                  </span>
                </span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", baseAdkToolsOpen && "rotate-180")} />
              </button>
              {baseAdkToolsOpen && (
                <div className="border-t border-border/60 p-3">
                  <div className={tileGridClass}>
                    {ADK_TOOLS_CATALOG.map((tool) => (
                      <SelectableRow
                        key={tool.id}
                        title={tool.name}
                        description={tool.description}
                        selected={s.adkTools.has(tool.id)}
                        recommended
                        onToggle={() => s.toggleAdkTool(tool.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* 2. Technologies & Stack Questions (Compact Active View + Expandable Picker) */}
      <Panel
        id="technologies"
        icon={Boxes}
        title="2. Technologies & stack profile"
        description="Your selected stack drives which agents, rules, skills, and MCP servers are included."
        meta={<Count tone={s.tech.size ? "brand" : "muted"}>{`${s.tech.size} selected`}</Count>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                s.addCustomTech();
              }}
            >
              <Input
                value={s.customTech}
                onChange={(e) => s.setCustomTech(e.target.value)}
                placeholder="Add technology…"
                aria-label="Add another technology"
                className="h-8 w-40 text-xs md:text-xs"
              />
              <Button type="submit" variant="outline" size="sm" className="h-8" disabled={!s.customTech.trim()}>
                <Plus className="size-3.5" /> Add
              </Button>
            </form>
            {selectedTechList.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBrowseTechOpen((v) => !v)}
              >
                {browseTechOpen ? "Hide full catalog" : `Browse all (${TECHNOLOGIES.length})`}
                <ChevronDown className={cn("size-3.5 transition-transform", browseTechOpen && "rotate-180")} />
              </Button>
            )}
          </div>
        }
      >
        {/* Active selected stack chips */}
        {selectedTechList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active stack:
            </span>
            {selectedTechList.map((t) => (
              <Chip key={t.id} active onClick={() => s.toggleTech(t.id)}>
                {t.label}
                <X className="size-3 opacity-70" />
              </Chip>
            ))}
          </div>
        )}

        {/* Full categorized technology catalog (collapsed by default once stack is selected) */}
        {showFullTechCatalog && (
          <div className={cn("grid grid-cols-1 gap-x-6 gap-y-5 @3xl:grid-cols-2 @7xl:grid-cols-3", selectedTechList.length > 0 && "mt-4 border-t border-border/60 pt-4")}>
            {TECH_GROUP_ORDER.map((group) => {
              const items = TECH_BY_GROUP.get(group) ?? [];
              if (items.length === 0) return null;
              const picked = items.filter((t) => s.tech.has(t.id)).length;
              return (
                <div key={group}>
                  <GroupLabel count={picked ? `${picked}` : undefined}>
                    {TECH_GROUP_LABEL[group as keyof typeof TECH_GROUP_LABEL]}
                  </GroupLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((t) => (
                      <Chip key={t.id} active={s.tech.has(t.id)} onClick={() => s.toggleTech(t.id)}>
                        {t.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stack Follow-Up Questions integrated cleanly inside the same card */}
        {s.techProjectQuestions.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border bg-background/50">
            <button
              type="button"
              onClick={() => setStackQuestionsOpen((v) => !v)}
              aria-expanded={stackQuestionsOpen}
              className="flex w-full flex-col gap-2 px-3.5 py-2.5 text-left hover:bg-muted/30"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <ClipboardList className="size-3.5 text-primary" />
                  Stack framework specifics
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10.5px] text-primary">
                    {answeredStackQs.length}/{s.techProjectQuestions.length} answered
                  </span>
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {stackQuestionsOpen ? "Hide" : "Edit"}
                  <ChevronDown className={cn("size-3.5 transition-transform", stackQuestionsOpen && "rotate-180")} />
                </span>
              </div>
              {!stackQuestionsOpen && answeredStackQs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {answeredStackQs.map((tq) => {
                    const vals = s.projectAnswers[tq.id] ?? [];
                    const labels = tq.options
                      ? vals.map((id) => tq.options?.find((o) => o.id === id)?.label).filter(Boolean).join(", ")
                      : vals[0];
                    return (
                      <span
                        key={tq.id}
                        className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px]"
                      >
                        <Check className="size-3 text-success" />
                        <span className="font-medium">{tq.label}:</span>
                        <span className="text-muted-foreground">{labels}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
            {stackQuestionsOpen && (
              <div className="border-t border-border/60 p-4">
                <QuestionList s={s} questions={s.techProjectQuestions} />
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* 3. Capabilities Workspace — Defaults to "Selected only" so only active items are shown unless browsing */}
      <section id="capabilities" className="min-w-0 scroll-mt-4 overflow-hidden rounded-xl border bg-card/70">
        <div className="border-b border-border/60 bg-muted/30 px-3 pt-2.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="text-sm font-semibold">3. Kit capabilities & guardrails</h2>
              <p className="text-xs text-muted-foreground">
                Showing the capabilities enabled for your project. Switch to &ldquo;Browse all&rdquo; to add or remove items.
              </p>
            </div>
            {!catalogOpen && (
              <div className="inline-flex rounded-lg border bg-background/80 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setShowAllCaps(false)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                    !effectiveShowAll
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Check className="size-3" />
                  Selected only ({selectedInTab.length})
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllCaps(true)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                    effectiveShowAll
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Filter className="size-3" />
                  Browse all ({tab.items.length})
                </button>
              </div>
            )}
          </div>

          <div role="tablist" aria-label="Capabilities" className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {tabs.map((t) => (
              <SegmentTab
                key={t.id}
                active={!catalogOpen && t.id === tab.id}
                onClick={() => {
                  setTabId(t.id);
                  setQuery("");
                }}
                icon={t.icon}
                label={t.label}
                count={`${t.items.filter((i) => isOn(t, i)).length}/${t.items.length}`}
              />
            ))}
            <SegmentTab
              active={catalogOpen}
              onClick={() => setTabId("catalog")}
              icon={Library}
              label="Skill catalog"
              count={`${s.catalogSel.size}`}
            />
          </div>
        </div>

        {catalogOpen ? (
          <div key="catalog" className="animate-fade-in p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Google, skills.sh and Agentic Awesome Skills, organised by domain. Licensed skills are copied into the kit; the rest go into
              skills-install.sh.
            </p>
            <CatalogPicker s={s} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-2.5 @3xl:flex-row @3xl:items-center @3xl:justify-between">
              <p className="text-xs text-muted-foreground">{tab.hint}</p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Filter ${tab.label.toLowerCase()}…`}
                    aria-label={`Filter ${tab.label}`}
                    className="h-8 w-48 pl-8 text-xs md:text-xs"
                  />
                </div>
                {effectiveShowAll && (
                  <BulkActions onAll={() => setAll(true)} onNone={() => setAll(false)} onReset={() => tab.setOverride(new Map())} />
                )}
              </div>
            </div>

            <div key={`${tab.id}-${effectiveShowAll}`} className="animate-fade-in p-4">
              {visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No {tab.label.toLowerCase()} match &ldquo;{query}&rdquo;.
                </p>
              ) : effectiveShowAll && tab.packs ? (
                <div className="flex flex-col gap-5">
                  {Object.entries(tab.packs).map(([packId, packLabel]) => {
                    const group = visible.filter((i) => i.pack === packId);
                    if (group.length === 0) return null;
                    return (
                      <div key={packId}>
                        <GroupLabel count={`${group.filter((i) => isOn(tab, i)).length}/${group.length}`}>
                          {packLabel}
                        </GroupLabel>
                        <div className={tileGridClass}>{group.map(renderItem)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={tileGridClass}>{visible.map(renderItem)}</div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
