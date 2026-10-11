import type { Logger } from "@/domain/shared/logger";

/** Structured JSON lines on stderr — readable locally, parseable by Vercel log drains. */
export const consoleLogger: Logger = {
  warn(message, context) {
    console.warn(JSON.stringify({ level: "warn", message, ...context }));
  },
};
