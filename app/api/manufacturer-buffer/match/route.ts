import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/manufacturer-buffer/match
// Re-runs matching for all unmatched buffer entries.
// Matching: erst per EAN, dann per internalArticleNr → internalArticleNumber.
export async function POST() {
  const unmatched = await prisma.manufacturerDataBuffer.findMany({
    where: { matchedProductId: null },
    select: {
      id: true,
      ean: true,
      internalArticleNr: true,
      mfrNetWeightG: true,
      mfrGrossWeightG: true,
      mfrPlasticG: true,
      mfrPaperG: true,
    },
  });

  if (unmatched.length === 0) {
    return NextResponse.json({ matched: 0, remaining: 0 });
  }

  // Alle EANs und internen Artikelnummern aus ungematchten Einträgen sammeln
  const eans = [...new Set(unmatched.map((e) => e.ean).filter((e): e is string => !!e))];
  const internalNrs = [...new Set(unmatched.map((e) => e.internalArticleNr).filter((n): n is string => !!n))];

  // Produkte per EAN laden
  const productsByEan = new Map<string, string>(); // ean → productId
  if (eans.length > 0) {
    const products = await prisma.product.findMany({
      where: { ean: { in: eans } },
      select: { id: true, ean: true },
    });
    for (const p of products) productsByEan.set(p.ean, p.id);
  }

  // Produkte per interner Artikelnummer laden (Fallback)
  const productsByInternalNr = new Map<string, string>(); // internalArticleNumber → productId
  if (internalNrs.length > 0) {
    const products = await prisma.product.findMany({
      where: { internalArticleNumber: { in: internalNrs } },
      select: { id: true, internalArticleNumber: true },
    });
    for (const p of products) {
      if (p.internalArticleNumber) productsByInternalNr.set(p.internalArticleNumber, p.id);
    }
  }

  let matched = 0;

  for (const entry of unmatched) {
    // EAN bevorzugen, dann interne Artikelnummer
    const productId =
      (entry.ean ? productsByEan.get(entry.ean) : undefined) ??
      (entry.internalArticleNr ? productsByInternalNr.get(entry.internalArticleNr) : undefined);

    if (!productId) continue;

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
