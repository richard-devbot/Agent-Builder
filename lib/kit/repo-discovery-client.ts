/**
 * Client for the repo-discovery Lambda (backend/repo-discovery).
 *
 * The endpoint is injected at build time via NEXT_PUBLIC_REPO_DISCOVERY_API.
 * When unset the feature is shown disabled and the site stays fully static.
 */

import {
  RepoDiscoveryResponseSchema,
  type RepoDiscoveryRequest,
  type RepoDiscoveryResponse,
} from "@/contracts/repo-discovery";

export type { RepoDiscoveryRequest };
export type RepoDiscovery = RepoDiscoveryResponse["discovery"];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const ENV = process.env.NEXT_PUBLIC_ENV ?? "dev";

export const REPO_DISCOVERY_API =
  process.env.NEXT_PUBLIC_REPO_DISCOVERY_API ??
  (API_BASE ? `${API_BASE.replace(/\/$/, "")}/${ENV}/repo-discovery` : "");

export async function discoverRepo(
  req: RepoDiscoveryRequest,
): Promise<RepoDiscovery> {
  const res = await fetch(REPO_DISCOVERY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return RepoDiscoveryResponseSchema.parse(await res.json()).discovery;
}
