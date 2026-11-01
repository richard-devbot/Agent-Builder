# Architecture - Agent Builder

## High-level architecture

```
┌─────────────────────────────────────────────────┐
│                  Vercel (CDN)                   │
│  ┌──────────────────────────────────────────┐  │
│  │  Next.js 15 App (Static + RSC)           │  │
│  │                                          │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  │  │
│  │  │  Pages  │  │ Layouts │  │   API   │  │  │
│  │  └─────────┘  └─────────┘  └─────────┘  │  │
│  │                                          │  │
│  │  ┌──────────────────────────────────┐   │  │
│  │  │  Content layer (build-time)      │   │  │
│  │  │  - MDX parser                    │   │  │
│  │  │  - Zod validation                │   │  │
│  │  │  - Search index generation       │   │  │
│  │  └──────────────────────────────────┘   │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         ▲
         │ git push
         │
┌────────┴────────────────────────────────────────┐
│              GitHub Repository                  │
│  - /content (MDX files - the product)           │
│  - /app (Next.js app)                           │
│  - PR-based contributions                       │
└─────────────────────────────────────────────────┘
```

## Why static?

- Content updates ship via git push → Vercel auto-deploys
- Sub-100ms TTFB globally (CDN)
- Zero backend infrastructure to maintain
- Naturally version-controlled
- Fits the "MDX in repo" mental model developers expect

## Data flow

### Build time
1. Next.js build kicks off
2. `lib/content.ts` reads all `.mdx` files in `content/`
3. `gray-matter` extracts frontmatter
4. Zod validates each file against schemas in `lib/schema.ts`
5. Validated assets are passed to page components
6. Static HTML is generated for each route
7. Search index (Fuse.js) is generated and embedded in client bundle

### Runtime (browser)
1. User loads page (HTML pre-rendered)
2. Hydration runs interactive components (filters, search, copy buttons)
3. Search uses Fuse.js index in-memory
4. Filter state synced to URL via `useSearchParams`
5. Copy buttons use `navigator.clipboard.writeText`

## Routing

| Route | Type | Purpose |
|-------|------|---------|
| `/` | Static | Home page |
| `/browse` | Static + client filters | All assets, filterable |
| `/category/[slug]` | Static (generateStaticParams) | Category index |
| `/asset/[type]/[slug]` | Static (generateStaticParams) | Asset detail |
| `/workflows` | Static | All workflows |
| `/workflows/[slug]` | Static | Workflow detail |
| `/contribute` | Static | Contribution guide |

## Component hierarchy

```
RootLayout
├── Header
│   ├── Logo
│   ├── NavLinks
│   ├── ThemeToggle
│   └── GitHubLink
├── [page content]
└── Footer

HomePage
├── Hero (with SearchBar)
├── SDLCFlow (5 phase cards)
├── FeaturedAssetsGrid
├── CategoriesSection
└── ContributeCTA

BrowsePage
├── SearchBar
├── FilterPanel
│   ├── PhaseFilter
│   ├── TypeFilter
│   ├── StackFilter
│   └── ProjectTypeFilter
└── AssetGrid
    └── AssetCard[]

AssetDetailPage
├── Breadcrumb
├── AssetHeader (title, badges)
├── AssetTabs
│   ├── PromptTab (with CopyButton)
│   ├── ExampleTab
│   └── HowToUseTab
├── RelatedAssets
└── EditOnGitHubLink
```

## Performance budget

- Lighthouse score: ≥90 on all pages
- LCP: <2.0s
- TBT: <200ms
- Bundle size: <200KB gzipped initial JS
- Images: Next/Image with AVIF/WebP

## Security

- No authentication = no auth attack surface
- All content is static and pre-rendered
- No user input persisted
- `navigator.clipboard` requires HTTPS (Vercel provides)
- Content Security Policy headers via `next.config.js`

## Deployment

- Vercel project linked to GitHub repo
- `main` branch → production
- PR previews auto-generated
- No env vars required for Phase 1
- Custom domain (e.g., `playbook.example.com`) configured via Vercel

## Future evolution

- **Phase 3 playground:** Add `/api/run-prompt` route → Anthropic API. Will need rate limiting and an API key (Vercel env var).
- **Phase 3 versioning:** Add `version` field to frontmatter, render version selector on asset pages.
- **Phase 4 search-at-scale:** If content >500 assets, migrate from Fuse.js to Algolia or Pagefind.
