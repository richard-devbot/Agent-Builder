"use client";

/**
 * Discovery chat state: the conversation with the Discovery agent, shared
 * materials and their analysis, the living brief and the solution plan.
 * Persisted with the rest of the kit builder via `snapshot` / `restore`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Answer,
  Brief,
  BriefField,
  FollowUpQuestion,
  IntakeRole,
  IntakeStatus,
  Material,
  MaterialInsight,
  Plan,
  Turn,
} from "@/contracts/intake";
import { EMPTY_BRIEF, completeness } from "@/lib/intake/brief";
import { clipMaterial, getIntakeStatus, requestAnalyze, requestFollowUp, requestPlan } from "@/lib/intake/client";
import { extractText } from "@/lib/intake/extract-text";

type Mode = "ai" | "guided";

export type ChatMessage =
  | { id: string; role: "user"; text: string; attachments?: string[] }
  | { id: string; role: "agent"; kind: "text"; text: string; mode: Mode }
  | {
      id: string;
      role: "agent";
      kind: "questions";
      text: string;
      mode: Mode;
      questions: FollowUpQuestion[];
      /** Answer text keyed by question id. */
      answers: Record<string, string>;
      submitted: boolean;
    }
  | { id: string; role: "agent"; kind: "analysis"; text: string; mode: Mode; insights: (MaterialInsight & { name: string })[] }
  | { id: string; role: "agent"; kind: "plan"; text: string; mode: Mode };

type QuestionsMessage = Extract<ChatMessage, { kind: "questions" }>;

export type IntakeSnapshot = {
  role: IntakeRole;
  materials: Material[];
  /** Material ids the analyst has already read. */
  analyzed: string[];
  brief: Brief;
  messages: ChatMessage[];
  /** Structured answers to the agent's question cards, oldest first. */
  answers: Answer[];
  turns: number;
  done: boolean;
  plan: Plan | null;
  planMode: Mode | null;
  /** Draft keys / catalog ids the user kept ticked in the plan. */
  accepted: string[];
  applied: boolean;
};

const EMPTY: IntakeSnapshot = {
  role: "developer",
  materials: [],
  analyzed: [],
  brief: EMPTY_BRIEF,
  messages: [],
  answers: [],
  turns: 0,
  done: false,
  plan: null,
  planMode: null,
  accepted: [],
  applied: false,
};

export type Busy = null | "reading" | "analyzing" | "thinking" | "planning";

const MAX_MATERIALS = 12;
const TRANSCRIPT = 12;
const newId = () => Math.random().toString(36).slice(2, 10);

function defaultAccepted(plan: Plan): string[] {
  return [
    ...plan.customAgents.map((a) => `agent:${a.name}`),
    ...plan.customSkills.map((s) => `skill:${s.name}`),
    ...plan.skills.flatMap((s) => s.skillIds.slice(0, 1)),
  ];
}

/** Answers typed into a question card, as contract Answers. */
function cardAnswers(m: QuestionsMessage): Answer[] {
  return m.questions
    .filter((q) => m.answers[q.id]?.trim())
    .map((q) => ({ questionId: q.id, field: q.field, question: q.question, answer: m.answers[q.id].trim() }));
}

function transcriptOf(messages: ChatMessage[]): Turn[] {
  return messages
    .filter((m) => m.text.trim())
    .slice(-TRANSCRIPT)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 2_000) }));
}

/** Snapshots saved before the chat redesign stored question rounds instead of messages. */
type LegacySnapshot = Partial<IntakeSnapshot> & {
  rounds?: { message: string; questions: FollowUpQuestion[]; answers: Record<string, string>; submitted: boolean; mode: Mode }[];
};
function migrate(snap: LegacySnapshot): IntakeSnapshot {
  const messages: ChatMessage[] =
    snap.messages ??
    (snap.rounds ?? []).map((r) => ({ id: newId(), role: "agent", kind: "questions", text: r.message, mode: r.mode, questions: r.questions, answers: r.answers, submitted: true }));
  return {
    ...EMPTY,
    ...snap,
    brief: { ...EMPTY_BRIEF, ...snap.brief },
    messages,
    answers: snap.answers ?? messages.flatMap((m) => (m.role === "agent" && m.kind === "questions" ? cardAnswers(m) : [])),
    analyzed: snap.analyzed ?? (snap.materials ?? []).map((m) => m.id),
  };
}

export function useIntake() {
  const [state, setState] = useState<IntakeSnapshot>(EMPTY);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<IntakeStatus | null>(null);

  useEffect(() => {
    getIntakeStatus().then(setAi);
  }, []);

  // Stable so the kit builder's one-time hydration effect can depend on it.
  const restore = useCallback((snap: IntakeSnapshot | undefined) => {
    if (snap) setState(migrate(snap));
  }, []);

  const push = (s: IntakeSnapshot, ...m: ChatMessage[]): IntakeSnapshot => ({ ...s, messages: [...s.messages, ...m] });

  /** One follow-up turn against an explicit snapshot (state updates are async). */
  async function followUp(s: IntakeSnapshot, message: string): Promise<IntakeSnapshot> {
    const asked = s.messages.flatMap((m) => (m.role === "agent" && m.kind === "questions" ? m.questions.map((q) => q.id) : []));
    const res = await requestFollowUp({
      role: s.role,
      brief: s.brief,
      materials: s.materials,
      answers: s.answers,
      asked,
      transcript: transcriptOf(s.messages.slice(0, message ? -1 : undefined)),
      round: s.turns,
      message,
    });
    const reply: ChatMessage = res.questions.length
      ? { id: newId(), role: "agent", kind: "questions", text: res.message, mode: res.mode, questions: res.questions, answers: {}, submitted: false }
      : { id: newId(), role: "agent", kind: "text", text: res.message, mode: res.mode };
    return push({ ...s, brief: res.brief, done: res.done, turns: s.turns + 1 }, reply);
  }

  /** Run an async step with a busy flag; errors surface in the chat banner. */
  async function run(kind: Exclude<Busy, null>, from: IntakeSnapshot, step: (s: IntakeSnapshot) => Promise<IntakeSnapshot>) {
    setBusy(kind);
    setError(null);
    setState(from);
    try {
      setState(await step(from));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  /** Close any open question card, keeping what was typed into it. */
  function closeCards(s: IntakeSnapshot): IntakeSnapshot {
    const fresh: Answer[] = [];
    const messages = s.messages.map((m) => {
      if (m.role !== "agent" || m.kind !== "questions" || m.submitted) return m;
      fresh.push(...cardAnswers(m));
      return { ...m, submitted: true };
    });
    return { ...s, messages, answers: [...s.answers, ...fresh] };
  }

  /** Free-form message: an answer, extra context, or a question for the agent. */
  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const s = push(closeCards(state), { id: newId(), role: "user", text: t });
    return run("thinking", s, (x) => followUp(x, t));
  }

  /** Submit the answers typed into a question card. */
  function submitAnswers(messageId: string) {
    if (busy) return;
    const card = state.messages.find((m): m is QuestionsMessage => m.id === messageId && m.role === "agent" && m.kind === "questions");
    if (!card) return;
    const given = cardAnswers(card);
    const summary = given.map((a) => `${a.question} ${a.answer}`).join("\n");
    const s = push(closeCards(state), { id: newId(), role: "user", text: summary || "Skip these for now." });
    return run("thinking", s, (x) => followUp(x, ""));
  }

  function setAnswer(messageId: string, questionId: string, value: string) {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.id === messageId && m.role === "agent" && m.kind === "questions" ? { ...m, answers: { ...m.answers, [questionId]: value } } : m,
      ),
    }));
  }

  /** Analyse newly shared materials, then let the agent ask informed questions. */
  function analyzeAndFollowUp(s: IntakeSnapshot, ids: string[]) {
    return run("analyzing", s, async (x) => {
      const res = await requestAnalyze({ role: x.role, brief: x.brief, materials: x.materials, analyze: ids });
      const names = new Map(x.materials.map((m) => [m.id, m.name]));
      let next = push(
        { ...x, brief: res.brief, analyzed: [...new Set([...x.analyzed, ...ids])] },
        {
          id: newId(),
          role: "agent",
          kind: "analysis",
          text: res.message,
          mode: res.mode,
          insights: res.insights.map((i) => ({ ...i, name: names.get(i.materialId) ?? "Material" })),
        },
      );
      setState(next);
      setBusy("thinking");
      // Only ask new questions if none are waiting for an answer.
      const open = next.messages.some((m) => m.role === "agent" && m.kind === "questions" && !m.submitted);
      if (!open) next = await followUp(next, "");
      return next;
    });
  }

  async function addFiles(files: FileList | File[]) {
    if (busy) return;
    setBusy("reading");
    setError(null);
    const added: Material[] = [];
    const notes: string[] = [];
    for (const file of Array.from(files).slice(0, MAX_MATERIALS - state.materials.length)) {
      try {
        const { text, truncated } = clipMaterial(await extractText(file));
        added.push({ id: newId(), name: file.name, kind: "file", text });
        if (truncated) notes.push(`${file.name} was shortened to its first 30,000 characters.`);
      } catch (e) {
        notes.push(`${file.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setBusy(null);
    if (notes.length) setError(notes.join(" "));
    if (!added.length) return;
    const s = push(
      { ...closeCards(state), materials: [...state.materials, ...added] },
      { id: newId(), role: "user", text: `Shared ${added.length} file${added.length > 1 ? "s" : ""}.`, attachments: added.map((m) => m.name) },
    );
    return analyzeAndFollowUp(s, added.map((m) => m.id));
  }

  /** Add a pasted note, link or repository reference. */
  function addMaterial(kind: Material["kind"], name: string, text: string) {
    if (busy) return;
    if (state.materials.length >= MAX_MATERIALS) return setError(`Up to ${MAX_MATERIALS} materials.`);
    const m: Material = { id: newId(), kind, name: name.slice(0, 200), text: clipMaterial(text).text };
    const label = kind === "note" ? "Shared a note" : kind === "repo" ? "Shared a repository" : "Shared a link";
    const s = push({ ...closeCards(state), materials: [...state.materials, m] }, { id: newId(), role: "user", text: `${label}.`, attachments: [m.name] });
    return analyzeAndFollowUp(s, [m.id]);
  }

  function removeMaterial(id: string) {
    setState((s) => ({ ...s, materials: s.materials.filter((m) => m.id !== id), analyzed: s.analyzed.filter((a) => a !== id) }));
  }

  function buildPlan() {
    if (busy) return;
    const s = { ...closeCards(state), done: true };
    return run("planning", s, async (x) => {
      const res = await requestPlan({
        role: x.role,
        brief: x.brief,
        materials: x.materials,
        answers: x.answers,
        asked: [],
        transcript: transcriptOf(x.messages),
      });
      const drafts = res.plan.customAgents.length + res.plan.customSkills.length;
      return push(
        { ...x, plan: res.plan, planMode: res.mode, accepted: defaultAccepted(res.plan), applied: false },
        {
          id: newId(),
          role: "agent",
          kind: "plan",
          mode: res.mode,
          text:
            res.mode === "ai"
              ? `Your solution blueprint is ready: ${res.plan.milestones.length} milestones, ${drafts} custom agent${drafts === 1 ? "" : "s"} and skills, and ${res.plan.skills.length} reusable skill matches.`
              : "Here's a starter blueprint from the brief. Connect Gemini for milestones and custom agents and skills.",
        },
      );
    });
  }

  /** Manual brief edit: list fields take one item per line. */
  function editBriefField(field: BriefField, value: string) {
    setState((s) => {
      const cur = s.brief[field];
      const next = Array.isArray(cur) ? value.split("\n").map((l) => l.trim()).filter(Boolean) : value;
      return { ...s, brief: { ...s.brief, [field]: next } };
    });
  }

  function toggleAccepted(key: string) {
    setState((s) => ({ ...s, accepted: s.accepted.includes(key) ? s.accepted.filter((k) => k !== key) : [...s.accepted, key] }));
  }

  function editDraft(kind: "agent" | "skill", name: string, body: string) {
    setState((s) => {
      if (!s.plan) return s;
      const plan = structuredClone(s.plan);
      const item = (kind === "agent" ? plan.customAgents : plan.customSkills).find((x) => x.name === name);
      if (item) item.body = body;
      return { ...s, plan };
    });
  }

  const score = completeness(state.brief);
  const openCard = useMemo(
    () => state.messages.findLast((m): m is QuestionsMessage => m.role === "agent" && m.kind === "questions" && !m.submitted) ?? null,
    [state.messages],
  );

  return {
    ...state,
    busy,
    error,
    setError,
    ai,
    score,
    hasContent: score > 0 || state.materials.length > 0 || state.messages.length > 0,
    openCard,
    setRole: (role: IntakeRole) => setState((s) => ({ ...s, role })),
    send,
    submitAnswers,
    setAnswer,
    addFiles,
    addMaterial,
    removeMaterial,
    buildPlan,
    editBriefField,
    toggleAccepted,
    editDraft,
    markApplied: () => setState((s) => ({ ...s, applied: true })),
    reset: () => {
      setState(EMPTY);
      setError(null);
    },
    snapshot: state,
    restore,
  };
}

export type IntakeState = ReturnType<typeof useIntake>;
