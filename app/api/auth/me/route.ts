import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ch_auth";
const FULL_ACCESS_COOKIE = "authenticated_ch_2024";
const READONLY_COOKIE = "readonly_ch_2024";

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue === FULL_ACCESS_COOKIE) {
    return NextResponse.json({ role: "admin" });
  }
  if (cookieValue === READONLY_COOKIE) {
    return NextResponse.json({ role: "readonly" });
  }
  return NextResponse.json({ role: null }, { status: 401 });
}
