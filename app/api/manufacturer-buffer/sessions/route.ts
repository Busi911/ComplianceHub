import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateProfileAfterSampling } from "@/lib/estimation";

export const dynamic = "force-dynamic";

// GET /api/manufacturer-buffer/sessions
// Returns all upload sessions grouped by sourceFileName
export async function GET() {
  const entries = await prisma.manufacturerDataBuffer.findMany({
    select: {
      sourceFileName: true,
      matchedProductId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by sourceFileName
  const sessionMap = new Map<
    string,
    { total: number; matched: number; unmatched: number; firstAt: Date; lastAt: Date }
  >();

  for (const e of entries) {
    const key = e.sourceFileName ?? "(unbekannt)";
    const existing = sessionMap.get(key);
    if (existing) {
      existing.total++;
      if (e.matchedProductId) existing.matched++;
      else existing.unmatched++;
      if (e.createdAt < existing.firstAt) existing.firstAt = e.createdAt;
      if (e.createdAt > existing.lastAt) existing.lastAt = e.createdAt;
    } else {
      sessionMap.set(key, {
        total: 1,
        matched: e.matchedProductId ? 1 : 0,
        unmatched: e.matchedProductId ? 0 : 1,
        firstAt: e.createdAt,
        lastAt: e.createdAt,
      });
    }
  }

  const sessions = Array.from(sessionMap.entries()).map(([sourceFileName, stats]) => ({
    sourceFileName,
    ...stats,
    firstAt: stats.firstAt.toISOString(),
    lastAt: stats.lastAt.toISOString(),
  }));

  return NextResponse.json({ sessions });
}

// DELETE /api/manufacturer-buffer/sessions
// Body: { sourceFileName: string }
// - Clears mfr data from all matched products
// - Deletes all buffer entries for the session
// - Re-triggers estimation for affected products
export async function DELETE(request: NextRequest) {
  const { sourceFileName } = await request.json();
  if (!sourceFileName) {
    return NextResponse.json({ error: "sourceFileName fehlt" }, { status: 400 });
  }

  // Find all buffer entries for this session
  const entries = await prisma.manufacturerDataBuffer.findMany({
    where: { sourceFileName },
    select: {
      id: true,
      matchedProductId: true,
    },
  });

  if (entries.length === 0) {
    return NextResponse.json({ error: "Session nicht gefunden" }, { status: 404 });
  }

  const matchedProductIds = entries
    .map((e) => e.matchedProductId)
    .filter((id): id is string => id !== null);

  // Clear mfr data from matched products
  if (matchedProductIds.length > 0) {
    await prisma.product.updateMany({
      where: { id: { in: matchedProductIds } },
      data: {
        mfrNetWeightG: null,
        mfrGrossWeightG: null,
        mfrPlasticG: null,
        mfrPaperG: null,
      },
    });
  }

  // Delete buffer entries
  await prisma.manufacturerDataBuffer.deleteMany({
    where: { sourceFileName },
  });

  // Re-trigger estimation for affected products (fire and forget)
  if (matchedProductIds.length > 0) {
    (async () => {
      for (const productId of matchedProductIds) {
        await updateProfileAfterSampling(productId).catch(console.error);
        await new Promise((r) => setTimeout(r, 50));
      }
    })();
  }

  return NextResponse.json({
    deleted: entries.length,
    productsReset: matchedProductIds.length,
    reestimating: matchedProductIds.length,
  });
}
