/**
 * Per-client sliding-window limit for the intake routes, so a public
 * deployment can't burn through the Gemini quota. In-memory: fine for the
 * single App Service instance; move to a shared store if the app scales out.
 */

const WINDOW_MS = 10 * 60_000;
const MAX_CALLS = 40;
const hits = new Map<string, number[]>();

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
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
