# Product Requirements Document - Agent Builder

## 1. Overview

The Agent Builder is a public, content-driven website that serves as a curated library of reusable AI prompts, skills, templates, and workflows for the full software development lifecycle. It is inspired by [21st.dev](https://21st.dev) but covers SDLC phases instead of UI components.

## 2. Problem statement

developers using AI tools (Claude Code, Cursor, ChatGPT) currently:
- Reinvent prompts for common tasks (user stories, API scaffolding, code review)
- Have no shared standards for spec-driven development
- Spend time crafting prompts instead of solving problems
- Cannot easily discover what teammates have already built

## 3. Goals

**Primary goals**
- Provide a central, browsable, copy-paste-ready library of SDLC assets
- Make spec-driven development the default workflow across the organisation
- Enable Git-based community contributions

**Non-goals (Phase 1)**
- User accounts, auth, or personalization
- Hosted prompt execution / playground
- Comments, ratings, or social features
- Automated quality scoring

## 4. Target users

- **Primary:** software developers building custom apps
- **Secondary:** Solution architects, tech leads, data engineers (Phase 2)
- **Tertiary:** External developers (public site, community contributions welcome)

## 5. Asset types

| Type | Description | Example |
|------|-------------|---------|
| **Template** | A single reusable prompt | "Generate user stories from a PRD" |
| **Skill** | A Claude Code skill bundle (SKILL.md format) | "Jira Ticket Manager" |
| **Workflow** | Multi-step playbook chaining templates/skills | "Web app from spec to deploy" |
| **MCP Config** | Pre-configured MCP server setup | "Jira MCP" |

## 6. Core user journeys

### Journey 1: Find and copy a prompt
1. User lands on home page
2. Searches "user story" or clicks "Discovery" phase
3. Browses filtered results
4. Opens a template detail page
5. Clicks "Copy prompt"
6. Pastes into Claude Code

### Journey 2: Discover a workflow
1. User lands on home page
2. Clicks "Workflows"
3. Sees "Build a CRUD web app" workflow
4. Reads through the steps (each linking to a template/skill)
5. Follows the flow end-to-end

### Journey 3: Contribute a template
1. Developer has a prompt that worked well
2. Visits `/contribute` page
3. Forks the GitHub repo
4. Adds a `.mdx` file with frontmatter
5. Opens a PR
6. Maintainer reviews and merges

## 7. Functional requirements

### Must-have (Phase 1)
- Browse all assets with filters (SDLC phase, type, stack, project type)
- Full-text search across title, description, tags, content
- Asset detail pages with one-click copy
- Category landing pages
- Visual SDLC flow on home page
- Mobile-responsive (320px+)
- Dark mode (default) + light mode
- Edit-on-GitHub link on every asset

### Should-have (Phase 2)
- Workflows page with multi-step playbooks
- "Open in Claude Code" deep links
- Cmd+K command palette
- Related assets recommendations
- RSS feed of new templates

### Nice-to-have (Phase 3+)
- In-browser playground (test prompts inline)
- Asset versioning + diff view
- Team collections (organisation-internal subset)
- Analytics on most-used assets
- Email digest of new content

## 8. Content scope

### Phase 1 - Custom App Development
- Discovery: PRDs, user stories, personas, Jira tickets
- Architecture: ADRs, system design, API contracts
- UX/UI: wireframes, design systems, accessibility
- Backend: REST APIs, schemas, auth, migrations
- Frontend: Next.js pages, React components, forms
- Testing: unit tests, E2E, code review
- DevOps: Dockerfiles, CI/CD, IaC

### Phase 2 - ETL & Data Engineering
- Data modeling, pipeline design, dbt models, Airflow DAGs, data quality, etc.

## 9. Success metrics

- **Adoption:** 80%+ of developers visit at least once a month
- **Usage:** 50+ template copies per week within 3 months
- **Contribution:** 10+ community-submitted templates within 6 months
- **Coverage:** 50+ templates in Phase 1, 30+ in Phase 2

## 10. Constraints & assumptions

- Static site (no backend in Phase 1)
- Content lives in Git (MDX files)
- Public access (no auth)
- English only
- Vercel hosting (free tier acceptable)

## 11. Out of scope (explicit)

- Generating prompts via AI (this is a curation site, not a generator)
- Embedding 21st.dev's component library (different domain)
- Replacing Confluence or internal wikis
- Hosting your organisation's actual codebases

## 12. Open questions

- Should template versions be tracked? (Likely yes, via Git tags — handle in Phase 3)
- Who are the maintainers / who reviews PRs? (to decide)
- License for community contributions? (Recommend Apache 2.0 or MIT)
