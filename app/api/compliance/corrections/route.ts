import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const module = url.searchParams.get("module") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

  const corrections = await prisma.complianceCorrection.findMany({
    where: module ? { module } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      product: { select: { productName: true, category: true, ean: true } },
    },
  });

  // Pattern analysis: which fields get corrected most?
  const fieldCounts: Record<string, number> = {};
  for (const c of corrections) {
    const fields = JSON.parse(c.correctedFields) as Record<string, unknown>;
    for (const f of Object.keys(fields)) {
      fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    corrections: corrections.map((c) => ({
      id: c.id,
      module: c.module,
      productName: c.product.productName,
      productCategory: c.product.category,
      ean: c.product.ean,
      correctedFields: JSON.parse(c.correctedFields),
      createdAt: c.createdAt,
    })),
    total: corrections.length,
    fieldCounts,
  });
}
