"use client";

/**
 * Phase F — "Systems & Connections" panel, enhanced with interactive
 * enterprise system quick-add, Read vs. Read/Write toggles, and 1-click
 * launch into the ADK Connections & Secret Manager Hub.
 * Secret values are NEVER entered in the platform.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  KeyRound,
  Lock,
  PlugZap,
  Plus,
  Server,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { enrichDiscoveryBriefHeuristics } from "@/lib/intake/guided";
import { BlueprintStudio } from "./blueprint-studio";
import type { IntakeState } from "./use-intake";

const QUICK_SYSTEMS = [
  "SAP",
  "ServiceNow",
  "Salesforce",
  "SharePoint",
  "Jira",
  "BigQuery",
  "Workday",
] as const;

export function SystemsConnectionsPanel({ intake }: { intake: IntakeState }) {
  const { brief } = intake;
  const systems = brief.systems ?? [];
  const accessRequests = brief.accessRequests ?? [];
  const nextSteps = brief.nextSteps ?? [];
  const [studioOpen, setStudioOpen] = useState(false);

  const quickAddSystem = (sysName: string) => {
    intake.updateBrief((b) => {
      const nextIntegrations = b.integrations.includes(sysName)
        ? b.integrations
        : [...b.integrations, sysName];
      return enrichDiscoveryBriefHeuristics({
        ...b,
        integrations: nextIntegrations,
      });
    });
  };

  const toggleAccessMode = (sysName: string) => {
    intake.updateBrief((b) => {
      const nextSystems = (b.systems ?? []).map((s) =>
        s.name === sysName
          ? { ...s, access: (s.access === "write" ? "read" : "write") as "read" | "write" }
          : s,
      );
      const anyWrite = nextSystems.some((s) => s.access === "write");
      return {
        ...b,
        systems: nextSystems,
        riskTier: anyWrite ? "medium" : b.riskTier,
      };
    });
  };

  const toggleStatus = (sysName: string) => {
    intake.updateBrief((b) => ({
      ...b,
      systems: (b.systems ?? []).map((s) =>
        s.name === sysName
          ? {
              ...s,
              status: s.status === "known" ? "needs_request" : "known",
            }
          : s,
      ),
    }));
  };

  return (
    <div aria-label="Systems and Connections" className="min-w-0 space-y-4 p-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-foreground">
                Systems &amp; Connections Checklist (No Secrets in Platform)
              </p>
              <p className="leading-relaxed text-muted-foreground">
                Secret values (API keys, client secrets, passwords, service account keys) are{" "}
                <strong className="text-foreground">
                  never entered in Agent Builder, chat, or code
                </strong>
                . Request them from the system owning team so they are stored directly in{" "}
                <strong className="text-foreground">Google Secret Manager</strong> or as a{" "}
                <strong className="text-foreground">GitLab Protected CI variable</strong>.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setStudioOpen(true)}
          >
            <PlugZap className="size-3.5 text-warning" /> Open ADK Connections &amp; Env Hub (
            {intake.liveAdk.envVars.length})
          </Button>
        </div>
      </div>

      {/* Quick-add Enterprise System Bar */}
      <div className="rounded-xl border bg-card/70 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Quick-Add Enterprise Integration &amp; ADK Connector
        </p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SYSTEMS.map((name) => {
            const active = systems.some(
              (s) => s.name.toLowerCase() === name.toLowerCase(),
            );
            return (
              <button
                key={name}
                type="button"
                onClick={() => quickAddSystem(name)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/12 text-primary"
                    : "border-border bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {active ? <CheckCircle2 className="size-3" /> : <Plus className="size-3" />}
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audience & Risk Tier Summary */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-lg border bg-card/80 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="size-3.5" />
            Target Audience
          </div>
          <p className="mt-1 text-xs font-medium capitalize">
            {brief.audience || "My team (default)"}
          </p>
        </div>
        <div className="rounded-lg border bg-card/80 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="size-3.5" />
            Governance Risk Tier
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge
              variant={
                brief.riskTier === "high"
                  ? "destructive"
                  : brief.riskTier === "medium"
                    ? "secondary"
                    : "outline"
              }
              className="text-[10px] uppercase"
            >
              {brief.riskTier || "low"}
            </Badge>
            {brief.riskReason && (
              <span
                className="line-clamp-1 text-[11px] text-muted-foreground"
                title={brief.riskReason}
              >
                {brief.riskReason}
              </span>
            )}
          </div>
        </div>
      </div>

      {systems.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <Server className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-2 text-xs font-semibold">No systems identified yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click any enterprise system pill above or mention the tools your team uses in Discovery chat to generate your connection checklist and ADK connector tools.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {systems.map((sys) => (
            <div
              key={sys.name}
              className="rounded-xl border bg-card p-3.5 shadow-xs transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">{sys.name}</h4>
                    <button
                      type="button"
                      onClick={() => toggleAccessMode(sys.name)}
                      title="Click to toggle Read-Only vs Read/Write mode"
                    >
                      <Badge
                        variant={sys.access === "write" ? "secondary" : "outline"}
                        className="cursor-pointer text-[10px] uppercase"
                      >
                        {sys.access === "write" ? "Read / Write" : "Read-Only"}
                      </Badge>
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{sys.purpose}</p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleStatus(sys.name)}
                  title="Click to toggle connection readiness status"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                    sys.status === "known"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : sys.status === "needs_request"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {sys.status === "known" ? (
                    <CheckCircle2 className="size-3" />
                  ) : sys.status === "needs_request" ? (
                    <Clock className="size-3" />
                  ) : (
                    <HelpCircle className="size-3" />
                  )}
                  {sys.status === "known"
                    ? "Ready"
                    : sys.status === "needs_request"
                      ? "Needs Access Request"
                      : "Unknown"}
                </button>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-1.5 border-t border-border/60 pt-2.5 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Data Accessed &amp; Sensitivity
                  </dt>
                  <dd className="text-foreground">
                    {sys.dataAccessed} ·{" "}
                    <span className="font-medium text-muted-foreground">
                      {sys.dataClassification}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Owning Team
                  </dt>
                  <dd className="text-foreground">{sys.ownerTeam}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Connection Method &amp; Storage Location
                  </dt>
                  <dd className="text-foreground">
                    {sys.connectionMethod} →{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                      {sys.storageLocation}
                    </code>
                  </dd>
                </div>
              </dl>

              {sys.requiredValues.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Checklist of Required Values
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {sys.requiredValues.map((rv) => (
                      <li
                        key={rv.name}
                        className="rounded-lg border border-border/70 bg-muted/25 p-2.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <code className="font-mono text-[11px] font-semibold text-foreground">
                            {rv.name}
                          </code>
                          {rv.isSecret ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                              <KeyRound className="size-2.5" />
                              Secret · Stored in {sys.storageLocation}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Non-secret identifier
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          <strong className="text-foreground">Where to get:</strong>{" "}
                          {rv.whereToGet}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          <strong className="text-foreground">Who provides:</strong>{" "}
                          {rv.whoProvides} — {rv.howToRequest}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {accessRequests.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-3.5">
          <p className="text-xs font-semibold">Suggested Access Requests to Send</p>
          <ul className="space-y-2">
            {accessRequests.map((ar, idx) => (
              <li
                key={`${ar.ownerTeam}-${idx}`}
                className="rounded-lg border bg-muted/20 p-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {ar.item} → <span className="text-primary">{ar.ownerTeam}</span>
                  </span>
                  <CopyButton value={ar.suggestedWording} size="sm" label="Copy request" />
                </div>
                <p className="mt-1 text-[11px] italic text-muted-foreground">
                  &ldquo;{ar.suggestedWording}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextSteps.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <AlertTriangle className="size-3.5" />
            Your Next Steps
          </p>
          <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
            {nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <BlueprintStudio
        project={intake.liveAdk}
        brief={intake.brief}
        open={studioOpen}
        onOpenChange={setStudioOpen}
        onChange={intake.updateAdk}
        initialPane="connections"
      />
    </div>
  );
}
