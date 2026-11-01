# Build Tasks - Agent Builder

> Execute these in order. Stop at the end of each phase and ask for review.

## Phase 1: Project scaffold

- [ ] Initialize Next.js 15 with TypeScript, Tailwind, ESLint, App Router, src directory: NO, import alias: `@/*`
  ```bash
  pnpm create next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
  ```
- [ ] Initialize shadcn/ui: `npx shadcn@latest init` (defaults: Slate, CSS variables yes)
- [ ] Install core deps:
  ```bash
  pnpm add gray-matter next-mdx-remote zod fuse.js lucide-react shiki clsx tailwind-merge
  ```
- [ ] Add shadcn components: `button`, `card`, `badge`, `input`, `tabs`, `toast`, `sheet`, `separator`, `command`
- [ ] Set up dark mode with `next-themes`
- [ ] Create folder structure per `CLAUDE.md`
- [ ] Move all content from `content/` (templates, skills, workflows, mcp-configs) into the project's `content/` folder
- [ ] Move all docs from `docs/` into `docs/`
- [ ] Verify `pnpm dev` runs

## Phase 2: Content infrastructure

- [ ] Create `lib/schema.ts` with Zod schemas matching `docs/content-schema.md`
- [ ] Create `lib/content.ts` that:
  - Reads all `.mdx` files from `content/{templates,skills,workflows,mcp-configs}/`
  - Parses frontmatter with `gray-matter`
  - Validates against Zod schemas
  - Returns typed `Asset[]` with raw body content
  - Exports helpers: `getAllAssets()`, `getAssetBySlug()`, `getAssetsByCategory()`, `getRelatedAssets()`
- [ ] Create `lib/utils.ts` with `cn()` and other helpers
- [ ] Wire up MDX rendering with Shiki syntax highlighting
- [ ] Test content loading via a temporary `/test` page that lists all assets

## Phase 3: Core pages

- [ ] **Layout** (`app/layout.tsx`):
  - Header with logo, nav (Home, Browse, Workflows, Contribute, GitHub link), theme toggle
  - Footer with product branding, GitHub link, contribute CTA
- [ ] **Home page** (`app/page.tsx`):
  - Hero: headline, subheadline, search bar (links to /browse?q=)
  - SDLC flow component: 5 phases as clickable cards (Discover, Design, Build, Test, Deploy)
  - Featured templates grid (mark assets with `featured: true`)
  - "Browse by category" section
  - Contribute CTA card
- [ ] **Browse page** (`app/browse/page.tsx`):
  - Filter sidebar: SDLC phase, asset type, tech stack, project type (all as checkbox groups)
  - Search input at top
  - Grid of `AssetCard`s
  - URL state: `?phase=build&stack=nextjs&type=template`
  - Empty state when no matches
- [ ] **Category page** (`app/category/[slug]/page.tsx`):
  - Category title + description
  - Filtered grid of assets in that category
- [ ] **Asset detail page** (`app/asset/[type]/[slug]/page.tsx`):
  - Breadcrumb
  - Title, description, all tags as badges
  - Tabbed content: "Prompt" | "Example" | "How to use"
  - Code block with the prompt content + copy button
  - "Open in Claude Code" button (constructs deep link)
  - Related assets section
  - Edit-on-GitHub link

## Phase 4: Search, copy, polish

- [ ] Implement Fuse.js search across title, description, tags, content
- [ ] Build `<CopyButton>` component with toast feedback
- [ ] Add "Copy as Claude Code skill" variant for skill-type assets
- [ ] Implement filter state with `useSearchParams`
- [ ] Add keyboard shortcut (Cmd+K) to open command palette for search
- [ ] Add `<SDLCFlow>` component for the home page
- [ ] Loading states + skeletons
- [ ] 404 page

## Phase 5: Workflows page + final polish

- [ ] Build `/workflows` page showcasing multi-step playbooks
- [ ] Build workflow detail page with step-by-step expansion
- [ ] Build `/contribute` page (renders `docs/contribution-guide.md`)
- [ ] Add Open Graph images (use `@vercel/og`)
- [ ] Add `sitemap.ts` and `robots.ts`
- [ ] Verify Lighthouse score >90 on home + browse
- [ ] Add `vercel.json` if needed
- [ ] Write a brief `DEPLOYMENT.md` with Vercel instructions

## Phase 6 (later, with user approval)

- [ ] Analytics (Vercel Analytics or Plausible)
- [ ] Asset versioning + changelog
- [ ] In-browser playground (run prompts via Anthropic API)
- [ ] Workflow chaining UI
- [ ] Phase 2 content expansion (ETL & Data Engineering)

## Notes for Claude Code

- After each phase, run `pnpm build` to catch errors.
- Use Server Components by default. Only use `"use client"` for interactive components (filters, copy buttons, theme toggle, search).
- All content reads happen at build time. No runtime file I/O.
- If you need to add a dependency not listed here, ask first.
