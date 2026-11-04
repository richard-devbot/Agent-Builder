import type { Metadata } from "next";
import { Cloud, GitBranch, KeyRound, ShieldCheck } from "lucide-react";
import { StepDeploymentSetup } from "@/components/kit-builder/step-deployment-setup";
import { PageHeader, StatGrid, type Stat } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Deployment Setup",
  description:
    "Connect GitLab via OAuth 2.0 + PKCE and configure your Google Cloud deployment environment and target runtime.",
};

const STATS: Stat[] = [
  { icon: GitBranch, label: "CI Target", value: "GitLab CI Only", hint: "Governed .gitlab-ci.yml pipeline with Semgrep & Gitleaks." },
  { icon: KeyRound, label: "Identity", value: "Workload Identity (OIDC)", hint: "GitLab OIDC token exchange. Zero static GCP keys." },
  { icon: Cloud, label: "Runtimes", value: "Agent Engine · Cloud Run · GE", hint: "Deploy to Vertex AI Agent Engine, Cloud Run, or Gemini Enterprise." },
  { icon: ShieldCheck, label: "Release Gate", value: "Protected Release Tags", hint: "Deployments run only from immutable release tags." },
];

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Step 5 · Deployment Setup"
        icon={GitBranch}
        title="Configure GitLab &amp;"
        highlight="Google Cloud."
        description="Connect your corporate GitLab account via OAuth 2.0 + PKCE, validate your repository and Python agent folder slug, and select your target Google Cloud environment."
      >
        <StatGrid items={STATS} />
      </PageHeader>
      <div className="container-page @container py-6">
        <StepDeploymentSetup standalone />
      </div>
    </>
  );
}
