import type { Metadata } from "next";
import { Cloud, Database, KeyRound, ShieldCheck } from "lucide-react";
import { GoogleCloudConfigPanel } from "@/components/google-cloud-config";
import { PageHeader, StatGrid, type Stat } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Cloud Deploy",
  description:
    "Package grounded Google ADK agents for Cloud Run with Workload Identity Federation and register them in Gemini Enterprise.",
};

const STATS: Stat[] = [
  { icon: KeyRound, label: "Identity", value: "Workload Identity (OIDC)", hint: "Token exchange only. No service-account keys." },
  { icon: Cloud, label: "Runtime", value: "Cloud Run + ADK", hint: "Stateless containers with least-privilege IAM." },
  { icon: Database, label: "Data residency", value: "Regional isolation", hint: "Pick compute and Vertex AI regions per policy." },
  { icon: ShieldCheck, label: "Deploy gate", value: "Two-person review", hint: "Protected GitHub environment before any cloud change." },
];

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Cloud deploy · Google ADK"
        icon={Cloud}
        title="Deploy governed agents to"
        highlight="Google Cloud."
        description="Package a Google ADK agent for Cloud Run with short-lived Workload Identity credentials, then register it in Gemini Enterprise after human sign-off."
      >
        <StatGrid items={STATS} />
      </PageHeader>
      <div className="container-page py-6">
        <GoogleCloudConfigPanel />
      </div>
    </>
  );
}
