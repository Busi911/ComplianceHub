import { NextRequest, NextResponse } from "next/server";

const LOGIN_PATH = "/login";
const COOKIE_NAME = "ch_auth";
// Simple hash — not cryptographic, just obfuscates the plain password in the cookie
const COOKIE_VALUE = "authenticated_ch_2024";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the login page and its API route
  if (pathname === LOGIN_PATH || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === COOKIE_VALUE) {
    return NextResponse.next();
  }

  // Redirect to login, remember where the user wanted to go
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
