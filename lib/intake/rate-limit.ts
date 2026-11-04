/**
 * Per-user sliding-window limit for API routes, keyed by Microsoft Entra ID
 * user `oid` so no single user can exhaust the shared Vertex AI quota.
 * In-memory: suitable for single-instance POC; move to a shared store if scaled out.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_CALLS = 40;
const hits = new Map<string, number[]>();

/** Keys rate limit buckets by authenticated Entra user `oid` (never IP). */
export function clientKey(_req: Request, oid?: string): string {
  const trimmed = oid?.trim();
  if (!trimmed) {
    throw new Error("Rate limiter requires an authenticated user oid.");
  }
  return `oid:${trimmed}`;
}

/** Returns seconds to wait when over the limit, otherwise null (and records the call). */
export function rateLimited(key: string, now = Date.now()): number | null {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    hits.set(key, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  return null;
}
