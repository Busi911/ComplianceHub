import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimateEudr } from "@/lib/compliance/eudr";
import { computeComplianceScore } from "@/lib/compliance/score";
import { logCorrection } from "@/lib/compliance/corrections";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.productEudrProfile.findUnique({
    where: { productId: id },
    include: { product: { select: { productName: true, category: true, subcategory: true } } },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.productEudrProfile.findUnique({
    where: { productId: id },
    include: { product: { select: { productName: true, category: true } } },
  });

  const updateData = { ...body };
  if (body.status === "DECLARED" || body.status === "VERIFIED") updateData.confidenceScore = 1.0;
  const profile = await prisma.productEudrProfile.upsert({
    where: { productId: id },
    create: { productId: id, ...updateData },
    update: updateData,
  });
  await computeComplianceScore(id);

  if (body.status === "DECLARED" || body.status === "VERIFIED") {
    const trackFields = ["containsRegulatedCommodity", "dueDiligenceRequired"] as const;
    const changed: Record<string, { old: unknown; new: unknown }> = {};
    for (const f of trackFields) {
      if (f in body && existing && existing[f] !== body[f]) {
        changed[f] = { old: existing[f], new: body[f] };
      }
    }
    if ("commoditiesJson" in body && existing?.commoditiesJson !== body.commoditiesJson) {
      changed["commodities"] = { old: existing?.commoditiesJson, new: body.commoditiesJson };
    }
    await logCorrection(id, "eudr", changed, existing?.product.productName, existing?.product.category ?? undefined);
  }

  return NextResponse.json(profile);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await estimateEudr(id);
  await computeComplianceScore(id);
  const profile = await prisma.productEudrProfile.findUnique({ where: { productId: id } });
  return NextResponse.json(profile);
}
