"use client";

import { useState } from "react";
import { Cloud, Download, FileCode2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { buildGoogleCloudKit, defaultGoogleCloudConfig, googleCloudSchema, missingGoogleSetup, type GoogleCloudConfig } from "@/lib/kit/google-cloud";
import { createZip } from "@/lib/kit/zip";
import { cn } from "@/lib/utils";

const fields: { key: keyof GoogleCloudConfig; label: string; placeholder: string; hint: string }[] = [
  { key: "projectId", label: "Google Cloud project ID", placeholder: "my-agent-project", hint: "Optional for drafts. Use the project ID, not its display name or number." },
  { key: "region", label: "Region", placeholder: "us-central1", hint: "Confirm model and service availability before deployment." },
  { key: "agentName", label: "Agent name", placeholder: "sdlc_agent", hint: "Python package name: lowercase letters, numbers and underscores." },
  { key: "model", label: "Gemini model ID", placeholder: "gemini-2.5-flash", hint: "Editable model ID; availability and quota are not checked." },
  { key: "repository", label: "GitHub repository", placeholder: "organization/repository", hint: "Optional for drafts. Enter owner/repository, without a URL." },
  { key: "workloadIdentityProvider", label: "Workload Identity provider", placeholder: "projects/123456789012/locations/global/workloadIdentityPools/github/providers/github", hint: "Optional for drafts. Full resource name; uses a project number." },
  { key: "serviceAccount", label: "CI service account", placeholder: "github-deploy@my-agent-project.iam.gserviceaccount.com", hint: "Optional for drafts. Identity email only — never paste credentials or keys." },
];

export function GoogleCloudConfigPanel() {
  const [config, setConfig] = useState<GoogleCloudConfig>(defaultGoogleCloudConfig);
  const [selectedPath, setSelectedPath] = useState("README.md");
  const result = googleCloudSchema.safeParse(config);
  const files = result.success ? buildGoogleCloudKit(result.data) : [];
  const selected = files.find((file) => file.path === selectedPath) ?? files[0];
  const missing = missingGoogleSetup(config);

  function download() {
    try {
      const archive = createZip(buildGoogleCloudKit(config));
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = "google-adk-integration-kit.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Kit exported. Cloud setup remains unverified.");
    } catch {
      toast.error("Export failed. Check the configuration fields and try again.");
    }
  }

  const filledCount = fields.length - missing.length;
  return (
    <div className="space-y-5">
      {/* Draft status + deployment gates */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section aria-label="Integration status" className="flex flex-col rounded-xl border border-warning/30 bg-warning/6 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-warning">
              <Cloud className="size-4" aria-hidden /> Pre-flight draft
            </span>
            <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[10.5px] font-medium text-warning">
              No credentials needed
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Nothing here provisions infrastructure, incurs cost or calls external endpoints.
          </p>
          <div className="mt-auto pt-3">
            <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>Identifiers provided</span>
              <span className="tabular-nums">{filledCount}/{fields.length}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-warning transition-[width] duration-500 ease-out"
                style={{ width: `${(filledCount / fields.length) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground" role="status">
              {missing.length
                ? `Pending: ${fields
                    .filter((field) => missing.includes(field.key))
                    .map((field) => field.label)
                    .join(", ")}.`
                : "All identifiers set. Awaiting admin approval and WIF setup."}
            </p>
          </div>
        </section>

        <section aria-label="Deployment pipeline preview" className="surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="eyebrow">Deployment gates</span>
            <span className="text-[11px] text-muted-foreground">Enforced by GitHub Environments</span>
          </div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {GATES.map((g, i) => (
              <li
                key={g.title}
                style={{ "--i": i } as React.CSSProperties}
                className="stagger relative animate-fade-up rounded-lg border bg-background/40 p-3"
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <p className="mt-2 text-[13px] font-semibold">{g.title}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{g.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Configuration inputs & live file preview */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(360px,1fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="google-config-heading" className="surface p-5 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <h2 id="google-config-heading" className="text-[15px] font-semibold">
              Deployment parameters
            </h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">Safe to edit</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Target project, identity federation and runtime defaults.
          </p>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {fields.map(({ key, label, placeholder, hint }) => {
              const error = result.error?.issues.find((issue) => issue.path[0] === key)?.message;
              const wide = key === "workloadIdentityProvider" || key === "serviceAccount";
              return (
                <div key={key} className={cn("space-y-1", wide && "sm:col-span-2 lg:col-span-1 xl:col-span-2")}>
                  <label htmlFor={`google-${key}`} className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </label>
                  <Input
                    id={`google-${key}`}
                    value={config[key]}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 font-mono text-[13px]"
                    aria-invalid={Boolean(error)}
                    aria-describedby={`google-${key}-hint${error ? ` google-${key}-error` : ""}`}
                    onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  <p id={`google-${key}-hint`} className="text-[11px] leading-relaxed text-muted-foreground">
                    {hint}
                  </p>
                  {error && (
                    <p id={`google-${key}-error`} className="animate-fade-in text-xs text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <Button type="button" className="mt-5 w-full" onClick={download} disabled={!result.success}>
            <Download className="size-4" aria-hidden /> Export {missing.length ? "draft " : ""}deployment kit (.zip)
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            ADK Python agent, contract tests, GEMINI.md and a GitHub Actions workflow.
          </p>
        </section>

        <section aria-labelledby="google-preview-heading" className="surface min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-primary/8 to-transparent p-3">
            <h2 id="google-preview-heading" className="flex items-center gap-2 text-sm font-semibold">
              <FileCode2 className="size-4 text-primary" aria-hidden /> Package preview
            </h2>
            <label htmlFor="google-preview-file" className="sr-only">
              Inspect generated file
            </label>
            <select
              id="google-preview-file"
              className="ml-auto h-8 min-w-0 max-w-full flex-1 rounded-md border bg-background px-2 font-mono text-xs sm:max-w-xs"
              value={selected?.path ?? ""}
              onChange={(event) => setSelectedPath(event.target.value)}
              disabled={!files.length}
            >
              {!files.length && <option value="">Fix invalid fields to preview</option>}
              {files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
            {selected && <CopyButton value={selected.contents} label="Copy" size="sm" variant="outline" />}
          </div>
          <pre
            key={selected?.path}
            tabIndex={0}
            aria-label={selected ? `Contents of ${selected.path}` : "Preview unavailable"}
            className="max-h-[640px] min-h-72 animate-fade-in overflow-auto p-4 font-mono text-xs leading-relaxed"
          >
            <code>
              {selected?.contents ??
                "Correct the highlighted fields to generate a fresh preview. Your draft values are kept."}
            </code>
          </pre>
        </section>
      </div>

      {/* Next steps */}
      <section className="surface p-4" aria-labelledby="google-next-heading">
        <h2 id="google-next-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden /> After export
        </h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-3">
          {NEXT_STEPS.map((n, i) => (
            <li key={n.title} className="rounded-lg border bg-background/40 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">
                {i + 1}. {n.title}
              </p>
              <p className="mt-1 leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const GATES = [
  { title: "CI test & lint", body: "Unit tests and syntax checks. No network or model calls." },
  { title: "Reviewer sign-off", body: "Manual approval from the protected environment's reviewers." },
  { title: "OIDC token exchange", body: "Short-lived credentials via GitHub Workload Identity." },
  { title: "Operator deploy", body: "Operator ships to Cloud Run and links Gemini Enterprise." },
] as const;

const NEXT_STEPS = [
  { title: "Review the package", body: "Audit the Python starter, contract tests and workflow. Tests run without model calls or billing." },
  { title: "Bind IAM & WIF", body: "A Google Cloud admin grants roles/iam.workloadIdentityUser to your repository claim. No JSON keys." },
  { title: "Enrol in Gemini Enterprise", body: "Verify the Cloud Run endpoint, run an authenticated smoke test, then submit agent metadata." },
] as const;
