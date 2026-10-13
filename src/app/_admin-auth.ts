import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type AdminAccess = "granted" | "denied" | "disabled";

export const ADMIN_REALM = 'Basic realm="OneCart internal", charset="UTF-8"';

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * HTTP Basic check for /internal pages: any user name, the password must
 * equal `password`. Without a configured password the pages don't exist.
 * Digests make the comparison constant-time whatever the input length.
 */
export function adminAccess(authorization: string | null, password: string | undefined): AdminAccess {
  if (!password) return "disabled";
  const match = /^Basic\s+(\S+)$/i.exec(authorization ?? "");
  if (!match?.[1]) return "denied";
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return "denied";
  return timingSafeEqual(digest(decoded.slice(colon + 1)), digest(password)) ? "granted" : "denied";
}
