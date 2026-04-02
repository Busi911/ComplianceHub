import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePop } from "@/lib/compliance/pop";
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
  if (search) where.product = { OR: [{ productName: { contains: search, mode: "insensitive" } }, { ean: { contains: search } }] };

  const [profiles, total] = await Promise.all([
    prisma.productPopProfile.findMany({
      where,
      include: { product: { select: { id: true, productName: true, category: true, subcategory: true, ean: true } } },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.productPopProfile.count({ where }),
  ]);

  return NextResponse.json({ profiles, total, page, pageCount: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  void request; // POP has no AI, noAi param ignored
  const products = await prisma.product.findMany({
    where: { OR: [{ popProfile: { status: "UNKNOWN" } }, { popProfile: null }] },
    select: { id: true },
    take: 50,
  });

  let updated = 0, errors = 0;
  for (const { id } of products) {
    try { await estimatePop(id); await computeComplianceScore(id); updated++; } catch { errors++; }
  }
  return NextResponse.json({ updated, errors, total: products.length });
}
