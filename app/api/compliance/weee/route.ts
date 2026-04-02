import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimateWeee } from "@/lib/compliance/weee";
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
    prisma.productWeeeProfile.findMany({
      where,
      include: {
        product: { select: { id: true, productName: true, category: true, subcategory: true, annualUnitsSold: true, ean: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.productWeeeProfile.count({ where }),
  ]);

  const filtered = search
    ? profiles.filter((p) => p.product.productName.toLowerCase().includes(search.toLowerCase()) || p.product.ean.includes(search))
    : profiles;

  return NextResponse.json({ profiles: filtered, total, page, pageCount: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const noAi = new URL(request.url).searchParams.get("noAi") === "true";
  const products = await prisma.product.findMany({
    where: { OR: [{ weeeProfile: { status: "UNKNOWN" } }, { weeeProfile: null }] },
    select: { id: true },
    take: 50,
  });

  let updated = 0, errors = 0;
  for (const { id } of products) {
    try { await estimateWeee(id, noAi); await computeComplianceScore(id); updated++; } catch { errors++; }
  }
  return NextResponse.json({ updated, errors, total: products.length, noAi });
}
