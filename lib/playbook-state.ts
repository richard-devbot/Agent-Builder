/**
 * Client-side persistence for playbook progress.
 *
 * The site is a GUIDE, not a workspace — it never captures the user's
 * actual outputs (PRDs, user stories, code). The only things stored are:
 *
 *   - Intake values (one-liner about the project + chosen tech stack)
 *   - Step completion progress (where the user is in the journey)
 *
 * Storage layout (localStorage keys):
 *   playbook-{slug}-dod-{n}   → JSON number[] of ticked definition-of-done items
 *   playbook-{slug}-intake    → JSON object {fieldName: value}
 *   playbook-{slug}-progress  → JSON {completed: number[], current: number}
 */

export type IntakeValues = Record<string, string>;

export type Progress = {
  completed: number[];
  current: number;
};

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function intakeKey(slug: string): string {
  return `playbook-${slug}-intake`;
}

function progressKey(slug: string): string {
  return `playbook-${slug}-progress`;
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or unavailable — silently drop */
  }
}

export function getIntake(slug: string): IntakeValues {
  return readJson<IntakeValues>(intakeKey(slug), {});
}

export function setIntake(slug: string, data: IntakeValues): void {
  writeJson(intakeKey(slug), data);
}

export function getProgress(slug: string): Progress {
  const p = readJson<Progress>(progressKey(slug), { completed: [], current: 1 });
  return {
    completed: Array.isArray(p.completed) ? p.completed : [],
    current: typeof p.current === "number" ? p.current : 1,
  };
}

function setProgress(slug: string, p: Progress): void {
  writeJson(progressKey(slug), p);
}

export function markStepComplete(slug: string, step: number): Progress {
  const current = getProgress(slug);
  const completed = current.completed.includes(step)
    ? current.completed
    : [...current.completed, step].sort((a, b) => a - b);
  const next = {
    completed,
    current: Math.max(current.current, step + 1),
  };
  setProgress(slug, next);
  return next;
}

export function setCurrentStep(slug: string, step: number): void {
  const current = getProgress(slug);
  setProgress(slug, { ...current, current: step });
}

export function resetPlaybook(slug: string): void {
  if (!isBrowser()) return;
  // Walk every key in localStorage and remove the ones for this playbook.
  const prefix = `playbook-${slug}-`;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(prefix)) toRemove.push(k);
  }
  for (const k of toRemove) window.localStorage.removeItem(k);
}

/** Definition-of-done ticks per step: playbook-{slug}-dod-{step} → number[] (item indexes). */
function dodKey(slug: string, step: number): string {
  return `playbook-${slug}-dod-${step}`;
}

export function getChecklist(slug: string, step: number): number[] {
  const v = readJson<unknown>(dodKey(slug, step), []);
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
}

export function setChecklist(slug: string, step: number, checked: number[]): void {
  writeJson(dodKey(slug, step), checked);
}
