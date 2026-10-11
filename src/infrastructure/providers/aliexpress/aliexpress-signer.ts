import { createHash } from "node:crypto";

/**
 * AliExpress Open Platform "md5" signature: sort params by key, concatenate
 * key+value pairs, wrap with the app secret on both sides, MD5, upper-case hex.
 */
export function signAliExpressParams(params: Readonly<Record<string, string>>, appSecret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return createHash("md5").update(`${appSecret}${payload}${appSecret}`, "utf8").digest("hex").toUpperCase();
}
