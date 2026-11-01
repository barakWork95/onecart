import { NextResponse } from "next/server";
import { z } from "zod";
import { fingerprintTop } from "@/app/_composition";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** The page's own search params (see `PhotoCheckParams`); never photo URLs, which we pick ourselves. */
const bodySchema = z.strictObject({
  q: z.string().max(500),
  sort: z.string().max(40).optional(),
  max: z.string().max(12).optional(),
  free: z.string().max(4).optional(),
});

const refuse = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

/**
 * The results page's photo check for a fresh generic search: fingerprints the top
 * photos of each store's cached results and reports the look-alike cards, so the
 * page can refresh into them (`PhotoMatchCheck`). Only this site's own pages may
 * ask (browsers send Origin on every POST); the proxy throttles it per IP (`match`).
 */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return refuse(403, "forbidden");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, "invalid_body");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return refuse(400, "invalid_body");
  const result = await fingerprintTop(parsed.data);
  if (result.kind === "invalid") return refuse(400, "missing_query");
  return NextResponse.json(
    { regrouped: result.regrouped, pairs: result.pairs },
    {
      headers: {
        ...NO_STORE,
        // Durations only: where the check's time went (`PhotoHashTimings`, plus reading and regrouping).
        "Server-Timing": Object.entries(result.timings)
          .map(([phase, ms]) => `${phase};dur=${ms}`)
          .join(", "),
      },
    },
  );
}
