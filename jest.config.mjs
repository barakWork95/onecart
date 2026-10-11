import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const moduleNameMapper = {
  "^@/(.*)$": "<rootDir>/src/$1",
  // `server-only` throws outside a React Server environment; it's a no-op in tests.
  "^server-only$": "<rootDir>/src/test/server-only-stub.ts",
};

/**
 * Two projects: logic (`*.test.ts`) runs in Node so adapters get the real
 * fetch/Response/AbortSignal; components (`*.test.tsx`) run in jsdom.
 */
const node = await createJestConfig({
  displayName: "node",
  testEnvironment: "node",
  moduleNameMapper,
  testMatch: ["<rootDir>/src/**/*.test.ts"],
})();

const dom = await createJestConfig({
  displayName: "dom",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper,
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
})();

/** @type {import('jest').Config} */
const config = {
  projects: [node, dom],
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/application/**/*.ts",
    "src/infrastructure/**/*.ts",
    "src/config/**/*.ts",
    "!src/config/env.ts",
    "!src/**/*.test.ts",
    "!src/**/fixtures/**",
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};

export default config;
