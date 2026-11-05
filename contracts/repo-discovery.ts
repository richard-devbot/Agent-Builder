/**
 * Shared request/response contract for the repo-discovery service.
 *
 * Imported by BOTH sides of the wire so they cannot drift:
 *   - UI client:      lib/kit/repo-discovery-client.ts
 *   - Route handler:  app/api/gitlab/read-repo/route.ts
 */

import { z } from "zod";

export const RepoDiscoveryRequestSchema = z.object({
  /** GitLab/GitHub repository URL or group/project path */
  repoUrl: z.string().min(3).max(500),
  /** Optional branch/ref (default: the repo's default branch). */
  ref: z.string().max(200).optional(),
  /**
   * Optional access token supplied by the user for this request only.
   * Never stored client-side.
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
