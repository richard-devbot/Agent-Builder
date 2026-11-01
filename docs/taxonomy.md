# Taxonomy

> Controlled vocabulary for categories, phases, project types, and stacks. Update this file when adding a new value.

## SDLC Phases (5)

The five top-level phases used for the home-page flow and primary navigation.

| Slug | Name | Description |
|------|------|-------------|
| `discover` | Discover | Requirements, user stories, personas, problem framing |
| `design` | Design | Architecture, UX/UI, API contracts, data models |
| `build` | Build | Frontend, backend, database, integrations |
| `test` | Test | Unit, integration, E2E, code review, accessibility |
| `deploy` | Deploy | DevOps, CI/CD, IaC, monitoring, documentation |

## Categories

Categories sit *under* phases. An asset has exactly one `category`. The mapping below shows which phase each category belongs to.

### Discover phase
- `product-briefs`
- `user-stories`
- `personas`
- `epic-breakdown`
- `acceptance-criteria`
- `jira-tickets`

### Design phase
- `architecture`
- `system-design`
- `adr`
- `api-design`
- `database-design`
- `ux-design`
- `wireframes`
- `design-systems`
- `accessibility`
- `governance` — AI governance, persona/RBAC access control, hard/soft guardrail policies

### Build phase
- `frontend-development`
- `backend-development`
- `api-development`
- `database-development`
- `auth`
- `integrations`
- `forms`
- `state-management`
- `secure-coding` — secure-by-default / vibe-coding guardrails applied while generating code

### Test phase
- `unit-testing`
- `integration-testing`
- `e2e-testing`
- `code-review`
- `performance`
- `security-review`

### Deploy phase
- `dockerization`
- `ci-cd`
- `infrastructure-as-code`
- `monitoring`
- `documentation`
- `release-notes`

## Project Types

An asset can apply to one or more project types.

| Slug | Name | Status |
|------|------|--------|
| `custom-app` | Custom Application | Phase 1 (active) |
| `etl` | ETL / Data Pipeline | Phase 2 |
| `data-engineering` | Data Engineering | Phase 2 |
| `mobile` | Mobile App | Future |
| `ai-ml` | AI/ML Application | Future |

## Tech stacks

Free-form-ish but prefer these canonical slugs:

**Languages:** `typescript`, `javascript`, `python`, `java`, `go`, `rust`, `sql`

**Frontend:** `nextjs`, `react`, `vue`, `svelte`, `tailwind`, `shadcn-ui`

**Backend:** `nodejs`, `express`, `fastapi`, `django`, `spring-boot`, `dotnet`

**Database:** `postgres`, `mysql`, `mongodb`, `redis`, `dynamodb`, `snowflake`

**Cloud:** `aws`, `gcp`, `azure`, `vercel`, `cloudflare`

**DevOps:** `docker`, `kubernetes`, `terraform`, `pulumi`, `github-actions`

**Data:** `dbt`, `airflow`, `dagster`, `spark`, `kafka`

**AI tools:** `claude-code`, `cursor`, `mcp`, `anthropic-api`

## Tags

Tags are free-form. Use them for cross-cutting concerns the formal taxonomy doesn't cover:
- `quick-win`, `boilerplate`, `migration`, `refactor`, `legacy`
- `pii-aware`, `gdpr`, `hipaa`
- `monorepo`, `microservices`, `serverless`

## When to add a new category

If 3+ assets need a category that doesn't exist, add it. Open a PR updating:
1. This file
2. `lib/schema.ts` (if categories become enum-validated)
3. Any UI that lists categories

## When to add a new phase

Don't. Five phases are the contract. New SDLC ideas fit as categories within an existing phase.
