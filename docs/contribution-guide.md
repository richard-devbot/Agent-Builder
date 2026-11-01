# Contribution Guide

Add a template, skill, playbook, or MCP configuration to Agent Builder. Pull requests are not open yet; prepare changes locally and share them with Richardson & Team for review.

## TL;DR

1. Clone the repo and create a topic branch
2. Add a `.mdx` file under the right `content/` subfolder
3. Match the schema in `docs/content-schema.md`
4. Run `pnpm build` to validate
5. Share your changes with the team for review

## Step-by-step

### 1. Pick the right asset type

| You have... | Use... |
|-------------|--------|
| A single prompt that solves one thing | **Template** |
| A reusable Claude Code skill (with SKILL.md) | **Skill** |
| A multi-step playbook chaining several prompts | **Workflow** |
| A pre-configured MCP server setup | **MCP Config** |

### 2. Create the file

Filename: `content/{type}/{slug}.mdx`

The slug should be kebab-case, descriptive, and unique within its type.

Good: `user-story-from-prd.mdx`, `nextjs-page-scaffolder.mdx`
Bad: `template1.mdx`, `My_Prompt.mdx`, `userStory.mdx`

### 3. Add frontmatter

Copy the template for your asset type from `docs/content-schema.md` and fill it in. Required fields:

- `title`, `slug`, `description`
- `type`, `phase`, `category`
- `projectType`
- `createdAt`, `updatedAt`

### 4. Write the body

Use Markdown. Code blocks render with syntax highlighting. The body should:

- **Explain when to use this asset** (1-2 sentences)
- **Show the actual prompt/skill/config** in a code block — this is what users copy
- **Include an example output** under an "## Example output" heading (templates only)
- **Note any prerequisites** (e.g., "Requires Jira MCP server connected")

### 5. Validate locally

```bash
pnpm install
pnpm build
```

If validation fails, the build will tell you which file and which field. Fix and retry.

### 6. Share for review

Share your changed files or a patch with the team. Include what the asset does,
a sample input and output, and the checks you ran. Do not include credentials,
private repository URLs, or customer data. The team will provide the submission
repository when it is available.

## Quality bar

Before opening a PR, ask yourself:

- [ ] Have I used this prompt myself successfully at least 3 times?
- [ ] Is the description clear in one sentence?
- [ ] Are inputs (variables) named clearly?
- [ ] Is there an example output (for templates)?
- [ ] Does it follow the spec-driven philosophy (clear inputs → clear outputs)?
- [ ] Is it generalizable, not project-specific?

## Style guide

- **Voice:** Direct, second-person ("Generate a..." not "I will generate...")
- **Variables:** Use `{{snake_case}}` for substitution placeholders
- **Length:** Prompts should be as short as possible, but no shorter
- **Code blocks:** Always specify the language
- **Headings:** Use H2 (`##`) for sections in the body. Don't use H1 (the title comes from frontmatter).

## Reviewing PRs (for maintainers)

Check:
1. Schema validates
2. Slug is unique and descriptive
3. Description is clear
4. Content follows style guide
5. Tags/category are accurate
6. No PII or company-specific secrets in examples

## Updating an existing asset

1. Edit the file
2. Bump `updatedAt`
3. Share the update with the team using the title `Update: <asset title>`
4. Note what changed and how you checked it

## Removing an asset

Rare. Only if:
- Asset is broken or harmful
- Has been superseded by a better one
- Was accidentally added

Ask the team to review the removal, using the title `Remove: <asset title>`, and explain why.
