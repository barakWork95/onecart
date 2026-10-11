import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase session cookie fresh. Server Components can read but not
 * write cookies, so without this an expired access token would make a
 * returning visitor's Saved/Alerts look empty. No-op without Supabase.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Validates the JWT and refreshes it via setAll() when it's about to expire.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Pages that read the session; skip assets, the redirect route, and cron.
  matcher: ["/search", "/saved", "/alerts"],
};
