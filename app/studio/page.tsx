import type { Metadata } from "next";
import { KitBuilder } from "@/components/kit-builder";
import { getKitSkills } from "@/lib/kit/skills";
import { getKitMcpServers } from "@/lib/kit/mcp-servers";

export const metadata: Metadata = {
  title: "Kit Studio",
  description:
    "Configure a governed agent kit (rules, skills, agents, hooks and MCP servers) for your AI coding assistant.",
};

export default async function StudioPage() {
  const [skills, mcpServers] = await Promise.all([getKitSkills(), getKitMcpServers()]);
  return <KitBuilder skills={skills} mcpServers={mcpServers} />;
}
