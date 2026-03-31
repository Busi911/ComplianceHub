import { NextRequest, NextResponse } from "next/server";

const LOGIN_PATH = "/login";
const COOKIE_NAME = "ch_auth";
const FULL_ACCESS_COOKIE = "authenticated_ch_2024";
const READONLY_COOKIE = "readonly_ch_2024";

// API paths where write operations (POST/PUT/DELETE/PATCH) are blocked for read-only users
const WRITE_PROTECTED_PREFIXES = [
  "/api/import",
  "/api/products",
  "/api/sampling",
  "/api/estimate",
  "/api/manufacturer-requests",
  "/api/brands",
  "/api/tools",
  "/api/manufacturer-buffer",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page, its API route, and cron jobs (cron routes validate via CRON_SECRET)
  if (
    pathname === LOGIN_PATH ||
    pathname === "/api/auth/login" ||
    pathname.startsWith("/api/cron/")
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME);
  const cookieValue = cookie?.value;

  // Full access — no restrictions
  if (cookieValue === FULL_ACCESS_COOKIE) {
    return NextResponse.next();
  }

  // Read-only access — allow all GET requests, block write operations on protected paths
  if (cookieValue === READONLY_COOKIE) {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const isWriteRoute = WRITE_PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      if (isWriteRoute) {
        return NextResponse.json(
          { error: "Kein Schreibzugriff — nur Leseberechtigung" },
          { status: 403 }
        );
      }
    }
    return NextResponse.next();
  }

  // Not authenticated — redirect to login, remember where the user wanted to go
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  if (pathname !== "/") {
    loginUrl.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Protect all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
