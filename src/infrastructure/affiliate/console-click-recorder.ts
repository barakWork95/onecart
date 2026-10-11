import type { ClickRecorder } from "@/domain/affiliate/ports";

/** Logs clicks as JSON lines until the Supabase click table exists. No user data is recorded. */
export const consoleClickRecorder: ClickRecorder = {
  record(click) {
    console.warn(JSON.stringify({ level: "info", message: "go: outbound click", ...click }));
  },
};
