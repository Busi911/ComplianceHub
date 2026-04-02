import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimateLevy } from "@/lib/compliance/levy";
import { computeComplianceScore } from "@/lib/compliance/score";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = 50;
  const skip = (page - 1) * limit;
  const search = url.searchParams.get("search") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [profiles, total] = await Promise.all([
    prisma.productLevyProfile.findMany({
      where,
      include: { product: { select: { id: true, productName: true, category: true, subcategory: true, annualUnitsSold: true, ean: true } } },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.productLevyProfile.count({ where }),
  ]);

  const filtered = search
    ? profiles.filter((p) => p.product.productName.toLowerCase().includes(search.toLowerCase()) || p.product.ean.includes(search))
    : profiles;

  return NextResponse.json({ profiles: filtered, total, page, pageCount: Math.ceil(total / limit) });
}

export async function POST() {
  const products = await prisma.product.findMany({
    where: { OR: [{ levyProfile: { status: "UNKNOWN" } }, { levyProfile: null }] },
    select: { id: true },
    take: 50,
  });

  let updated = 0, errors = 0;
  for (const { id } of products) {
    try { await estimateLevy(id); await computeComplianceScore(id); updated++; } catch { errors++; }
  }
  return NextResponse.json({ updated, errors, total: products.length });
}
