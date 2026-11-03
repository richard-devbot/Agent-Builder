/**
 * Verifies the wizard's step-2 (org guidelines) and step-3 (project profile)
 * outputs actually land in the generated instruction files for every provider.
 */
import { buildKit, type Selection, type Provider } from "../lib/kit/build-kit";
import {
  orgGuidelineRules,
  RECOMMENDED_ORG_GUIDELINE_IDS,
} from "../lib/kit/org-guidelines";
import {
  PROJECT_QUESTIONS,
  isTechQuestion,
  projectProfileRule,
  relevantQuestions,
} from "../lib/kit/project-questions";
import {
  projectTypeRule,
  projectTypeSkills,
  projectTypeTrigger,
} from "../lib/kit/project-types";

const PROVIDERS: Provider[] = ["claude-code", "copilot", "cursor", "gemini-cli", "google-adk"];
const INSTRUCTION_FILE: Record<Provider, string> = {
  "claude-code": "CLAUDE.md",
  copilot: ".github/copilot-instructions.md",
  cursor: "AGENTS.md",
  "gemini-cli": "GEMINI.md",
  "google-adk": "GEMINI.md",
};

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const tech = ["java", "spring-boot", "postgres"];
const orgRules = orgGuidelineRules(
  new Set([...RECOMMENDED_ORG_GUIDELINE_IDS, "brand-voice"]),
  "Acme Corp",
);
const typeTrigger = projectTypeTrigger("legacy-migration");
const profile = projectProfileRule(
  [...tech, typeTrigger],
  {
    "legacy-source": ["java-monolith"],
    "legacy-target": ["spring-boot-microservices"],
    "legacy-approach": ["phased-modules"],
    "java-frameworks": ["spring-boot", "spring-data-jpa", "hibernate"],
    "java-build": ["maven"],
    "architecture-style": ["modular-monolith"],
    "project-notes": ["All money values are stored in minor units."],
  },
  "Helix Billing",
);

assert(orgRules.length === RECOMMENDED_ORG_GUIDELINE_IDS.length + 1, "org rules produced");
assert(profile !== null, "project profile produced");
assert(
  orgRules.every((r) => r.body.includes("Acme Corp")),
  "org name substituted into guideline bodies",
);

// Project-type wiring: type-triggered questions appear only for their type.
const legacyQs = relevantQuestions([...tech, typeTrigger]).map((q) => q.id);
assert(legacyQs.includes("legacy-target"), "legacy questions shown for legacy type");
assert(
  !relevantQuestions(tech).some((q) => q.id.startsWith("legacy-")),
  "legacy questions hidden without the type",
);
assert(
  relevantQuestions([...tech, projectTypeTrigger("greenfield")]).some(
    (q) => q.id === "greenfield-inputs",
  ),
  "greenfield questions shown for greenfield type",
);

// Every non-tech question has a section card on the project step, and each type gets its own questions.
assert(PROJECT_QUESTIONS.filter((q) => !isTechQuestion(q)).every((q) => q.section), "every project-step question has a section");
for (const [type, min] of [["greenfield", 5], ["brownfield", 5], ["legacy-migration", 9]] as const) {
  const own = PROJECT_QUESTIONS.filter((q) => q.triggers.includes(projectTypeTrigger(type)));
  assert(own.length >= min, `${type} has at least ${min} type-specific questions (${own.length})`);
}
const ids = PROJECT_QUESTIONS.map((q) => q.id);
assert(new Set(ids).size === ids.length, "question ids are unique");
const richProfile = projectProfileRule(
  [projectTypeTrigger("brownfield")],
  { "brownfield-goal": ["refactor", "security"], "brownfield-hotspots": ["billing/ has no tests"], "deploy-target": ["gcp"] },
  "Helix",
);
assert(
  Boolean(richProfile?.body.includes("**Change goal:** Refactor for maintainability, Security hardening") && richProfile.body.includes("billing/ has no tests") && richProfile.body.includes("**Hosting:** Google Cloud")),
  "new type-specific answers land in the project profile",
);

const typeRule = projectTypeRule("legacy-migration");
const typeSkills = projectTypeSkills("legacy-migration");
assert(typeRule !== null, "legacy type rule produced");
assert(typeSkills.length === 1, "legacy playbook skill produced");
assert(projectTypeRule(null) === null, "no type rule when no type chosen");
assert(projectTypeSkills(null).length === 0, "no playbook when no type chosen");

const sel: Selection = {
  technologies: tech,
  agents: [],
  rules: [
    ...orgRules,
    ...(typeRule ? [typeRule] : []),
    ...(profile ? [profile] : []),
  ],
  skills: [...typeSkills],
  hooks: [],
  commands: [],
  mcpServers: [],
};

for (const p of PROVIDERS) {
  const files = buildKit(sel, p);
  const main = files.find((f) => f.path === INSTRUCTION_FILE[p]);
  assert(Boolean(main), `[${p}] instruction file ${INSTRUCTION_FILE[p]} emitted`);
  const c = main?.contents ?? "";
  assert(c.includes("AI usage & accountability"), `[${p}] org governance guideline present`);
  assert(c.includes("Acme Corp"), `[${p}] org name rendered`);
  assert(c.includes("Project profile"), `[${p}] project profile section present`);
  assert(
    c.includes("Spring Boot, Spring Data JPA, Hibernate"),
    `[${p}] chosen frameworks compiled into profile`,
  );
  assert(c.includes("minor units"), `[${p}] free-text project note carried through`);
  assert(
    c.includes("Project type — Legacy migration"),
    `[${p}] project-type rule present`,
  );
  assert(
    c.includes("Spring Boot microservices (Java)"),
    `[${p}] legacy target stack compiled into profile`,
  );
  assert(
    files.some((f) => f.path.includes("legacy-migration-playbook")),
    `[${p}] legacy migration playbook skill emitted`,
  );
}

if (process.exitCode) console.error("\nSome checks FAILED");
else console.log("\nAll wizard checks passed");
