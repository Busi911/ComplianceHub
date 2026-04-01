import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      totalProducts,
      productsWithSampling,
      productsWithEstimateOnly,
      productsImported,
      statusSampled,
      statusReviewed,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { samplingRecords: { some: {} } } }),
      prisma.productPackagingProfile.count({ where: { status: "ESTIMATED" } }),
      prisma.product.count({ where: { importBatchId: { not: null } } }),
      prisma.productPackagingProfile.count({ where: { status: "SAMPLED" } }),
      prisma.productPackagingProfile.count({ where: { status: "REVIEWED" } }),
    ]);

    const productsMissingMinData = await prisma.product.count({
      where: {
        OR: [
          { category: null },
          { AND: [{ netWeightG: null }, { grossWeightG: null }] },
        ],
      },
    });

    const confidenceAgg = await prisma.productPackagingProfile.aggregate({
      _avg: { confidenceScore: true },
    });

    const [confLow, confMed, confHigh] = await Promise.all([
      prisma.productPackagingProfile.count({ where: { confidenceScore: { lt: 0.4 } } }),
      prisma.productPackagingProfile.count({ where: { confidenceScore: { gte: 0.4, lt: 0.7 } } }),
      prisma.productPackagingProfile.count({ where: { confidenceScore: { gte: 0.7 } } }),
    ]);

    const statusImportedCount = await prisma.productPackagingProfile.count({
      where: { status: "IMPORTED" },
    });

    // Last cron run with its history entry count
    const lastCronRun = await prisma.cronRun.findFirst({
      orderBy: { startedAt: "desc" },
      include: { _count: { select: { historyEntries: true } } },
    });

    // Recent estimate history — last 25 changes (including cron + manual + import-triggered)
    const recentEstimateChanges = await prisma.productEstimateHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        product: { select: { productName: true, ean: true, category: true } },
        cronRun: { select: { id: true, type: true } },
      },
    });

    // 3 most recent import batches — for the mini-list on import page
    const recentImportBatches = await prisma.importBatch.findMany({
      orderBy: { importedAt: "desc" },
      take: 3,
    });

    return NextResponse.json({
      totalProducts,
      productsWithSampling,
      productsWithEstimateOnly,
      productsImported,
      productsMissingMinData,
      productsWithoutSampling: totalProducts - productsWithSampling,
      recentImportBatches,
      statusDistribution: {
        IMPORTED: statusImportedCount,
        ESTIMATED: productsWithEstimateOnly,
        SAMPLED: statusSampled,
        REVIEWED: statusReviewed,
      },
      avgConfidence: confidenceAgg._avg.confidenceScore ?? 0,
      confidenceDistribution: { low: confLow, medium: confMed, high: confHigh },
      lastCronRun: lastCronRun
        ? {
            id: lastCronRun.id,
            startedAt: lastCronRun.startedAt,
            finishedAt: lastCronRun.finishedAt,
            total: lastCronRun.total,
            updated: lastCronRun.updated,
            skipped: lastCronRun.skipped,
            errors: lastCronRun.errors,
            durationMs: lastCronRun.durationMs,
            changedCount: lastCronRun._count.historyEntries,
          }
        : null,
      recentEstimateChanges: recentEstimateChanges.map((h) => ({
        id: h.id,
        productId: h.productId,
        productName: h.product.productName,
        ean: h.product.ean,
        category: h.product.category,
        oldPlasticG: h.oldPlasticG,
        oldPaperG: h.oldPaperG,
        newPlasticG: h.newPlasticG,
        newPaperG: h.newPaperG,
        reason: h.reason,
        method: h.method,
        createdAt: h.createdAt,
        isCron: !!h.cronRun,
      })),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}
