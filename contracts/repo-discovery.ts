/**
 * Shared request/response contract for the repo-discovery Lambda.
 *
 * Imported by BOTH sides of the wire so they cannot drift:
 *   - UI client:      lib/kit/repo-discovery-client.ts (future)
 *   - Lambda handler: backend/repo-discovery/index.ts
 */

import { z } from "zod";

export const RepoDiscoveryRequestSchema = z.object({
  /** Public GitHub repository URL, e.g. https://github.com/org/repo */
  repoUrl: z.string().url().max(500),
  /** Optional branch/ref (default: the repo's default branch). */
  ref: z.string().max(200).optional(),
  /**
   * Optional GitHub access token supplied by the user for this request only
   * (private repos / rate limits). Never stored server-side or client-side.
   */
  githubToken: z.string().min(1).max(300).optional(),
});

export const RepoDiscoveryResponseSchema = z.object({
  discovery: z.object({
    /** project-context.md content: overview, stack, architecture, build/run. */
    projectContextMarkdown: z.string().min(1),
    /** Technology ids to pre-select in the wizard (matched client-side). */
    suggestedTechnologies: z.array(z.string().min(1)).max(50),
    /** One-paragraph summary of the repository. */
    summary: z.string().min(1),
  }),
});

export type RepoDiscoveryRequest = z.infer<typeof RepoDiscoveryRequestSchema>;
export type RepoDiscoveryResponse = z.infer<typeof RepoDiscoveryResponseSchema>;
