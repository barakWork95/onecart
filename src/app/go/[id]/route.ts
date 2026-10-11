import { NextResponse, type NextRequest } from "next/server";
import { resolveOutboundLink } from "@/app/_composition";

/** Headers on every /go response: never cached, never indexed, never leak the search page as referrer. */
const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
} as const;

/**
 * Outbound store redirect. Only links we signed, to allowlisted store hosts,
 * with our affiliate tags. Anything else is a 404 — never a redirect.
 */
export async function GET(request: NextRequest, context: RouteContext<"/go/[id]">) {
  const { id } = await context.params;
  const params = Object.fromEntries(request.nextUrl.searchParams);
  // Next has already URL-decoded `id`; decoding again could throw on a crafted "%".
  const result = await resolveOutboundLink(id, params);

  if (!result.ok) {
    return new NextResponse("This link is invalid or has been changed. Please go back and try again.", {
      status: 404,
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.redirect(result.value.location, { status: 302, headers: HEADERS });
}
