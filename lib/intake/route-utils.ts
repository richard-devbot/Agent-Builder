/** Shared request handling for the intake route handlers. */

import type { z } from "zod";
import { auth, type Session } from "@/auth";
import { clientKey, rateLimited } from "./rate-limit";

const MAX_BODY = 400_000;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function requireApiSession(): Promise<Session | Response> {
  const session = await auth();
  if (!session?.user?.oid) {
    return json({ error: "Authentication required. Sign in with Microsoft Entra ID." }, 401);
  }
  return session;
}

/** Authenticate, rate-limit by user oid, size-check and validate a JSON body. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;
  const wait = rateLimited(clientKey(req, sessionOrRes.user.oid));
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
