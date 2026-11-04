"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CloudUpload,
  Database,
  PackageCheck,
  Sparkles,
} from "lucide-react";
import {
  loadDeploymentRegistry,
  loadKitStudioSnapshot,
  loadLastPushRecord,
} from "@/lib/storage";

interface WorkspaceMetrics {
  kitsConfigured: number;
  standardsSelected: number;
  gitlabPushes: number;
  registryEntriesCount: number;
  lastUpdatedAt: string | null;
}

function readWorkspaceMetrics(): WorkspaceMetrics {
  const snapshot = loadKitStudioSnapshot<{
    standardTemplateSel?: string[];
    projectName?: string;
    tech?: string[];
  }>();
  const push = loadLastPushRecord();
  const registry = loadDeploymentRegistry();

  const kitsConfigured =
    snapshot && (snapshot.projectName || (snapshot.tech?.length ?? 0) > 0)
      ? 1
      : 0;
  const standardsSelected = snapshot?.standardTemplateSel?.length ?? 26;
  const gitlabPushes = push ? 1 : 0;
  const registryEntriesCount = registry.length;
  const lastUpdatedAt =
    registry[0]?.deployedAt ?? push?.pushedAt ?? null;

  return {
    kitsConfigured,
    standardsSelected,
    gitlabPushes,
    registryEntriesCount,
    lastUpdatedAt,
  };
}

export function InsightsPanel() {
  const [metrics, setMetrics] = useState<WorkspaceMetrics>(() =>
    readWorkspaceMetrics(),
  );

  useEffect(() => {
    const onFocus = () => setMetrics(readWorkspaceMetrics());
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, []);

  const items = [
    {
      label: "Governed Kits Configured",
      value: metrics.kitsConfigured,
      icon: PackageCheck,
      href: "/studio",
      hint: "Antigravity + ADK bundles",
    },
    {
      label: "Active Engineering Standards",
      value: metrics.standardsSelected,
      icon: Sparkles,
      href: "/studio",
      hint: "10-category standards catalog",
    },
    {
      label: "GitLab Repository Pushes",
      value: metrics.gitlabPushes,
      icon: CloudUpload,
      href: "/studio",
      hint: "Agent Engine WIF & GitLab CI",
    },
    {
      label: "Registered Agent Engines",
      value: metrics.registryEntriesCount,
      icon: Database,
      href: "/studio",
      hint: "19-digit Reasoning Engine IDs",
    },
  ];

  return (
    <section
      aria-label="Local workspace telemetry and insights"
      className="container-page pt-6"
    >
      <div className="rounded-2xl border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Platform Insights
              </h2>
              <p className="text-xs text-muted-foreground">
                Browser-local workspace telemetry (
                <code className="font-mono">lib/storage/</code> repository)
              </p>
            </div>
          </div>
          {metrics.lastUpdatedAt && (
            <span className="font-mono text-[11px] text-muted-foreground">
              Last activity:{" "}
              {new Date(metrics.lastUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="group flex flex-col justify-between rounded-xl border bg-muted/30 p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="flex size-6 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors group-hover:text-primary">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
                    {item.value}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground group-hover:text-primary">
                    {item.hint}
                    <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
