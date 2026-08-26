import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/bootstrap",
  "/api/auth/login",
  "/api/auth/totp",
  "/login",
  "/bootstrap",
  "/_next",
  "/favicon",
  "/icon.svg",
  "/manifest.webmanifest",
];

/**
 * Edge guard: presence check only (real verification happens against the DB
 * in layouts/API handlers — defense in depth without an edge DB round-trip).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has("pos_session");
  if (!hasSession && !pathname.startsWith("/api")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!hasSession && pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Authentication required" } },
      { status: 401 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
