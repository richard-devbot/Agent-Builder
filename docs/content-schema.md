# Content Schema

> Every `.mdx` file under `content/` MUST have frontmatter matching this schema. The build will fail otherwise.

## Common fields (all asset types)

```yaml
---
title: string                    # Required. Display name. Max 80 chars.
slug: string                     # Required. URL-safe. kebab-case. Unique within type.
description: string              # Required. One-line summary. Max 200 chars.
type: template | skill | workflow | mcp-config | playbook  # Required.
phase: discover | design | build | test | deploy  # Required. SDLC phase.
category: string                 # Required. See taxonomy.md. e.g. "user-stories", "api-development"
projectType: [string]            # Required. e.g. ["custom-app"], ["etl"], ["custom-app", "etl"]
stack: [string]                  # Optional. e.g. ["nextjs", "typescript", "postgres"]
tags: [string]                   # Optional. Free-form additional tags.
difficulty: beginner | intermediate | advanced  # Optional. Default "intermediate".
estimatedTime: string            # Optional. e.g. "5 min", "30 min". Free-form.
author: string                   # Optional. GitHub username or "Platform Engineering".
featured: boolean                # Optional. Default false. True = show on home page.
createdAt: YYYY-MM-DD            # Required.
updatedAt: YYYY-MM-DD            # Required.
---
```

## Type-specific fields

### Template (single prompt)

```yaml
---
# ...common fields with type: template
inputs:                          # Optional. List of variables the user fills in.
  - name: prd
    description: "The product requirements document"
    required: true
  - name: target_personas
    description: "Comma-separated list of personas"
    required: false
output:                          # Optional. Description of expected output.
  format: markdown               # markdown | json | code | text
  example: "..."                 # Optional inline example
relatedAssets:                   # Optional. Slugs of related assets.
  - "epic-breakdown"
  - "acceptance-criteria-generator"
---

# Prompt body in MDX

The actual prompt content goes here. Use template variables like `{{prd}}` so users know where to substitute.

## Example output (optional H2)

A real example of what this prompt produces.
```

### Skill (Claude Code skill bundle)

```yaml
---
# ...common fields with type: skill
skillName: string                # Required. The SKILL.md `name` field.
requires:                        # Optional. Dependencies.
  - mcp-server: jira
  - tool: gh-cli
files:                           # Optional. List of files the skill references.
  - SKILL.md
  - templates/ticket-template.md
---

# Body explains what the skill does, when it triggers, how to install.

## SKILL.md content

\`\`\`markdown
---
name: jira-ticket-manager
description: Use when the user wants to create...
---
[full SKILL.md content here]
\`\`\`

## How to install

Steps to drop this skill into Claude Code.
```

### Workflow (multi-step playbook)

```yaml
---
# ...common fields with type: workflow
steps:                           # Required. Ordered list of steps.
  - title: "Capture requirements"
    assetSlug: "prd-generator"
    description: "Use the PRD generator to create a spec"
  - title: "Generate user stories"
    assetSlug: "user-story-from-prd"
    description: "Break the PRD into user stories"
  - title: "Design API contract"
    assetSlug: "openapi-from-stories"
    description: "Generate the OpenAPI spec"
totalEstimatedTime: string       # Optional. e.g. "2 hours"
---

# Body explains the workflow's purpose, when to use it, and any prerequisites.
```

### Playbook (guided, sequential journey)

A `playbook` wraps an existing `workflow` with a guided UX: an intake form, per-step why/definition-of-done/output-capture, and progress that persists in the user's browser. Each step references an existing template/skill by `assetSlug`.

```yaml
---
# ...common fields with type: playbook
projectType: ["custom-app"]      # Single value: custom-app | etl | data-eng
totalEstimatedTime: "1-2 days"   # Optional. Free-form.
intakeFields:                    # Required. Fields the user fills before step 1.
  - name: oneLiner               # Reference key — used in step variableMap and prompt substitution
    label: "What are you building?"
    type: textarea               # text | textarea | stack-selector
    required: true
    placeholder: "e.g. ..."      # Optional
    helpText: "1-3 sentences."   # Optional
  - name: stack
    label: "Tech stack"
    type: stack-selector
    required: true
    options:                     # Required when type = stack-selector
      frontend: ["Next.js (App Router)", "React (Vite)", "Remix"]
      backend:  ["Node.js / Express", "Python / FastAPI"]
      database: ["Postgres", "MySQL", "MongoDB"]
steps:                           # Required. Numbered 1..N, sequential.
  - number: 1
    title: "Capture the problem and write a PRD"
    description: "Generate a structured PRD from your one-liner."
    whyThisMatters: "Everything downstream hangs on the PRD."
    assetSlug: "prd-generator"   # Must reference an existing asset slug
    estimatedTime: "20 min"      # Optional
    definitionOfDone:            # Required. 1+ items. Becomes the user-facing checklist.
      - "PRD has all 11 sections"
      - "Goals are measurable"
    outputCaptureLabel: "Paste your generated PRD"  # Optional
    variableMap:                 # Optional. Aliases template `{{var}}` → intake field name.
      problem_statement: oneLiner
---

# Body explains the playbook's purpose, how it works, and when not to use it.
```

**Validation rules** (in addition to common ones):
- `projectType` must be exactly one of `custom-app | etl | data-eng`.
- Step numbers must be sequential starting at 1.
- Intake field names must be unique within a playbook.
- Every step's `assetSlug` must reference an existing template/skill/workflow/mcp-config in the repo (enforced at build time).
- `stack-selector` intake fields must define `options.frontend`, `options.backend`, `options.database`.

### MCP Config (pre-configured MCP server)

```yaml
---
# ...common fields with type: mcp-config
serverName: string               # Required. e.g. "jira-mcp"
configFormat: claude-code | claude-desktop | cursor  # Required.
envVars:                         # Optional. Required env vars.
  - name: JIRA_HOST
    description: "Your Jira instance URL"
    example: "your-org.atlassian.net"
  - name: JIRA_API_TOKEN
    description: "API token (create at id.atlassian.com)"
    secret: true
---

# Body explains setup, with the actual config block users will copy.

## Configuration

\`\`\`json
{ ... actual config to copy ... }
\`\`\`
```

## Validation rules

The Zod schema in `lib/schema.ts` enforces:

1. **Slug uniqueness** - No two assets of the same type may share a slug.
2. **Slug format** - Lowercase, hyphens only, no leading/trailing hyphens. Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`
3. **Phase enum** - Must be one of the 5 SDLC phases.
4. **Type enum** - Must be one of the 4 asset types.
5. **Category** - Must exist in `taxonomy.md` (validated at build time).
6. **Date format** - ISO 8601 (YYYY-MM-DD).
7. **Length limits** - title ≤80 chars, description ≤200 chars.
8. **Reference integrity** - `relatedAssets` slugs and `steps[].assetSlug` must exist.

## Filename convention

`content/{type}/{slug}.mdx`

Examples:
- `content/templates/user-story-from-prd.mdx`
- `content/skills/jira-ticket-manager.mdx`
- `content/workflows/web-app-from-spec-to-deploy.mdx`
- `content/mcp-configs/jira-mcp.mdx`

## Adding a new asset

1. Pick the right type folder under `content/`.
2. Create a new `.mdx` file with kebab-case filename matching the slug.
3. Copy the appropriate template above.
4. Fill in frontmatter and body.
5. Run `pnpm build` locally to validate.
6. Open a PR.
