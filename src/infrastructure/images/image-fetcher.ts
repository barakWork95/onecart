import "server-only";

/**
 * Only the stores' image CDNs (as in next.config.ts images.remotePatterns): the
 * URLs come from store APIs, but the server should never fetch arbitrary hosts.
 */
const IMAGE_HOSTS = [
  { host: "alicdn.com", subdomains: true },
  { host: "aliexpress-media.com", subdomains: true },
  { host: "m.media-amazon.com", subdomains: false },
  { host: "i.ebayimg.com", subdomains: false },
] as const;

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5_000;

export function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return IMAGE_HOSTS.some((h) => host === h.host || (h.subdomains && host.endsWith(`.${h.host}`)));
}

/** The image's bytes, or null (not allowed, not an image, too big, timed out, failed). */
export async function fetchImage(url: string, doFetch: typeof fetch = fetch): Promise<Buffer | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const response = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > MAX_IMAGE_BYTES ? null : bytes;
  } catch {
    return null;
  }
}
