"use client";

/**
 * "Analyze a GitHub repo" panel (discovery step) — sends a repo URL to the
 * repo-discovery Lambda; the result pre-selects suggested technologies and
 * adds project-context.md to the kit.
 *
 * Private repos: the user can supply their own GitHub token for the session.
 * It lives only in component state (never localStorage or the kit) and is
 * sent with the analyze request, so each user works with their own access.
 * Shown disabled when NEXT_PUBLIC_REPO_DISCOVERY_API is not configured.
 */

import { useState } from "react";
import { GitBranch, KeyRound, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { discoverRepo, type RepoDiscovery } from "@/lib/kit/repo-discovery-client";

export function RepoDiscoveryPanel({
  discovery,
  onDiscovered,
  disabled = false,
}: {
  discovery: RepoDiscovery | null;
  onDiscovered: (d: RepoDiscovery | null) => void;
  disabled?: boolean;
}) {
  const [repoUrl, setRepoUrl] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      onDiscovered(
        await discoverRepo({
          repoUrl: repoUrl.trim(),
          ...(githubToken.trim() ? { githubToken: githubToken.trim() } : {}),
        }),
      );
      setRepoUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repository analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="surface gap-0 p-4 ring-0">
      <div className="mb-2 flex items-center gap-2">
        <GitBranch className="size-4 text-primary" />
        <span className="text-sm font-semibold">Analyze a GitHub repo</span>
        <Badge variant="secondary" className="text-[11px]">
          Beta
        </Badge>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
        Point at a GitHub repository and we&apos;ll analyze its stack,
        pre-select matching technologies, and add a project-context.md to your
        kit. Public repos need no credentials.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="e.g. https://git.example.org/my-team-agent"
          className="h-8 max-w-sm text-[13px]"
          disabled={disabled || loading}
        />
        <Button
          type="button"
          size="sm"
          onClick={analyze}
          disabled={disabled || !repoUrl.trim() || loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Search className="size-3.5" /> Analyze
            </>
          )}
        </Button>
      </div>

      {!disabled && (
        <div className="mt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowToken((v) => !v)}
          >
            <KeyRound className="size-3" />
            {showToken ? "Hide access token" : "Private repo? Add a temporary access token"}
          </button>
          {showToken && (
            <div className="mt-2 max-w-sm">
              <Input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="GitHub fine-grained token (read-only Contents)"
                className="h-8 text-[13px]"
                autoComplete="off"
                disabled={loading}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Used only for this analysis and kept in memory for this tab —
                never saved, never added to your kit. Use a fine-grained token
                with read-only Contents access and revoke it anytime.
              </p>
            </div>
          )}
        </div>
      )}

      {disabled && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-warning" aria-hidden />
          Requires the repo-discovery service. Not connected in this environment.
        </p>
      )}

      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}

      {discovery && (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">
              project-context.md added to your kit
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {discovery.summary}
            </p>
            {discovery.suggestedTechnologies.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Suggested stack: {discovery.suggestedTechnologies.join(", ")}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDiscovered(null)}
            aria-label="Remove repo analysis"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </Card>
  );
}
