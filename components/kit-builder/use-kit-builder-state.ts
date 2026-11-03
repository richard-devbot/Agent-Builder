"use client";

/**
 * All wizard state + derived data in one hook, so the step components stay
 * purely presentational. Also persists the configuration to localStorage
 * (restored on mount) so a half-finished kit survives a reload.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, type KitAgent } from "@/lib/kit/agents";
import { RULES, type RulePack } from "@/lib/kit/rules";
import { HOOKS } from "@/lib/kit/hooks";
import { COMMANDS } from "@/lib/kit/commands";
import type { KitSkill } from "@/lib/kit/skills";
import type { KitMcpServer } from "@/lib/kit/mcp-servers";
import { TECHNOLOGIES, resolveTechId } from "@/lib/kit/technologies";
import { SKILL_GROUPS, type SkillGroup } from "@/lib/kit/skill-groups";
import { buildKit, type Provider, type Selection } from "@/lib/kit/build-kit";
import {
  RECOMMENDED_ORG_GUIDELINE_IDS,
  orgGuidelineRules,
} from "@/lib/kit/org-guidelines";
import {
  isTechQuestion,
  relevantQuestions,
  projectProfileRule,
  type ProjectAnswers,
} from "@/lib/kit/project-questions";
import {
  projectTypeRule,
  projectTypeSkills,
  projectTypeTrigger,
  type ProjectType,
} from "@/lib/kit/project-types";
import { createZip } from "@/lib/kit/zip";
import type { RepoDiscovery } from "@/lib/kit/repo-discovery-client";
import type { CatalogSkill } from "@/lib/skill-catalog/domains";
import { fetchSkillFiles, type FetchedSkill } from "@/lib/skill-catalog/client";
import { catalogFiles } from "./catalog-files";
import { loadCatalog } from "@/lib/skill-catalog/client";
import { briefMarkdown } from "@/lib/intake/brief";
import { generateAdkProject } from "@/lib/adk/generate";
import { useIntake, type IntakeSnapshot } from "./intake/use-intake";

/** Does a recommendedFor/appliesTo list match the selected tech set? */
export function matches(recommendedFor: string[], tech: Set<string>): boolean {
  return recommendedFor.some((id) => id === "always" || tech.has(id));
}

const STORAGE_KEY = "agent-builder-kit-v1";

/** JSON-serializable snapshot of everything the user configured. */
type PersistedState = {
  provider: Provider;
  step: number;
  projectType: ProjectType | null;
  tech: string[];
  orgName: string;
  orgGuidelineSel: string[];
  projectName: string;
  projectAnswers: ProjectAnswers;
  overrides: Record<string, [string, boolean][]>;
  bodyEdits: [string, string][];
  authoredSkills: KitSkill[];
  discovery?: RepoDiscovery | null;
  catalogSkills?: CatalogSkill[];
  intake?: IntakeSnapshot;
};

/** Fetch state for a catalog skill's SKILL.md and references. */
export type CatalogFetch = { status: "loading" } | { status: "ready"; files: FetchedSkill } | { status: "error"; error: string };

export type KitBuilderState = ReturnType<typeof useKitBuilderState>;

export function useKitBuilderState({
  skills,
  mcpServers,
}: {
  skills: KitSkill[];
  mcpServers: KitMcpServer[];
}) {
  const [provider, setProvider] = useState<Provider>("claude-code");
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [tech, setTech] = useState<Set<string>>(new Set());
  const [customTech, setCustomTech] = useState("");

  // Explicit on/off overrides keyed by item id. When absent, the item
  // falls back to whether it's recommended by the current tech selection.
  const [agentOverride, setAgentOverride] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [ruleOverride, setRuleOverride] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [skillOverride, setSkillOverride] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [hookOverride, setHookOverride] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [commandOverride, setCommandOverride] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [mcpOverride, setMcpOverride] = useState<Map<string, boolean>>(
    new Map(),
  );

  // ADK Agent customization before deployment
  const [adkModel, setAdkModel] = useState<string>("gemini-2.5-flash");
  const [adkInstruction, setAdkInstruction] = useState<string>("");
  const [adkTools, setAdkTools] = useState<Set<string>>(
    () => new Set(["context", "validation", "guardrails", "memory", "database"])
  );

  const toggleAdkTool = (id: string) => {
    setAdkTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // Body edits keyed by id/slug.
  const [bodyEdits, setBodyEdits] = useState<Map<string, string>>(new Map());

  // Direct file content overrides edited in preview dialog
  const [fileEdits, setFileEdits] = useState<Map<string, string>>(new Map());

  const setFileContent = (filePath: string, content: string) => {
    setFileEdits((prev) => {
      const next = new Map(prev);
      next.set(filePath, content);
      return next;
    });
  };

  const resetFileContent = (filePath: string) => {
    setFileEdits((prev) => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  };

  const [step, setStep] = useState<number>(1);

  // Step 2 — organization guidelines.
  const [orgName, setOrgName] = useState("Richardson & Team");
  const [orgGuidelineSel, setOrgGuidelineSel] = useState<Set<string>>(
    () => new Set(RECOMMENDED_ORG_GUIDELINE_IDS),
  );

  // Step 3 — project details.
  const [projectName, setProjectName] = useState("");
  const [projectAnswers, setProjectAnswers] = useState<ProjectAnswers>({});
  // Skills AI-authored from uploaded documents (author-skill Lambda).
  const [authoredSkills, setAuthoredSkills] = useState<KitSkill[]>([]);
  // Server-side repo analysis (repo-discovery Lambda).
  const [discovery, setDiscovery] = useState<RepoDiscovery | null>(null);
  // Skills picked from the external catalog, and their fetched files (not persisted).
  const [catalogSel, setCatalogSel] = useState<Map<string, CatalogSkill>>(new Map());
  const [catalogFetch, setCatalogFetch] = useState<Map<string, CatalogFetch>>(new Map());
  const intake = useIntake();
  const restoreIntake = intake.restore;

  const [skillFilter, setSkillFilter] = useState<SkillGroup | "all">("all");
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    id: string;
    title: string;
    body: string;
  } | null>(null);

  // ── Persistence (localStorage, restored after mount to avoid SSR mismatch) ──
  const hydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as PersistedState;
        if (s.provider) setProvider(s.provider);
        if (s.step) setStep(s.step);
        setProjectType(s.projectType ?? null);
        setTech(new Set(s.tech ?? []));
        setOrgName(s.orgName || "Richardson & Team");
        if (s.orgGuidelineSel) setOrgGuidelineSel(new Set(s.orgGuidelineSel));
        setProjectName(s.projectName ?? "");
        setProjectAnswers(s.projectAnswers ?? {});
        const o = s.overrides ?? {};
        setAgentOverride(new Map(o.agent ?? []));
        setRuleOverride(new Map(o.rule ?? []));
        setSkillOverride(new Map(o.skill ?? []));
        setHookOverride(new Map(o.hook ?? []));
        setCommandOverride(new Map(o.command ?? []));
        setMcpOverride(new Map(o.mcp ?? []));
        setBodyEdits(new Map(s.bodyEdits ?? []));
        setAuthoredSkills(s.authoredSkills ?? []);
        setDiscovery(s.discovery ?? null);
        setCatalogSel(new Map((s.catalogSkills ?? []).map((c) => [c.id, c])));
        restoreIntake(s.intake);
      }
    } catch {
      // Corrupt/legacy snapshot — start fresh.
    }
    hydrated.current = true;
  }, [restoreIntake]);

  useEffect(() => {
    if (!hydrated.current) return;
    const snapshot: PersistedState = {
      provider,
      step,
      projectType,
      tech: [...tech],
      orgName,
      orgGuidelineSel: [...orgGuidelineSel],
      projectName,
      projectAnswers,
      overrides: {
        agent: [...agentOverride],
        rule: [...ruleOverride],
        skill: [...skillOverride],
        hook: [...hookOverride],
        command: [...commandOverride],
        mcp: [...mcpOverride],
      },
      bodyEdits: [...bodyEdits],
      authoredSkills,
      discovery,
      catalogSkills: [...catalogSel.values()],
      intake: intake.snapshot,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full/unavailable — persistence is best-effort.
    }
  }, [
    provider,
    step,
    projectType,
    tech,
    orgName,
    orgGuidelineSel,
    projectName,
    projectAnswers,
    agentOverride,
    ruleOverride,
    skillOverride,
    hookOverride,
    commandOverride,
    mcpOverride,
    bodyEdits,
    authoredSkills,
    discovery,
    catalogSel,
    intake.snapshot,
  ]);

  // Download licensed catalog skills that are selected but not fetched yet
  // (new picks, and picks restored from localStorage after a reload).
  // In-flight downloads live in a ref so the effect only sets state when a
  // download settles; "loading" is derived from it when the state is read.
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    for (const skill of catalogSel.values()) {
      if (!skill.copyable || catalogFetch.has(skill.id) || inFlight.current.has(skill.id)) continue;
      inFlight.current.add(skill.id);
      fetchSkillFiles(skill)
        .finally(() => inFlight.current.delete(skill.id))
        .then(
          (files) => setCatalogFetch((prev) => new Map(prev).set(skill.id, { status: "ready", files })),
          (e: Error) => setCatalogFetch((prev) => new Map(prev).set(skill.id, { status: "error", error: e.message })),
        );
    }
  }, [catalogSel, catalogFetch]);

  function toggleCatalogSkill(skill: CatalogSkill) {
    setCatalogSel((prev) => {
      const next = new Map(prev);
      if (next.has(skill.id)) next.delete(skill.id);
      else next.set(skill.id, skill);
      return next;
    });
  }

  const catalogStatus = (id: string): CatalogFetch | undefined =>
    catalogFetch.get(id) ?? (catalogSel.get(id)?.copyable ? { status: "loading" } : undefined);

  /** Push the accepted parts of the Discovery plan into the later steps. */
  async function applyIntakePlan() {
    const plan = intake.plan;
    if (!plan) return;
    if (plan.projectType !== "none") setProjectType(plan.projectType);
    if (plan.technologies.length) setTech((prev) => new Set([...prev, ...plan.technologies]));
    if (!projectName && intake.brief.title) setProjectName(intake.brief.title);
    const picked = plan.skills.flatMap((s) => s.skillIds).filter((id) => intake.accepted.includes(id));
    const curated = picked.filter((id) => id.startsWith("curated:")).map((id) => id.slice("curated:".length));
    if (curated.length) {
      const next = new Map(skillOverride);
      for (const slug of curated) next.set(slug, true);
      setSkillOverride(next);
    }
    const external = picked.filter((id) => !id.startsWith("curated:"));
    if (external.length) {
      const index = await loadCatalog();
      const byId = new Map(index.skills.map((k) => [k.id, k]));
      setCatalogSel((prev) => {
        const next = new Map(prev);
        for (const id of external) {
          const k = byId.get(id);
          if (k) next.set(id, k);
        }
        return next;
      });
    }
    intake.markApplied();
  }

  function retryCatalogSkill(id: string) {
    setCatalogFetch((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  // ── Actions ──
  const isSelected = (
    id: string,
    recommendedFor: string[],
    override: Map<string, boolean>,
  ): boolean => override.get(id) ?? matches(recommendedFor, tech);

  function toggleTech(id: string) {
    setTech((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Store a repo-discovery result and pre-select its suggested technologies. */
  function applyDiscovery(d: RepoDiscovery | null) {
    setDiscovery(d);
    if (!d) return;
    const ids = d.suggestedTechnologies
      .map((t) => resolveTechId(t))
      .filter(Boolean);
    if (ids.length > 0) {
      setTech((prev) => new Set([...prev, ...ids]));
    }
  }

  function addCustomTech() {
    const id = resolveTechId(customTech);
    if (id) setTech((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setCustomTech("");
  }

  function toggle(
    id: string,
    recommendedFor: string[],
    override: Map<string, boolean>,
    setOverride: (m: Map<string, boolean>) => void,
  ) {
    const current = isSelected(id, recommendedFor, override);
    const next = new Map(override);
    next.set(id, !current);
    setOverride(next);
  }

  function toggleOrgGuideline(id: string) {
    setOrgGuidelineSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Set a single-choice answer (replaces), or toggle within a multi-choice. */
  function setChoiceAnswer(qId: string, optId: string, multi: boolean) {
    setProjectAnswers((prev) => {
      const cur = prev[qId] ?? [];
      let nextVal: string[];
      if (multi) {
        nextVal = cur.includes(optId)
          ? cur.filter((v) => v !== optId)
          : [...cur, optId];
      } else {
        nextVal = cur[0] === optId ? [] : [optId];
      }
      return { ...prev, [qId]: nextVal };
    });
  }

  function setTextAnswer(qId: string, text: string) {
    setProjectAnswers((prev) => ({ ...prev, [qId]: text ? [text] : [] }));
  }

  function openEditor(id: string, title: string, defaultBody: string) {
    setEditor({ id, title, body: bodyEdits.get(id) ?? defaultBody });
  }

  // ── Derived data ──
  const selectedAgents = useMemo(
    () => AGENTS.filter((a) => isSelected(a.id, a.recommendedFor, agentOverride)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tech, agentOverride],
  );
  const selectedRules = useMemo(
    () => RULES.filter((r) => isSelected(r.id, r.appliesTo, ruleOverride)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tech, ruleOverride],
  );
  const selectedSkills = useMemo(
    () =>
      skills.filter((s) =>
        isSelected(s.slug, s.recommendedFor, skillOverride),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tech, skillOverride, skills],
  );
  const selectedHooks = useMemo(
    () => HOOKS.filter((h) => isSelected(h.id, h.recommendedFor, hookOverride)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tech, hookOverride],
  );
  const selectedCommands = useMemo(
    () =>
      COMMANDS.filter((c) =>
        isSelected(c.id, c.recommendedFor, commandOverride),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tech, commandOverride],
  );
  const selectedMcpServers = useMemo(
    () =>
      mcpServers.filter((m) =>
        isSelected(m.slug, m.recommendedFor, mcpOverride),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tech, mcpOverride, mcpServers],
  );

  // Custom agents and skills drafted in Discovery, once applied and still ticked.
  const intakeAgents: KitAgent[] = useMemo(() => {
    if (!intake.applied || !intake.plan) return [];
    return intake.plan.customAgents
      .filter((a) => intake.accepted.includes(`agent:${a.name}`))
      .map((a) => ({ id: a.name, name: a.name, pack: "core", description: a.description, recommendedFor: [], tools: a.tools, body: a.body }));
  }, [intake.applied, intake.plan, intake.accepted]);
  const intakeSkills: KitSkill[] = useMemo(() => {
    if (!intake.applied || !intake.plan) return [];
    return intake.plan.customSkills
      .filter((sk) => intake.accepted.includes(`skill:${sk.name}`))
      .map((sk) => ({ slug: `intake-${sk.name}`, name: sk.title, skillName: sk.name, description: sk.description, recommendedFor: [], group: "Build", body: sk.body }));
  }, [intake.applied, intake.plan, intake.accepted]);

  const selection: Selection = useMemo(() => {
    const applyBody = <T extends { body: string }>(item: T, id: string): T => {
      const edit = bodyEdits.get(id);
      return edit !== undefined ? { ...item, body: edit } : item;
    };
    // Org guidelines (step 2) and the compiled project profile (step 3) are
    // delivered as governance rules, so they flow through the normal
    // per-provider emission alongside the rules chosen in step 1.
    const orgRules = orgGuidelineRules(orgGuidelineSel, orgName);
    const questionTriggers = projectType
      ? [...tech, projectTypeTrigger(projectType)]
      : [...tech];
    const profile = projectProfileRule(
      questionTriggers,
      projectAnswers,
      projectName,
    );
    const typeRule = projectTypeRule(projectType);
    return {
      projectName: projectName.trim() || undefined,
      adkModel,
      adkInstruction: adkInstruction.trim() || undefined,
      adkTools: Array.from(adkTools),
      technologies: [...tech],
      agents: [...selectedAgents.map((a: KitAgent) => applyBody(a, `agent:${a.id}`)), ...intakeAgents],
      rules: [
        ...selectedRules.map((r: RulePack) => applyBody(r, `rule:${r.id}`)),
        ...orgRules,
        ...(typeRule ? [typeRule] : []),
        ...(profile ? [profile] : []),
      ],
      skills: [
        ...selectedSkills.map((s) => applyBody(s, `skill:${s.slug}`)),
        ...projectTypeSkills(projectType).map((s) =>
          applyBody(s, `skill:${s.slug}`),
        ),
        ...authoredSkills,
        ...intakeSkills,
      ],
      commands: selectedCommands.map((c) => applyBody(c, `command:${c.id}`)),
      hooks: selectedHooks,
      mcpServers: selectedMcpServers,
    };
  }, [
    tech,
    projectType,
    selectedAgents,
    selectedRules,
    selectedSkills,
    selectedCommands,
    selectedHooks,
    selectedMcpServers,
    bodyEdits,
    authoredSkills,
    orgGuidelineSel,
    orgName,
    projectAnswers,
    projectName,
    adkModel,
    adkInstruction,
    adkTools,
    intakeAgents,
    intakeSkills,
  ]);

  const files = useMemo(() => {
    const out = buildKit(selection, provider);
    if (discovery) {
      out.push({
        path: "project-context.md",
        contents: discovery.projectContextMarkdown.trim() + "\n",
      });
    }
    out.push(...catalogFiles([...catalogSel.values()], catalogFetch, provider));
    // The runnable ADK agent system designed in Discovery, under its own folder.
    if (intake.applied && intake.plan?.adk && intake.accepted.includes("adk")) {
      for (const f of generateAdkProject(intake.plan.adk)) out.push({ path: `adk-agent/${f.path}`, contents: f.contents });
    }
    if (intake.hasContent) {
      out.push({
        path: "discovery-brief.md",
        contents: briefMarkdown({ brief: intake.brief, role: intake.role, materials: intake.materials, answers: intake.answers, plan: intake.plan }),
      });
    }
    return out.map((f) => {
      const custom = fileEdits.get(f.path);
      return custom !== undefined ? { ...f, contents: custom } : f;
    });
  }, [selection, provider, discovery, fileEdits, catalogSel, catalogFetch, intake.hasContent, intake.brief, intake.role, intake.materials, intake.answers, intake.plan, intake.applied, intake.accepted]);

  function download() {
    const blob = createZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-kit-${provider}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const customTechIds = [...tech].filter(
    (id) => !TECHNOLOGIES.some((t) => t.id === id),
  );

  // Groups present in the loaded skills, in canonical order, with select counts.
  const skillGroups = useMemo(() => {
    const present = new Set(skills.map((s) => s.group));
    return SKILL_GROUPS.filter((g) => present.has(g)).map((g) => ({
      group: g,
      total: skills.filter((s) => s.group === g).length,
      selected: skills.filter(
        (s) =>
          s.group === g && isSelected(s.slug, s.recommendedFor, skillOverride),
      ).length,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills, tech, skillOverride]);

  const visibleSkills =
    skillFilter === "all"
      ? skills
      : skills.filter((s) => s.group === skillFilter);

  // Follow-up questions that apply to the current stack + project type.
  // Type/always-driven questions belong to the project-details step; questions
  // triggered by a technology selection are asked alongside the stack picker.
  const projectQuestions = useMemo(
    () =>
      relevantQuestions(
        projectType ? [...tech, projectTypeTrigger(projectType)] : tech,
      ),
    [tech, projectType],
  );
  const baseProjectQuestions = useMemo(
    () => projectQuestions.filter((q) => !isTechQuestion(q)),
    [projectQuestions],
  );
  const techProjectQuestions = useMemo(
    () => projectQuestions.filter(isTechQuestion),
    [projectQuestions],
  );

  return {
    // core
    skills,
    mcpServers,
    provider,
    setProvider,
    projectType,
    setProjectType,
    tech,
    toggleTech,
    customTech,
    setCustomTech,
    addCustomTech,
    customTechIds,
    // overrides
    isSelected,
    toggle,
    agentOverride,
    setAgentOverride,
    ruleOverride,
    setRuleOverride,
    skillOverride,
    setSkillOverride,
    hookOverride,
    setHookOverride,
    commandOverride,
    setCommandOverride,
    mcpOverride,
    setMcpOverride,
    // ADK Agent customizer
    adkModel,
    setAdkModel,
    adkInstruction,
    setAdkInstruction,
    adkTools,
    toggleAdkTool,
    // wizard
    step,
    setStep,
    orgName,
    setOrgName,
    orgGuidelineSel,
    setOrgGuidelineSel,
    toggleOrgGuideline,
    projectName,
    setProjectName,
    projectAnswers,
    setChoiceAnswer,
    setTextAnswer,
    projectQuestions,
    baseProjectQuestions,
    techProjectQuestions,
    authoredSkills,
    setAuthoredSkills,
    discovery,
    applyDiscovery,
    // external skill catalog
    catalogSel,
    catalogStatus,
    toggleCatalogSkill,
    retryCatalogSkill,
    // discovery intake
    intake,
    applyIntakePlan,
    // skill picker
    skillFilter,
    setSkillFilter,
    skillGroups,
    visibleSkills,
    // editor + preview
    bodyEdits,
    setBodyEdits,
    editor,
    setEditor,
    openEditor,
    openFile,
    setOpenFile,
    // output
    selection,
    files,
    fileEdits,
    setFileContent,
    resetFileContent,
    download,
  };
}
