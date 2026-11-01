"use client";

/** Step 4 — target assistant, technologies, stack questions and capability pickers. */

import { useState } from "react";
import {
  Bot,
  Boxes,
  ClipboardList,
  Layers,
  Library,
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
import { TECHNOLOGIES, TECH_GROUP_LABEL, TECH_GROUP_ORDER, techLabel } from "@/lib/kit/technologies";
import { AGENTS, AGENT_PACK_LABEL } from "@/lib/kit/agents";
import { RULES, RULE_KIND_LABEL } from "@/lib/kit/rules";
import { HOOKS } from "@/lib/kit/hooks";
import { COMMANDS } from "@/lib/kit/commands";
import { PROVIDER_LABEL } from "@/lib/kit/build-kit";
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
      hint: "Reusable skill packs, pre-selected from your stack.",
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
      hint: "External tools over Model Context Protocol, recommended from your stack.",
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

  const tabs = capabilityTabs(s);
  const catalogOpen = tabId === "catalog";
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const isOn = (t: CapTab, item: CapItem) => s.isSelected(item.id, item.rec, t.override);
  const q = query.trim().toLowerCase();
  const visible = q
    ? tab.items.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    : tab.items;
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

  return (
    <>
      <StepHeader
        n={4}
        actions={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background/60 px-2.5 text-xs text-muted-foreground">
            <Layers className="size-3.5 text-primary" />
            Generating for <span className="font-semibold text-foreground">{PROVIDER_LABEL[s.provider]}</span>
          </span>
        }
      />

      <Panel
        id="assistant"
        icon={Sparkles}
        title="Target assistant"
        description="We generate that tool's native file layout and execution model."
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
      </Panel>

      {s.provider === "google-adk" && (
        <Panel
          icon={Wrench}
          title="ADK agent & connectors"
          description="Foundation model, root prompt and callable Python tools."
          className="animate-fade-up"
        >
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
                <option value="gemini-2.5-flash">gemini-2.5-flash · recommended, fast with tools</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro · complex reasoning, multi-agent</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash · low latency</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro · long context window</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Pinned in agent.py and deployment/agent-card.json.</p>
            </div>
            <div>
              <label htmlFor="adk-instruction-input" className={fieldLabelClass}>
                Root coordinator prompt <span className="font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <Textarea
                id="adk-instruction-input"
                value={s.adkInstruction}
                onChange={(e) => s.setAdkInstruction(e.target.value)}
                placeholder="e.g. Prioritise SLA compliance and automated parity tests…"
                rows={2}
                className="min-h-9 text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">Added to Agent(instruction=…) alongside your standards.</p>
            </div>
          </div>
          <div className="mt-5">
            <GroupLabel count={`${s.adkTools.size}`}>Callable tools & connectors</GroupLabel>
            <p className="-mt-1 mb-2.5 font-mono text-[11px] text-muted-foreground">
              {s.projectName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "sdlc_agent"}/tools/
            </p>
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
        </Panel>
      )}

      <Panel
        id="technologies"
        icon={Boxes}
        title="Technologies"
        description="Your stack decides which agents, rules and skills we recommend."
        meta={<Count tone={s.tech.size ? "brand" : "muted"}>{`${s.tech.size} selected`}</Count>}
        actions={
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
              className="h-8 w-44 text-xs md:text-xs"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!s.customTech.trim()}>
              <Plus className="size-3.5" /> Add
            </Button>
          </form>
        }
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 @3xl:grid-cols-2 @7xl:grid-cols-3">
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
          {s.customTechIds.length > 0 && (
            <div>
              <GroupLabel>Custom</GroupLabel>
              <div className="flex flex-wrap gap-1.5">
                {s.customTechIds.map((id) => (
                  <Chip key={id} active onClick={() => s.toggleTech(id)}>
                    {techLabel(id)}
                    <X className="size-3" />
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {s.techProjectQuestions.length > 0 && (
        <Panel
          icon={ClipboardList}
          title="Stack questions"
          description="Follow-ups for the technologies you picked. Answers feed your project profile."
        >
          <QuestionList s={s} questions={s.techProjectQuestions} />
        </Panel>
      )}

      {/* Capabilities: one tabbed workspace instead of six stacked accordions. */}
      <section id="capabilities" className="min-w-0 scroll-mt-4 overflow-hidden rounded-xl border bg-card/70">
        <div className="border-b border-border/60 bg-muted/30 px-2 pt-2">
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
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">
          <p className="text-xs text-muted-foreground">{tab.hint}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${tab.label.toLowerCase()}…`}
                aria-label={`Filter ${tab.label}`}
                className="h-8 w-52 pl-8 text-xs md:text-xs"
              />
            </div>
            <BulkActions onAll={() => setAll(true)} onNone={() => setAll(false)} onReset={() => tab.setOverride(new Map())} />
          </div>
        </div>

        <div key={tab.id} className="animate-fade-in p-4">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No {tab.label.toLowerCase()} match “{query}”.</p>
          ) : tab.packs ? (
            <div className="flex flex-col gap-5">
              {Object.entries(tab.packs).map(([packId, packLabel]) => {
                const group = visible.filter((i) => i.pack === packId);
                if (group.length === 0) return null;
                return (
                  <div key={packId}>
                    <GroupLabel count={`${group.filter((i) => isOn(tab, i)).length}/${group.length}`}>{packLabel}</GroupLabel>
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
    </>
  );
}
