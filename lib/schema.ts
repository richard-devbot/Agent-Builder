import { z } from "zod";

export const PHASES = ["discover", "design", "build", "test", "deploy"] as const;
export const ASSET_TYPES = [
  "template",
  "skill",
  "mcp-config",
  "playbook",
] as const;
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export const OUTPUT_FORMATS = ["markdown", "json", "code", "text"] as const;
export const CONFIG_FORMATS = ["claude-code", "claude-desktop", "cursor"] as const;
export const PROJECT_TYPES = ["custom-app", "etl", "data-eng"] as const;
export const ASSET_STATUSES = ["active", "deprecated"] as const;
export const INTAKE_FIELD_TYPES = [
  "text",
  "textarea",
  "stack-selector",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export type Phase = (typeof PHASES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const slugSchema = z
  .string()
  .min(1)
  .regex(slugRegex, "slug must be lowercase kebab-case (a-z, 0-9, hyphens)");

const dateSchema = z
  .union([
    z.string().regex(dateRegex, "date must be ISO 8601 format YYYY-MM-DD"),
    z.date().transform((d) => d.toISOString().slice(0, 10)),
  ])
  .pipe(z.string().regex(dateRegex));

const inputVariableSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().optional().default(false),
});

const envVarSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  example: z.string().optional(),
  secret: z.boolean().optional().default(false),
});

const requiresEntrySchema = z.union([
  z.object({ "mcp-server": z.string().min(1) }),
  z.object({ tool: z.string().min(1) }),
]);

const commonFields = {
  title: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().min(1).max(200),
  phase: z.enum(PHASES),
  category: z.string().min(1),
  projectType: z.array(z.string().min(1)).min(1),
  stack: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  difficulty: z.enum(DIFFICULTIES).optional().default("intermediate"),
  estimatedTime: z.string().optional(),
  author: z.string().optional(),
  featured: z.boolean().optional().default(false),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  /** Semantic content version, bumped when the asset's body meaningfully changes. */
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "version must be semver (e.g. 1.0.0)")
    .optional()
    .default("1.0.0"),
  /** Lifecycle status; deprecated assets stay browsable but are flagged. */
  status: z.enum(ASSET_STATUSES).optional().default("active"),
  relatedAssets: z.array(slugSchema).optional().default([]),
};

export const templateFrontmatterSchema = z.object({
  ...commonFields,
  type: z.literal("template"),
  inputs: z.array(inputVariableSchema).optional().default([]),
  output: z
    .object({
      format: z.enum(OUTPUT_FORMATS),
      example: z.string().optional(),
    })
    .optional(),
});

export const skillFrontmatterSchema = z.object({
  ...commonFields,
  type: z.literal("skill"),
  skillName: z.string().min(1),
  requires: z.array(requiresEntrySchema).optional().default([]),
  files: z.array(z.string().min(1)).optional().default([]),
});

export const mcpConfigFrontmatterSchema = z.object({
  ...commonFields,
  type: z.literal("mcp-config"),
  serverName: z.string().min(1),
  configFormat: z.enum(CONFIG_FORMATS),
  envVars: z.array(envVarSchema).optional().default([]),
});

/* ── Playbook (guided multi-step journey) ───────────────────────────── */

const stackSelectorOptionsSchema = z.object({
  frontend: z.array(z.string().min(1)).default([]),
  backend: z.array(z.string().min(1)).default([]),
  database: z.array(z.string().min(1)).default([]),
});

const intakeFieldSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(INTAKE_FIELD_TYPES),
    required: z.boolean().optional().default(false),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    options: stackSelectorOptionsSchema.optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "stack-selector" && !field.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stack-selector intake fields must define options",
        path: ["options"],
      });
    }
  });

const alternativeAssetSchema = z.object({
  slug: slugSchema,
  /** Human-readable note: when does the user pick this over the primary? */
  when: z.string().min(1),
});

const playbookStepSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Replaces the old `whyThisMatters`. 1-2 sentence statement of the goal. */
  whatYoureDoing: z.string().min(1),
  /** The starred recommendation — must reference an existing asset. */
  primaryAsset: slugSchema,
  /** Other templates the user might pick instead. May reference forward-looking assets. */
  alternativeAssets: z.array(alternativeAssetSchema).optional().default([]),
  /** Skills relevant to this step. May reference forward-looking assets. */
  relevantSkills: z.array(slugSchema).optional().default([]),
  /** MCP configs relevant to this step. May reference forward-looking assets. */
  relevantMcpConfigs: z.array(slugSchema).optional().default([]),
  estimatedTime: z.string().optional(),
  definitionOfDone: z.array(z.string().min(1)).min(1),
  /** Common pitfalls displayed as a bulleted list. */
  commonPitfalls: z.array(z.string().min(1)).optional().default([]),
});

const wrapUpNextStepSchema = z.object({
  title: z.string().min(1),
  /** Optional asset slug — renders as a link if it resolves to an existing asset. */
  assetSlug: slugSchema.optional(),
  /** Free-form description, e.g. "after first user feedback session". */
  description: z.string().optional(),
});

const wrapUpSchema = z.object({
  /** "By now your project should have…" list. Each item is a deliverable produced in the user's repo, NOT by this site. */
  deliverables: z.array(z.string().min(1)).min(1),
  /** "Recommended next steps" list. */
  nextSteps: z.array(wrapUpNextStepSchema).optional().default([]),
});

export const playbookFrontmatterSchema = z
  .object({
    ...commonFields,
    type: z.literal("playbook"),
    projectType: z.array(z.enum(PROJECT_TYPES)).length(1, {
      message: "playbook projectType must be a single value",
    }),
    intakeFields: z.array(intakeFieldSchema).min(1),
    /**
     * Structured step-by-step navigation. Optional — when omitted, the
     * playbook renders as a long-form guide (MDX body inline on the intake
     * page, no step pages, no progress tracking). Long-form fits multi-
     * quarter playbooks where the user reads it once and references it
     * over months. Step-by-step fits short playbooks (a couple of days)
     * where the user clicks through each phase.
     */
    steps: z.array(playbookStepSchema).optional().default([]),
    totalEstimatedTime: z.string().optional(),
    wrapUp: wrapUpSchema.optional(),
  })
  .superRefine((pb, ctx) => {
    // Step numbers must be sequential 1..N (only when steps are provided)
    pb.steps.forEach((s, i) => {
      if (s.number !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `step at index ${i} has number ${s.number}; expected ${i + 1}`,
          path: ["steps", i, "number"],
        });
      }
    });
    // Intake field names must be unique
    const seen = new Set<string>();
    pb.intakeFields.forEach((f, i) => {
      if (seen.has(f.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate intake field name "${f.name}"`,
          path: ["intakeFields", i, "name"],
        });
      }
      seen.add(f.name);
    });
  });

export const assetFrontmatterSchema = z.discriminatedUnion("type", [
  templateFrontmatterSchema,
  skillFrontmatterSchema,
  mcpConfigFrontmatterSchema,
  playbookFrontmatterSchema,
]);

export type TemplateFrontmatter = z.infer<typeof templateFrontmatterSchema>;
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
export type McpConfigFrontmatter = z.infer<typeof mcpConfigFrontmatterSchema>;
export type PlaybookFrontmatter = z.infer<typeof playbookFrontmatterSchema>;
export type IntakeField = z.infer<typeof intakeFieldSchema>;
export type PlaybookStep = z.infer<typeof playbookStepSchema>;
export type AlternativeAsset = z.infer<typeof alternativeAssetSchema>;
export type WrapUpNextStep = z.infer<typeof wrapUpNextStepSchema>;
export type PlaybookWrapUp = z.infer<typeof wrapUpSchema>;
export type AssetFrontmatter = z.infer<typeof assetFrontmatterSchema>;
