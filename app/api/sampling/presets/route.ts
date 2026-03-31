import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sampling/presets — list all presets
export async function GET() {
  const presets = await prisma.samplingPreset.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(presets);
}

// POST /api/sampling/presets — create a new preset
export async function POST(request: NextRequest) {
  const { name, description, productIds } = await request.json();
  if (!name || !Array.isArray(productIds)) {
    return NextResponse.json({ error: "name und productIds sind Pflichtfelder" }, { status: 400 });
  }
  const preset = await prisma.samplingPreset.create({
    data: {
      name,
      description: description ?? null,
      productIds: JSON.stringify(productIds),
    },
  });
  return NextResponse.json(preset, { status: 201 });
}
