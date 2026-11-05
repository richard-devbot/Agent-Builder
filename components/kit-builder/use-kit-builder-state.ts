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
  RECOMMENDED_STANDARD_TEMPLATE_IDS,
  buildStandardsMarkdown,
} from "@/lib/kit/standard-templates";
import {
  isTechQuestion,
  relevantQuestions,
  projectProfileRule,
  recommendStandardsFromBrief,
  mapBriefToProjectAnswers,
  inferDeployTargetFromBrief,
  matchMcpServersFromBrief,
  inferTechnologiesFromBrief,
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
import { publicConfig } from "@/lib/config/public";
import {
  DEFAULT_DEPLOYMENT_SETUP,
  loadDeploymentSetup,
  loadKitStudioSnapshot,
  saveDeploymentSetup,
  saveKitStudioSnapshot,
  type DeploymentSetupState,
} from "@/lib/storage";
import { useIntake, type IntakeSnapshot } from "./intake/use-intake";

/** Does a recommendedFor/appliesTo list match the selected tech set? */
export function matches(recommendedFor: string[], tech: Set<string>): boolean {
  return recommendedFor.some((id) => id === "always" || tech.has(id));
}

/** JSON-serializable snapshot of everything the user configured. */
type PersistedState = {
  provider: Provider;
  step: number;
  projectType: ProjectType | null;
  tech: string[];
  orgName: string;
  orgGuidelineSel: string[];
  standardTemplateSel?: string[];
  projectName: string;
  projectAnswers: ProjectAnswers;
  overrides: Record<string, [string, boolean][]>;
  bodyEdits: [string, string][];
  authoredSkills: KitSkill[];
  discovery?: RepoDiscovery | null;
  catalogSkills?: CatalogSkill[];
  intake?: IntakeSnapshot;
  deploymentSetup?: DeploymentSetupState;
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
  const [adkModel, setAdkModel] = useState<string>("");
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

  // Step 2 — organization guidelines + engineering standards.
  const [orgName, setOrgName] = useState(publicConfig.orgName);
  const [orgGuidelineSel, setOrgGuidelineSel] = useState<Set<string>>(
    () => new Set(RECOMMENDED_ORG_GUIDELINE_IDS),
  );
  const [standardTemplateSel, setStandardTemplateSel] = useState<Set<string>>(
    () => new Set(RECOMMENDED_STANDARD_TEMPLATE_IDS),
  );

  // Step 3 — project details.
  const [projectName, setProjectNameState] = useState("");
  const [projectAnswers, setProjectAnswers] = useState<ProjectAnswers>({});
  const [discoverySyncedAnswerKeys, setDiscoverySyncedAnswerKeys] = useState<string[]>([]);

  // Step 5 — deployment setup.
  const [deploymentSetup, setDeploymentSetup] = useState<DeploymentSetupState>(
    DEFAULT_DEPLOYMENT_SETUP,
  );

  function updateDeploymentSetup(patch: Partial<DeploymentSetupState>) {
    setDeploymentSetup((prev) => {
      const next = { ...prev, ...patch };
      saveDeploymentSetup(next);
      return next;
    });
  }

  function setProjectName(nextName: string) {
    setProjectNameState(nextName);
    const cleanFolder = nextName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^[^a-z]+/, "")
      .replace(/_+/g, "_")
      .replace(/_$/, "")
      .slice(0, 62);
    const cleanSlug = nextName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^[^a-z0-9]+/, "")
      .replace(/-+/g, "-")
      .replace(/-$/, "")
      .slice(0, 62);
    setDeploymentSetup((prev) => {
      const next = {
        ...prev,
        agentFolderName: prev.agentFolderName || (cleanFolder.length >= 2 ? cleanFolder : ""),
        gitlabProjectSlug: prev.gitlabProjectSlug || (cleanSlug.length >= 2 ? cleanSlug : ""),
      };
      saveDeploymentSetup(next);
      return next;
    });
  }
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

  // ── Persistence (localStorage behind lib/storage, restored after mount) ──
  const hydrated = useRef(false);
  useEffect(() => {
    try {
      const storedSetup = loadDeploymentSetup();
      setDeploymentSetup(storedSetup);
      const s = loadKitStudioSnapshot<PersistedState>();
      if (s) {
        if (s.provider) setProvider(s.provider);
        if (s.step) setStep(s.step);
        setProjectType(s.projectType ?? null);
        setTech(new Set(s.tech ?? []));
        setOrgName(s.orgName ?? publicConfig.orgName);
        if (s.orgGuidelineSel) setOrgGuidelineSel(new Set(s.orgGuidelineSel));
        if (s.standardTemplateSel) setStandardTemplateSel(new Set(s.standardTemplateSel));
        setProjectNameState(s.projectName ?? "");
        setProjectAnswers(s.projectAnswers ?? {});
        if (s.deploymentSetup) {
          setDeploymentSetup({ ...storedSetup, ...s.deploymentSetup });
        }
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
      standardTemplateSel: [...standardTemplateSel],
      projectName,
      projectAnswers,
      deploymentSetup,
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
    saveKitStudioSnapshot(snapshot);
  }, [
    provider,
    step,
    projectType,
    tech,
    orgName,
    orgGuidelineSel,
    standardTemplateSel,
    projectName,
    projectAnswers,
    deploymentSetup,
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

  const discoveryRecommendations = useMemo(
    () =>
      intake.hasContent
        ? recommendStandardsFromBrief(intake.brief)
        : { orgGuidelineIds: [] as string[], standardTemplateIds: [] as string[] },
    [intake.hasContent, intake.brief],
  );
  const discoveryRecommendedOrgIds = useMemo(
    () => new Set(discoveryRecommendations.orgGuidelineIds),
    [discoveryRecommendations.orgGuidelineIds],
  );
  const discoveryRecommendedStdIds = useMemo(
    () => new Set(discoveryRecommendations.standardTemplateIds),
    [discoveryRecommendations.standardTemplateIds],
  );

  /** Push Discovery brief, live ADK architecture, and Blueprint outputs into Steps 2–7. */
  async function applyIntakePlan() {
    if (!intake.hasContent && !intake.plan && !intake.hasAdkFlow) return;
    const plan = intake.plan;

    // 1. Step 2 — Organisation Guidelines & Engineering Standards
    const recStds = recommendStandardsFromBrief(intake.brief);
    if (recStds.orgGuidelineIds.length > 0) {
      setOrgGuidelineSel((prev) => new Set([...prev, ...recStds.orgGuidelineIds]));
    }
    if (recStds.standardTemplateIds.length > 0) {
      setStandardTemplateSel((prev) => new Set([...prev, ...recStds.standardTemplateIds]));
    }

    // 2. Step 3 — Greenfield / Brownfield / Legacy Project Details & Answers
    const targetProjectType: ProjectType =
      plan && plan.projectType !== "none"
        ? plan.projectType
        : projectType ?? "greenfield";
    setProjectType(targetProjectType);

    const resolvedTitle =
      intake.brief.title.trim() ||
      (intake.hasAdkFlow ? intake.liveAdk.title.trim() : "");
    if (resolvedTitle) {
      setProjectName(resolvedTitle);
    }

    const mappedAnswers = mapBriefToProjectAnswers(
      intake.brief,
      plan,
      intake.hasAdkFlow ? intake.liveAdk : null,
      intake.materials,
    );
    setProjectAnswers((prev) => ({ ...prev, ...mappedAnswers }));
    setDiscoverySyncedAnswerKeys(Object.keys(mappedAnswers));

    // 3. Step 4 — Stack, Skills, MCP Servers & ADK Settings
    const inferredTech = inferTechnologiesFromBrief(
      intake.brief,
      plan,
      intake.hasAdkFlow,
    );
    if (inferredTech.length > 0) {
      setTech((prev) => new Set([...prev, ...inferredTech]));
    }

    const matchedMcp = matchMcpServersFromBrief(
      intake.brief,
      intake.hasAdkFlow ? intake.liveAdk : null,
    );
    if (matchedMcp.length > 0) {
      setMcpOverride((prev) => {
        const next = new Map(prev);
        for (const slug of matchedMcp) next.set(slug, true);
        return next;
      });
    }

    const agentSkills = intake.hasAdkFlow
      ? intake.liveAdk.agents.flatMap((a) => a.skills ?? [])
      : [];
    const picked = (plan?.skills ?? [])
      .flatMap((s) => s.skillIds)
      .filter((id) => intake.accepted.includes(id));
    const curated = [
      ...picked
        .filter((id) => id.startsWith("curated:"))
        .map((id) => id.slice("curated:".length)),
      ...agentSkills,
    ];
    if (curated.length > 0) {
      setSkillOverride((prev) => {
        const next = new Map(prev);
        for (const slug of curated) next.set(slug, true);
        return next;
      });
    }

    const external = picked.filter((id) => !id.startsWith("curated:"));
    if (external.length > 0) {
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

    if (intake.hasAdkFlow && (intake.accepted.includes("adk") || !plan)) {
      setProvider("google-adk");
      const rootAgent = intake.liveAdk.agents.find(
        (a) => a.name === intake.liveAdk.rootAgent,
      );
      if (rootAgent?.model) setAdkModel(rootAgent.model);
      if (rootAgent?.instruction) setAdkInstruction(rootAgent.instruction);
      const nextTools = new Set([
        "context",
        "validation",
        "guardrails",
        "memory",
        "database",
      ]);
      const toolCorpus = intake.liveAdk.tools
        .map((t) => `${t.name} ${t.connectorSystem ?? ""}`)
        .join(" ");
      if (/\bjira\b/i.test(toolCorpus) || matchedMcp.includes("jira-mcp")) {
        nextTools.add("jira");
      }
      setAdkTools(nextTools);
    }

    // 4. Step 5 — Deployment Setup (agentFolderName, gitlabProjectSlug, deployTarget)
    if (intake.hasAdkFlow) {
      const pkg = intake.liveAdk.packageName;
      const slugSource = intake.brief.title.trim() || pkg;
      const cleanSlug = slugSource
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^[^a-z0-9]+/, "")
        .replace(/-+/g, "-")
        .replace(/-$/, "")
        .slice(0, 62);
      const inferredTarget = inferDeployTargetFromBrief(
        intake.brief,
        intake.liveAdk,
      );
      updateDeploymentSetup({
        agentFolderName: /^[a-z][a-z0-9_]{1,62}$/.test(pkg)
          ? pkg
          : deploymentSetup.agentFolderName,
        gitlabProjectSlug:
          cleanSlug.length >= 2 ? cleanSlug : deploymentSetup.gitlabProjectSlug,
        deployTarget: inferredTarget,
        agentDisplayName:
          intake.liveAdk.title ||
          intake.brief.title ||
          deploymentSetup.agentDisplayName,
        agentDescription:
          intake.liveAdk.description ||
          intake.brief.summary ||
          intake.brief.problem ||
          deploymentSetup.agentDescription,
      });
    }

    intake.markApplied();
  }

  function handleSetStep(nextStep: number | ((prev: number) => number)) {
    const resolved = typeof nextStep === "function" ? nextStep(step) : nextStep;
    if (step === 1 && resolved > 1 && intake.hasContent && !intake.applied) {
      void applyIntakePlan();
    }
    setStep(resolved);
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

  function toggleStandardTemplate(id: string) {
    setStandardTemplateSel((prev) => {
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
    const standardsBody = buildStandardsMarkdown(standardTemplateSel);
    const standardsRule: RulePack | null = standardsBody
      ? {
          id: "org-engineering-standards",
          name: "Engineering Standards Library",
          kind: "governance",
          description:
            "Enterprise engineering standards (Observability, Security, Coding, Error Handling, API Design, Testing, Architecture, Data, CI/CD, Design Systems)",
          appliesTo: ["always"],
          globs: ["**/*"],
          body: standardsBody,
        }
      : null;
    const questionTriggers = projectType
      ? [...tech, projectTypeTrigger(projectType)]
      : [...tech];
    const profile = projectProfileRule(
      questionTriggers,
      projectAnswers,
      projectName,
    );
    const typeRule = projectTypeRule(projectType);
    const activeAdkProject =
      intake.hasAdkFlow && (intake.accepted.includes("adk") || !intake.plan)
        ? intake.liveAdk
        : null;
    return {
      projectName: projectName.trim() || undefined,
      agentFolderName:
        deploymentSetup.agentFolderName.trim() ||
        activeAdkProject?.packageName ||
        undefined,
      deployTarget: deploymentSetup.deployTarget,
      adkModel,
      adkInstruction: adkInstruction.trim() || undefined,
      adkTools: Array.from(adkTools),
      adkProject: activeAdkProject,
      technologies: [...tech],
      agents: [...selectedAgents.map((a: KitAgent) => applyBody(a, `agent:${a.id}`)), ...intakeAgents],
      rules: [
        ...selectedRules.map((r: RulePack) => applyBody(r, `rule:${r.id}`)),
        ...orgRules,
        ...(standardsRule ? [standardsRule] : []),
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
      standardIds: [...standardTemplateSel],
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
    standardTemplateSel,
    orgName,
    projectAnswers,
    projectName,
    deploymentSetup.agentFolderName,
    deploymentSetup.deployTarget,
    adkModel,
    adkInstruction,
    adkTools,
    intakeAgents,
    intakeSkills,
    intake.hasAdkFlow,
    intake.accepted,
    intake.plan,
    intake.liveAdk,
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
    // For non-google-adk providers, include the ADK agent system under adk-agent/.
    // For google-adk, buildKit(selection, "google-adk") already emits the unified
    // multi-agent ADK orchestration directly inside <agentFolderName>/ at the repo root!
    if (provider !== "google-adk" && selection.adkProject) {
      for (const f of generateAdkProject(selection.adkProject, { deployTarget: deploymentSetup.deployTarget }))
        out.push({ path: `adk-agent/${f.path}`, contents: f.contents });
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
  }, [selection, provider, discovery, fileEdits, catalogSel, catalogFetch, intake.hasContent, intake.brief, intake.role, intake.materials, intake.answers, intake.plan, deploymentSetup.deployTarget]);

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
    setStep: handleSetStep,
    orgName,
    setOrgName,
    orgGuidelineSel,
    setOrgGuidelineSel,
    toggleOrgGuideline,
    standardTemplateSel,
    setStandardTemplateSel,
    toggleStandardTemplate,
    discoveryRecommendedOrgIds,
    discoveryRecommendedStdIds,
    discoverySyncedAnswerKeys,
    projectName,
    setProjectName,
    deploymentSetup,
    updateDeploymentSetup,
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
