import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Layer boundaries: domain is pure; application depends only on domain.
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/application/*", "@/infrastructure/*", "@/app/*", "@/components/*", "@/config/*"],
              message: "domain/ must stay pure — depend on nothing outside domain/.",
            },
            {
              group: ["next", "next/*", "react", "react-dom", "@upstash/*", "@supabase/*"],
              message: "domain/ must not import frameworks or SDKs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/*", "@/app/*", "@/components/*"],
              message: "application/ depends on domain ports, not on infrastructure or UI. Inject adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    ignores: ["src/app/**/actions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/infrastructure/*"],
              message:
                "UI calls application use cases (via Server Actions / composition root), never infrastructure directly.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
