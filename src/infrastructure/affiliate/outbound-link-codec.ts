import { createHmac, timingSafeEqual } from "node:crypto";
import type { ClickContext, OutboundLinkCodec, OutboundTarget } from "@/domain/affiliate/ports";
import { isProviderId } from "@/domain/shared/provider";

/** Minimum secret length (bytes of entropy matter more, but this catches "changeme"). */
export const MIN_SECRET_LENGTH = 32;

interface Payload {
  readonly v: 1;
  readonly p: string;
  readonly u: string;
  /** Click context (optional): title, price in agorot (or null), best deal. */
  readonly t?: string;
  readonly a?: number | null;
  readonly b?: boolean;
}

/** Longest title a link carries: enough to recognize the product, short enough for a URL. */
const MAX_TITLE = 80;

function contextOf({ t, a, b }: Partial<Payload>): ClickContext | null | undefined {
  if (t === undefined && a === undefined && b === undefined) return undefined;
  const priceOk = a === null || (typeof a === "number" && Number.isInteger(a) && a > 0);
  if (typeof t !== "string" || t.length > MAX_TITLE || !priceOk || typeof b !== "boolean") return null;
  return { title: t, priceAgorot: a, bestDeal: b };
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/**
 * `/go/{id}?d={payload}&s={signature}` where payload = base64url(JSON) and
 * signature = HMAC-SHA256(secret, "{id}.{payload}"). The id is inside the MAC,
 * so a valid payload can't be replayed under another product's id.
 */
export function createHmacOutboundLinkCodec(secret: string): OutboundLinkCodec {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new RangeError(`Outbound link secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const mac = (id: string, data: string) => createHmac("sha256", secret).update(`${id}.${data}`).digest();

  return {
    encode(target: OutboundTarget) {
      const { context } = target;
      const payload: Payload = {
        v: 1,
        p: target.provider,
        u: target.url,
        ...(context
          ? {
              t: context.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE),
              a: context.priceAgorot,
              b: context.bestDeal,
            }
          : {}),
      };
      const data = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
      const query = new URLSearchParams({ d: data, s: b64url(mac(target.id, data)) });
      return `/go/${encodeURIComponent(target.id)}?${query.toString()}`;
    },

    decode(id, params) {
      const { d, s } = params;
      if (!d || !s || d.length > 4096 || s.length > 128) return null;

      const expected = mac(id, d);
      const given = Buffer.from(s, "base64url");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (typeof payload !== "object" || payload === null) return null;
      const fields = payload as Partial<Payload>;
      const { v, p, u } = fields;
      if (v !== 1 || typeof p !== "string" || typeof u !== "string" || !isProviderId(p)) return null;
      // The id names its store ("amazon:…"); it must agree with the signed provider.
      if (!id.startsWith(`${p}:`)) return null;
      const context = contextOf(fields);
      if (context === null) return null;
      return context ? { id, provider: p, url: u, context } : { id, provider: p, url: u };
    },
  };
}
