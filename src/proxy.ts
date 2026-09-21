import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Vercel supplies the trusted forwarding header. Local development stays HTTP.
  if (
    process.env.VERCEL === "1" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  if (
    path.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    path !== "/api/payments/webhook"
  ) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json(
        { error: "Request origin is not allowed" },
        { status: 403 },
      );
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return NextResponse.json(
        { error: "Cross-site request is not allowed" },
        { status: 403 },
      );
    const size = Number(request.headers.get("content-length") || 0);
    if (size > 65536)
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413 },
      );
  }
  let response = NextResponse.next({ request });
  const isAccount = /^\/(admin|portal|gate|auth)(\/|$)/.test(path);
  if (isAccount) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: {
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            for (const { name, value } of values)
              request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of values)
              response.cookies.set(name, value, options);
          },
        },
      },
    );
    // Refresh only. Server layouts and route handlers remain the authority for roles.
    await supabase.auth.getUser();
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (path.startsWith("/api/"))
    response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/admin/:path*",
    "/portal/:path*",
    "/gate/:path*",
    "/auth/:path*",
    "/api/:path*",
  ],
};
