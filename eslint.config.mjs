import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Backend Lambda build output + its own node_modules.
    "backend/**/dist/**",
    "backend/**/node_modules/**",
  ]),
  {
    rules: {
      // The set-state-in-effect pattern is how this app hydrates client-only
      // state (theme, localStorage) without SSR mismatches; keep it advisory.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
