/**
 * MCP server loader for the Kit Builder.
 *
 * MCP configs live as curated MDX under content/mcp-configs/. Each config
 * defines the server name, required env vars, and the JSON block for the
 * target tool's config file. This module reads those at build time and
 * projects them into the `KitMcpServer` shape the assembler consumes:
 *   - Claude Code  -> .claude/mcp.json (merged mcpServers object)
 *   - Copilot      -> .github/copilot-mcp.json
 *   - Cursor       -> .cursor/mcp.json
 *
 * `recommendedFor` maps a server to technology ids so the builder can
 * auto-select it. "always" = recommended on every kit.
 */

import { getAssetsByType } from "../content";

export type McpEnvVar = {
  name: string;
  description: string;
  example?: string;
  secret: boolean;
};

export type KitMcpServer = {
  /** Asset slug (stable id used in the picker). */
  slug: string;
  /** Human title. */
  name: string;
  /** The MCP server name used in the JSON config key. */
  serverName: string;
  description: string;
  /** Tech ids that auto-recommend this server; "always" = every kit. */
  recommendedFor: string[];
  /** Environment variables needed by this server. */
  envVars: McpEnvVar[];
  /** The JSON config block extracted from the MDX body. */
  serverConfig: McpServerConfig;
};

export type McpServerConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

/**
 * Maps an MCP config slug to the technology ids that should auto-recommend it.
 */
const RECOMMENDED_FOR: Record<string, string[]> = {
  "azure-devops-mcp": ["azure-devops"],
  "github-mcp": ["github-actions"],
  "figma-mcp": ["react", "nextjs", "angular", "vue", "tailwind"],
  "jira-mcp": ["always"],
  "confluence-mcp": ["always"],
  "playwright-mcp": ["playwright"],
  "postgres-mcp": ["postgres"],
  "filesystem-mcp": ["always"],
};

/**
 * Extract the first mcpServers JSON block from an MDX body.
 * Returns the inner config for the first server entry.
 */
function extractServerConfig(body: string, serverName: string): McpServerConfig {
  // Try to find the first full JSON block containing "mcpServers"
  const jsonMatch = body.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.mcpServers && parsed.mcpServers[serverName]) {
        const cfg = parsed.mcpServers[serverName];
        return {
          command: cfg.command ?? "npx",
          args: cfg.args ?? [],
          ...(cfg.env && Object.keys(cfg.env).length > 0 ? { env: cfg.env } : {}),
        };
      }
      // If the serverName doesn't match, take the first entry
      const firstKey = Object.keys(parsed.mcpServers ?? {})[0];
      if (firstKey && parsed.mcpServers[firstKey]) {
        const cfg = parsed.mcpServers[firstKey];
        return {
          command: cfg.command ?? "npx",
          args: cfg.args ?? [],
          ...(cfg.env && Object.keys(cfg.env).length > 0 ? { env: cfg.env } : {}),
        };
      }
    } catch {
      // Fall through to default
    }
  }

  // Fallback: return a placeholder config
  return { command: "npx", args: ["-y", `@your-org/${serverName}-mcp`] };
}

/**
 * Load all MCP configs as KitMcpServer records. Server-only (reads the
 * filesystem via lib/content).
 */
export async function getKitMcpServers(): Promise<KitMcpServer[]> {
  const configs = await getAssetsByType("mcp-config");

  const servers: KitMcpServer[] = [];
  for (const asset of configs) {
    if (asset.type !== "mcp-config") continue;
    const serverConfig = extractServerConfig(asset.body, asset.serverName);
    servers.push({
      slug: asset.slug,
      name: asset.title,
      serverName: asset.serverName,
      description: asset.description,
      recommendedFor: RECOMMENDED_FOR[asset.slug] ?? [],
      envVars: asset.envVars.map((v) => ({
        name: v.name,
        description: v.description,
        example: v.example,
        secret: v.secret,
      })),
      serverConfig,
    });
  }
  return servers.sort((a, b) => a.name.localeCompare(b.name));
}
