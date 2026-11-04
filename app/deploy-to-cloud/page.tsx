import type { Metadata } from "next";
import { Cloud, GitCommit, KeyRound, Rocket, ShieldCheck } from "lucide-react";
import { StepDeployToCloud } from "@/components/kit-builder/step-deploy-to-cloud";
import { PageHeader, StatGrid, type Stat } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Deploy to Cloud",
  description:
    "Select a verified GitLab commit, create a release tag, and trigger a keyless Workload Identity Federation deployment pipeline to Vertex AI Agent Engine, Cloud Run, or Gemini Enterprise.",
};

const STATS: Stat[] = [
  { icon: GitCommit, label: "Reproducible", value: "Release Tags", hint: "Tags v<yyyymmdd-hhmm>-<shortsha> before triggering CI." },
  { icon: KeyRound, label: "Zero Keys", value: "GitLab OIDC → WIF", hint: "Platform holds no GCP credentials; CI impersonates deployer SA." },
  { icon: Rocket, label: "Targets", value: "Agent Engine · Cloud Run · GE", hint: "Automated deployment and Gemini Enterprise registration." },
  { icon: ShieldCheck, label: "Registry", value: "19-Digit RESOURCE_ID", hint: "Verified deployment-record.json saved to local Registry." },
];

export default function DeployToCloudPage() {
  return (
    <>
      <PageHeader
        eyebrow="Step 7 · Deploy to Cloud"
        icon={Cloud}
        title="Tag release &amp; deploy to"
        highlight="Google Cloud."
        description="Pick a commit from your GitLab repository, create a protected release tag, and monitor the live GitLab CI deployment pipeline."
      >
        <StatGrid items={STATS} />
      </PageHeader>
      <div className="container-page @container py-6">
        <StepDeployToCloud standalone />
      </div>
    </>
  );
}
