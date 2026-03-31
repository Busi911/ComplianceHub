import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/manufacturer-buffer/match
// Re-runs matching for all unmatched buffer entries.
// Called manually from the UI when user wants to trigger a fresh match pass.
export async function POST() {
  const unmatched = await prisma.manufacturerDataBuffer.findMany({
    where: { matchedProductId: null },
    select: {
      id: true,
      ean: true,
      mfrNetWeightG: true,
      mfrGrossWeightG: true,
      mfrPlasticG: true,
      mfrPaperG: true,
    },
  });

  if (unmatched.length === 0) {
    return NextResponse.json({ matched: 0, remaining: 0 });
  }

  // Fetch all products whose EAN appears in the unmatched list
  const eans = [...new Set(unmatched.map((e) => e.ean))];
  const products = await prisma.product.findMany({
    where: { ean: { in: eans } },
    select: { id: true, ean: true },
  });
  const productByEan = new Map(products.map((p) => [p.ean, p.id]));

  let matched = 0;

  for (const entry of unmatched) {
    const productId = productByEan.get(entry.ean);
    if (!productId) continue;

    // Apply mfr fields to product (only overwrite non-null buffer values)
    await prisma.product.update({
      where: { id: productId },
      data: {
        ...(entry.mfrNetWeightG !== null ? { mfrNetWeightG: entry.mfrNetWeightG } : {}),
        ...(entry.mfrGrossWeightG !== null ? { mfrGrossWeightG: entry.mfrGrossWeightG } : {}),
        ...(entry.mfrPlasticG !== null ? { mfrPlasticG: entry.mfrPlasticG } : {}),
        ...(entry.mfrPaperG !== null ? { mfrPaperG: entry.mfrPaperG } : {}),
      },
    });

    await prisma.manufacturerDataBuffer.update({
      where: { id: entry.id },
      data: { matchedProductId: productId, matchedAt: new Date() },
    });

    matched++;
  }

  const remaining = unmatched.length - matched;
  return NextResponse.json({ matched, remaining });
}
