/**
 * MCP token setup helpers for downloaded kits.
 *
 * Generates two files included in every kit that has MCP servers selected:
 *   - SETUP.md   — human-readable guide with env vars, token generation links,
 *                  and shell export commands
 *   - setup-mcp.sh — interactive bash script that prompts for each token and
 *                    writes exports to the user's shell profile
 */

import type { KitMcpServer } from "./mcp-servers";

/** Token generation URLs and setup hints per MCP server slug. */
const TOKEN_INFO: Record<
  string,
  { url: string; label: string; notes?: string }
> = {
  "jira-mcp": {
    url: "https://id.atlassian.com/manage-profile/security/api-tokens",
    label: "Atlassian API Tokens",
    notes: 'Click "Create API token", name it "Claude Code MCP", copy immediately.',
  },
  "confluence-mcp": {
    url: "https://id.atlassian.com/manage-profile/security/api-tokens",
    label: "Atlassian API Tokens",
    notes: "Same token works for both Jira and Confluence if on the same Atlassian instance.",
  },
  "figma-mcp": {
    url: "https://www.figma.com/developers/api#access-tokens",
    label: "Figma Personal Access Tokens",
    notes: "Scopes needed: File content (Read), Variables (Read), Library content (Read).",
  },
  "github-mcp": {
    url: "https://github.com/settings/tokens",
    label: "GitHub Personal Access Tokens",
    notes: "Classic PAT with `repo`, `read:org` scopes. Or use a fine-grained token.",
  },
  "azure-devops-mcp": {
    url: "https://dev.azure.com/{org}/_usersSettings/tokens",
    label: "Azure DevOps Personal Access Tokens",
    notes: "Replace {org} with your org name. Scopes: Work Items (Read & Write), Code (Read).",
  },
  "postgres-mcp": {
    url: "",
    label: "Postgres connection string",
    notes: "Format: postgresql://user:password@host:5432/dbname. Use a read-only dev database.",
  },
  "playwright-mcp": {
    url: "",
    label: "No external token required",
    notes: "Configuration values only (headless mode, browser choice, base URL).",
  },
  "filesystem-mcp": {
    url: "",
    label: "No token required",
    notes: "This server needs no credentials — it uses the local filesystem.",
  },
};

/** Generate SETUP.md content for the selected MCP servers. */
export function buildSetupMd(servers: KitMcpServer[]): string {
  const serversWithEnvVars = servers.filter((s) => s.envVars.length > 0);

  const lines: string[] = [
    "# MCP Server Setup Guide",
    "",
    "Your kit includes MCP (Model Context Protocol) server configurations that",
    "connect your AI coding assistant to external tools. Before they work, you",
    "need to set the required environment variables.",
    "",
    "## Quick Start",
    "",
    "**Option A — Interactive script (recommended):**",
    "",
    "```bash",
    "chmod +x setup-mcp.sh",
    "./setup-mcp.sh",
    "```",
    "",
    "**Option B — Manual setup:**",
    "",
    "Follow the steps below for each server you want to configure.",
    "",
    "---",
    "",
  ];

  // Summary table
  lines.push("## Required Environment Variables", "", "| Server | Variable | Secret | Description |", "|--------|----------|--------|-------------|");
  for (const server of servers) {
    for (const v of server.envVars) {
      lines.push(
        `| ${server.name} | \`${v.name}\` | ${v.secret ? "Yes" : "No"} | ${v.description} |`,
      );
    }
  }
  lines.push("", "---", "");

  // Per-server sections
  for (const server of serversWithEnvVars) {
    const info = TOKEN_INFO[server.slug];
    lines.push(`## ${server.name}`, "");

    if (info?.url) {
      lines.push(`**Generate credentials:** [${info.label}](${info.url})`, "");
    }
    if (info?.notes) {
      lines.push(`> ${info.notes}`, "");
    }

    lines.push("### Environment variables", "");
    lines.push("Add these to your shell profile (`~/.zshrc` or `~/.bashrc`):", "");
    lines.push("```bash");
    for (const v of server.envVars) {
      const example = v.example ?? (v.secret ? "your-token-here" : "value");
      lines.push(`export ${v.name}="${example}"`);
    }
    lines.push("```", "");

    // Variable descriptions
    for (const v of server.envVars) {
      const marker = v.secret ? " 🔑" : "";
      lines.push(`- **\`${v.name}\`**${marker} — ${v.description}`);
    }
    lines.push("", "---", "");
  }

  // Servers with no env vars
  const noEnvServers = servers.filter((s) => s.envVars.length === 0);
  if (noEnvServers.length > 0) {
    lines.push("## Servers requiring no credentials", "");
    for (const server of noEnvServers) {
      const info = TOKEN_INFO[server.slug];
      lines.push(`- **${server.name}** — ${info?.notes ?? "Ready to use out of the box."}`);
    }
    lines.push("", "---", "");
  }

  // Footer
  lines.push(
    "## After Setup",
    "",
    "1. Reload your shell: `source ~/.zshrc` (or `source ~/.bashrc`)",
    "2. Restart your IDE (Claude Code, Copilot, or Cursor)",
    "3. The MCP servers will start automatically using the config files in this kit",
    "",
    "## Troubleshooting",
    "",
    "- **Server fails to start:** Check that all required env vars are set (`echo $VAR_NAME`)",
    "- **401 / Unauthorized:** Token is wrong, expired, or lacks required scopes",
    "- **403 / Forbidden:** Your account may not have permission for the resource",
    "- **Connection refused:** For Postgres, verify the host is reachable and credentials are correct",
    "",
    "## Security Best Practices",
    "",
    "- Never commit tokens to version control",
    "- Rotate tokens every 90 days",
    "- Use the minimum scopes needed",
    "- For team/CI use, prefer service accounts over personal tokens",
    "- Keep `setup-mcp.sh` out of version control (it may contain token values in shell history)",
    "",
  );

  return lines.join("\n");
}

/** Generate setup-mcp.sh script for the selected MCP servers. */
export function buildSetupScript(servers: KitMcpServer[]): string {
  const serversWithEnvVars = servers.filter((s) => s.envVars.length > 0);

  const lines: string[] = [
    "#!/usr/bin/env bash",
    "#",
    "# MCP Server Token Setup Script",
    "# Generated by Agent Builder",
    "#",
    "# This script prompts for each required environment variable and writes",
    "# the exports to your shell profile. Run it once after downloading the kit.",
    "#",
    'set -euo pipefail',
    "",
    "# ── Helpers ──────────────────────────────────────────────────────────────────",
    "",
    'GREEN="\\033[0;32m"',
    'YELLOW="\\033[0;33m"',
    'CYAN="\\033[0;36m"',
    'RESET="\\033[0m"',
    "",
    "info()  { printf \"${CYAN}%s${RESET}\\n\" \"$1\"; }",
    "warn()  { printf \"${YELLOW}%s${RESET}\\n\" \"$1\"; }",
    "ok()    { printf \"${GREEN}%s${RESET}\\n\" \"$1\"; }",
    "",
    "# Detect shell profile",
    'if [[ -f "$HOME/.zshrc" ]]; then',
    '  PROFILE="$HOME/.zshrc"',
    'elif [[ -f "$HOME/.bashrc" ]]; then',
    '  PROFILE="$HOME/.bashrc"',
    "else",
    '  PROFILE="$HOME/.profile"',
    "fi",
    "",
    'info "MCP Server Token Setup"',
    'info "━━━━━━━━━━━━━━━━━━━━━━━━"',
    "echo",
    'info "Detected shell profile: $PROFILE"',
    'info "Tokens will be appended as export statements."',
    "echo",
    "",
    "# Track which vars were set",
    "VARS_SET=0",
    "",
    "# ── Prompt function ─────────────────────────────────────────────────────────",
    "",
    "prompt_var() {",
    '  local var_name="$1"',
    '  local description="$2"',
    '  local example="${3:-}"',
    '  local is_secret="${4:-false}"',
    "",
    "  # Skip if already set in environment",
    '  if [[ -n "${!var_name:-}" ]]; then',
    '    ok "  ✓ $var_name already set (skipping)"',
    "    return 0",
    "  fi",
    "",
    "  echo",
    '  info "  $var_name"',
    '  echo "    $description"',
    '  if [[ -n "$example" ]]; then',
    '    echo "    Example: $example"',
    "  fi",
    "",
    '  if [[ "$is_secret" == "true" ]]; then',
    '    printf "    Enter value (hidden): "',
    "    read -rs value",
    "    echo",
    "  else",
    '    printf "    Enter value: "',
    "    read -r value",
    "  fi",
    "",
    '  if [[ -z "$value" ]]; then',
    '    warn "  ⚠ Skipped (no value entered)"',
    "    return 0",
    "  fi",
    "",
    "  # Append to shell profile",
    '  echo "export ${var_name}=\"${value}\"" >> "$PROFILE"',
    "  VARS_SET=$((VARS_SET + 1))",
    '  ok "  ✓ $var_name saved to $PROFILE"',
    "}",
    "",
    "# ── Server prompts ─────────────────────────────────────────────────────────",
    "",
  ];

  for (const server of serversWithEnvVars) {
    const info = TOKEN_INFO[server.slug];
    lines.push(`# --- ${server.name} ---`);
    lines.push(`info "\\n${server.name}"`);
    if (info?.url) {
      lines.push(`echo "  Generate token: ${info.url}"`);
    }
    if (info?.notes) {
      lines.push(`echo "  ${info.notes}"`);
    }
    lines.push("");
    for (const v of server.envVars) {
      const example = v.example ?? "";
      lines.push(
        `prompt_var "${v.name}" "${v.description}" "${example}" "${v.secret ? "true" : "false"}"`,
      );
    }
    lines.push("");
  }

  lines.push(
    "# ── Done ───────────────────────────────────────────────────────────────────",
    "",
    "echo",
    'if [[ $VARS_SET -gt 0 ]]; then',
    '  ok "Done! $VARS_SET variable(s) written to $PROFILE."',
    "  echo",
    '  info "Next steps:"',
    '  echo "  1. Reload your shell:  source $PROFILE"',
    '  echo "  2. Restart your IDE"',
    '  echo "  3. MCP servers will connect automatically"',
    "else",
    '  info "No new variables were set. All env vars are already configured or were skipped."',
    "fi",
    "",
  );

  return lines.join("\n");
}
