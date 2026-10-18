import { env } from "@/config/env";

/**
 * Whether the Hebrew interface is live (`HEBREW_UI`): /he answers, pages link to it, and
 * the sitemap lists it. Free of `next/root-params`, so route handlers (sitemap, robots) can ask.
 */
export function hebrewEnabled(): boolean {
  return env().HEBREW_UI;
}
