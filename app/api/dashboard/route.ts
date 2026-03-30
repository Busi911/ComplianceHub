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
      prisma.product.count({
        where: { samplingRecords: { some: {} } },
      }),
      prisma.productPackagingProfile.count({
        where: { status: "ESTIMATED" },
      }),
      prisma.product.count({
        where: { importBatchId: { not: null } },
      }),
      prisma.productPackagingProfile.count({ where: { status: "SAMPLED" } }),
      prisma.productPackagingProfile.count({ where: { status: "REVIEWED" } }),
    ]);

    // Products missing recommended fields
    const productsMissingMinData = await prisma.product.count({
      where: {
        OR: [
          { category: null },
          {
            AND: [
              { netWeightG: null },
              { grossWeightG: null },
            ],
          },
        ],
      },
    });

    // Average confidence score across all profiles
    const confidenceAgg = await prisma.productPackagingProfile.aggregate({
      _avg: { confidenceScore: true },
    });

    // Confidence distribution buckets
    const [confLow, confMed, confHigh] = await Promise.all([
      prisma.productPackagingProfile.count({
        where: { confidenceScore: { lt: 0.4 } },
      }),
      prisma.productPackagingProfile.count({
        where: { confidenceScore: { gte: 0.4, lt: 0.7 } },
      }),
      prisma.productPackagingProfile.count({
        where: { confidenceScore: { gte: 0.7 } },
      }),
    ]);

    const recentImportBatches = await prisma.importBatch.findMany({
      orderBy: { importedAt: "desc" },
      take: 8,
    });

    // Status counts for distribution chart
    const statusImportedCount = await prisma.productPackagingProfile.count({
      where: { status: "IMPORTED" },
    });

    return NextResponse.json({
      totalProducts,
      productsWithSampling,
      productsWithEstimateOnly,
      productsImported,
      productsMissingMinData,
      productsWithoutSampling: totalProducts - productsWithSampling,
      recentImportBatches,
      // Charts data
      statusDistribution: {
        IMPORTED: statusImportedCount,
        ESTIMATED: productsWithEstimateOnly,
        SAMPLED: statusSampled,
        REVIEWED: statusReviewed,
      },
      avgConfidence: confidenceAgg._avg.confidenceScore ?? 0,
      confidenceDistribution: {
        low: confLow,
        medium: confMed,
        high: confHigh,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
