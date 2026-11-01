# CLAUDE.md - Instructions for Claude Code

> Read this entire file before writing any code. This is the blueprint.

## Project context

You are building the **Agent Builder** — a public website (think 21st.dev) where developers browse, copy, and use AI prompts/skills/templates across the full software development lifecycle.

The project is **content-first**. Most value is in the curated `.mdx` files under `content/`, not the UI. The site's job is to surface that content beautifully and make it dead-simple to copy or download.

## Core principles

1. **Content over chrome.** Every UI decision should serve content discovery and copying.
2. **Static-first.** All content is MDX in the repo. No CMS, no database. PRs are the contribution model.
3. **Copy-paste must be one click.** Every prompt/skill/template needs a copy button. Show a toast confirmation.
4. **Filterability is essential.** Users need to filter by SDLC phase, tech stack, asset type, and project type.
5. **Composable.** Templates can be chained into workflows. Each template page should suggest related ones.
6. **Built for Claude Code first, other tools second.** Show "Open in Claude Code" deep links where possible.

## Tech stack (locked in)

- **Framework:** Next.js 16 (App Router, RSC, TypeScript) — was specced as v15; bumped to current default on scaffold (2026-04).
- **Styling:** Tailwind CSS v4 — was specced as v3; bumped to current default on scaffold (uses `@import "tailwindcss"` + `@theme` in `globals.css`, no `tailwind.config.ts`).
- **Components:** shadcn/ui (initialize with `npx shadcn@latest init`)
- **Content:** MDX via `@next/mdx` + `gray-matter` for frontmatter
- **Search:** Fuse.js (client-side, no backend)
- **Icons:** lucide-react
- **Syntax highlighting:** Shiki (server-side)
- **Hosting target:** Vercel

Do NOT add: a database, auth, a CMS, server-side rendering of dynamic content, or analytics in Phase 1. Keep it static and fast.

### Architecture decision — Phase 2 backend (accepted 2026-06)

The "no backend" rule above is scoped to **Phase 1 (the static kit generator)** and remains in force for the site itself: pages, browsing, search, and kit assembly stay fully static.

Phase 2 features that inherently need a server run as **thin, isolated serverless functions under `backend/`** (AWS Lambda, one function per feature). Currently sanctioned capabilities:

- **AI skill authoring** (`backend/author-skill`) — generate a SKILL.md from an uploaded reference doc. Single-file Lambda; LLM inference via the AWS Bedrock Converse API (default: Claude Haiku 4.5); deployed by GitHub Actions (`.github/workflows/deploy-lambda.yml`), no SAM/IaC template.
- **Repo discovery/analysis** (`backend/repo-discovery`) — analyze a public GitHub repo server-side (GitHub REST API + Bedrock) to produce a project-context.md draft and suggested wizard technologies.
- **Kit advising** (`backend/kit-advisor`) — review wizard selections/answers and the instruction-file draft with Bedrock; return refinement suggestions and missing answers.
- **Governance telemetry** — ingest kit-issuance and gate-verdict events for auditing.

All Lambdas follow the author-skill pattern: single-file `index.ts`, function name `sdlc-playbook-<dir>`, deployed by the shared matrix workflow.

Rules for the backend layer: the site must degrade gracefully to fully-static when a function's endpoint env var is unset; request/response contracts are shared zod schemas under `contracts/`; no persistent datastore or auth is added without a further explicit decision recorded here.

## Build phases

Follow `tasks.md` strictly. Do not skip ahead. After each phase, stop and ask the user to review.

- **Phase 1:** Project scaffold + content infrastructure
- **Phase 2:** Core pages (home, browse, category, asset detail)
- **Phase 3:** Search, copy, filtering
- **Phase 4:** Workflows page + polish
- **Phase 5:** Deploy prep

## Content schema (the contract)

Every `.mdx` file under `content/` must have frontmatter matching `docs/content-schema.md`. The site reads frontmatter to:
- Generate listing pages
- Power filters and search
- Build the asset detail page

When you build the content loader, **validate against the schema using Zod**. Fail loudly if a file is malformed — better to error at build time than silently break the site.

## Folder conventions

```
/app                    Next.js App Router pages
  /(home)              Home page route group
  /browse              All assets, filterable
  /category/[slug]     Category index pages
  /asset/[type]/[slug] Asset detail pages (type = template|skill|workflow|mcp-config)
  /workflows           Workflow showcase
  /contribute          Contribution guide rendered from MDX

/components            React components (shadcn/ui in /components/ui)
  /asset-card          Card for grid views
  /copy-button         Copy-to-clipboard with toast
  /filter-panel        Sidebar filters
  /sdlc-flow           Visual SDLC flow diagram for home page

/content               MDX content (the actual product)
  /templates
  /skills
  /workflows
  /mcp-configs

/lib
  /content.ts          Reads + parses MDX, validates with Zod
  /schema.ts           Zod schemas for frontmatter
  /search.ts           Fuse.js setup
  /utils.ts            Generic helpers (cn, etc.)

/docs                  Source-of-truth documentation
```

## UI/UX direction

**Vibe:** Clean, technical, slightly opinionated. Closer to Linear or Vercel's docs than a typical corporate site. Dark mode by default, light mode supported.

**Home page must include:**
1. Hero with one-line value prop and a search bar
2. Visual SDLC flow (Discover → Design → Build → Test → Deploy) where each phase is clickable
3. Featured templates grid (6-8 cards)
4. "Browse by category" section
5. "How to contribute" CTA

**Asset detail page must include:**
1. Title, description, tags (phase, stack, type, project type)
2. The prompt/skill/template content rendered with syntax highlighting
3. **Big copy buttons:** "Copy prompt", "Copy as Claude Code skill" (where applicable), "Open in Claude Code"
4. Example output / before-after if provided in frontmatter
5. Related assets (matched by shared tags)
6. Edit-on-GitHub link

**Browse page must include:**
1. Sidebar with filters: SDLC phase, asset type, tech stack, project type
2. Search bar (top)
3. Grid of asset cards
4. URL-driven filter state (so links are shareable)

## Things you must NOT do

- Don't add features not in `tasks.md` without asking.
- Don't change the content schema without updating `docs/content-schema.md`.
- Don't use an ORM, database, or external API in Phase 1.
- Don't add internationalization. English only.
- Don't add user accounts or auth. Public read-only.
- Don't write content yourself — the seed content in `content/` is curated. If you need more for testing, ask.

## When stuck

If a requirement is ambiguous, prefer the option that:
1. Keeps the site static and fast.
2. Makes content easier to discover or copy.
3. Reduces the friction for a developer adding a new template via PR.

If you hit a real blocker, stop and ask the user. Do not make architectural decisions silently.

## Definition of done for Phase 1

- `pnpm dev` runs the site without errors.
- Home page, browse page, and at least one asset detail page render correctly.
- All seed content in `/content` is loaded and visible.
- Copy buttons work and show toast confirmations.
- Filters on browse page work with URL state.
- Site is deployable to Vercel (no env-var blockers).
- Lighthouse score >90 on home page.
