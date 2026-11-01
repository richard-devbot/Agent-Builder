/** Shared request handling for the intake route handlers. */

import type { z } from "zod";
import { clientKey, rateLimited } from "./rate-limit";

const MAX_BODY = 400_000;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

/** Rate-limit, size-check and validate a JSON body; returns the data or an error Response. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  const wait = rateLimited(clientKey(req));
  if (wait !== null) return json({ error: `Too many requests. Try again in ${wait}s.` }, 429, { "retry-after": String(wait) });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "Request too large. Remove some materials and retry." }, 413);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json({ error: `Invalid request: ${issue.path.join(".")} ${issue.message}` }, 400);
  }
  return parsed.data;
}
