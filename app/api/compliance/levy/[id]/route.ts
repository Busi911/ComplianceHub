import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimateLevy } from "@/lib/compliance/levy";
import { computeComplianceScore } from "@/lib/compliance/score";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.productLevyProfile.findUnique({
    where: { productId: id },
    include: { product: { select: { productName: true, category: true, subcategory: true, annualUnitsSold: true } } },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const profile = await prisma.productLevyProfile.upsert({
    where: { productId: id },
    create: { productId: id, ...body },
    update: body,
  });
  await computeComplianceScore(id);
  return NextResponse.json(profile);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await estimateLevy(id);
  await computeComplianceScore(id);
  const profile = await prisma.productLevyProfile.findUnique({ where: { productId: id } });
  return NextResponse.json(profile);
}
