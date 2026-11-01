# Agent Builder

A curated library of reusable prompts, skills, templates, and workflows for **spec-driven development** across the organisation. Inspired by [21st.dev](https://21st.dev), built for the full software development lifecycle.

## What is this?

A public website where developers can browse, copy, and use battle-tested AI prompts and skills across every phase of building software — from user stories to deployment. Think of it as a marketplace for engineering velocity.

## Why?

- **Stop reinventing prompts.** Every developer was writing their own prompts for user stories, API scaffolding, and code review.
- **Spec-driven development.** Encourage a consistent flow: spec → design → build → test → deploy.
- **Composable.** Templates can be chained into workflows. Skills can be dropped into Claude Code.
- **Community-driven.** Contributions via Git PRs.

## What's in this starter kit?

This folder is a **handoff package for Claude Code**. It contains:

```
agent-builder/
├── README.md                 ← You are here
├── CLAUDE.md                 ← Instructions for Claude Code (read this first)
├── tasks.md                  ← Ordered build task list
├── docs/
│   ├── PRD.md                ← Product requirements
│   ├── architecture.md       ← Technical architecture
│   ├── content-schema.md     ← Frontmatter standard
│   ├── taxonomy.md           ← Categories and tags
│   └── contribution-guide.md ← How to add templates
└── content/
    ├── templates/            ← Seed prompt templates (.mdx)
    ├── skills/               ← Seed Claude Code skills
    ├── workflows/            ← Multi-step playbooks
    └── mcp-configs/          ← MCP server configs
```

## Local development

**Prerequisites**

- Node.js **20 LTS** or newer
- [pnpm](https://pnpm.io/installation) 9+

**Run it**

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

**Other commands**

```bash
pnpm build     # production build (also generates .next/standalone for Azure)
pnpm start     # serve the production build
pnpm lint      # eslint
```

**Environment variables**

| Var | Purpose | Default |
|-----|---------|---------|
| `SITE_URL` | Absolute origin used in OG image URLs, sitemap, and robots | `http://localhost:3000` |

For deployment to Azure App Service, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Quick start (for the human)

1. Open this folder in Cursor or VS Code with Claude Code
2. Tell Claude Code: **"Read CLAUDE.md and tasks.md, then start building Phase 1"**
3. Review the scaffolded site, iterate
4. Deploy to Azure App Service via the pipeline in `azure-pipelines.yml`

## Phase plan

- **Phase 1 (now):** Custom App Development assets — web apps, APIs, frontend, backend
- **Phase 2:** ETL & Data Engineering assets
- **Phase 3:** Mobile, AI/ML, and specialty workflows

## Tech stack

- Next.js 16 (App Router, RSC, standalone output)
- Tailwind CSS v4 + shadcn/ui
- MDX for content (frontmatter + Markdown), Shiki for syntax highlighting
- Fuse.js for in-page search, cmdk for the Cmd+K palette
- Azure App Service hosting (Linux, Node 20 LTS)

## Contributing

See `docs/contribution-guide.md`. TL;DR: branch off `main`, add an `.mdx` file in the right `content/` folder, push, open a Pull Request in Azure DevOps.
