import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      totalProducts,
      productsWithSampling,
      productsWithEstimateOnly,
      productsImported,
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
    ]);

    // Products missing recommended fields (SKU + productName always required,
    // here we count those missing category AND missing both weights)
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

    const recentImportBatches = await prisma.importBatch.findMany({
      orderBy: { importedAt: "desc" },
      take: 5,
    });

    return NextResponse.json({
      totalProducts,
      productsWithSampling,
      productsWithEstimateOnly,
      productsImported,
      productsMissingMinData,
      productsWithoutSampling: totalProducts - productsWithSampling,
      recentImportBatches,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
