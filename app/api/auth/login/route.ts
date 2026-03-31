import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ch_auth";

// Password → cookie value mapping
// Full access: Alternate10!   → authenticated_ch_2024
// Read-only:   Abgaben0815!   → readonly_ch_2024
const CREDENTIALS: Record<string, string> = {
  "Alternate10!": "authenticated_ch_2024",
  "Abgaben0815!": "readonly_ch_2024",
};

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  const cookieValue = CREDENTIALS[password as string];
  if (!cookieValue) {
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    role: cookieValue === "readonly_ch_2024" ? "readonly" : "admin",
  });
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return response;
}
