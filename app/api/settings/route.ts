import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting, SETTING_DEFAULTS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAllSettings();

  // Group them for the UI
  const groups: Record<string, typeof settings> = {};
  for (const s of settings) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }

  return NextResponse.json({ settings, groups });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as { key: string; value: string };

  if (!body.key || body.value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  if (!(body.key in SETTING_DEFAULTS)) {
    return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
  }

  const meta = SETTING_DEFAULTS[body.key];

  // Validate type
  if (meta.type === "number") {
    const n = parseFloat(body.value);
    if (isNaN(n) || n < 0) {
      return NextResponse.json({ error: "Ungültiger Zahlenwert" }, { status: 400 });
    }
  }

  await setSetting(body.key, body.value);
  return NextResponse.json({ key: body.key, value: body.value });
}
