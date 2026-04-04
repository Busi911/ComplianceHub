import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const productId = new URL(request.url).searchParams.get("productId");

  if (productId) {
    const score = await prisma.productComplianceScore.findUnique({
      where: { productId },
    });
    const profiles = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        batteryProfile: { select: { status: true, confidenceScore: true } },
        weeeProfile:   { select: { status: true, confidenceScore: true } },
        levyProfile:   { select: { status: true, confidenceScore: true } },
        reachProfile:  { select: { status: true, confidenceScore: true } },
        rohsProfile:   { select: { status: true, confidenceScore: true } },
        eudrProfile:   { select: { status: true, confidenceScore: true } },
        popProfile:    { select: { status: true, confidenceScore: true } },
      },
    });
    return NextResponse.json({ score, profiles });
  }

  // Aggregate stats
  const [
    total,
    battStats, weeeStats, levyStats, reachStats, rohsStats, eudrStats, popStats,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.productBatteryProfile.groupBy({ by: ["status"], _count: true }),
    prisma.productWeeeProfile.groupBy({ by: ["status"], _count: true }),
    prisma.productLevyProfile.groupBy({ by: ["status"], _count: true }),
    prisma.productReachProfile.groupBy({ by: ["status"], _count: true }),
    prisma.productRohsProfile.groupBy({ by: ["status"], _count: true }),
    prisma.productEudrProfile.groupBy({ by: ["status"], _count: true }),
    prisma.productPopProfile.groupBy({ by: ["status"], _count: true }),
  ]);

  const highCompliance = await prisma.productComplianceScore.count({
    where: { overallScore: { gte: 0.8 } },
  });

  function toMap(rows: { status: string; _count: number }[]) {
    return Object.fromEntries(rows.map((r) => [r.status, r._count]));
  }

  return NextResponse.json({
    total,
    highCompliance,
    modules: {
      battery: toMap(battStats),
      weee:    toMap(weeeStats),
      levy:    toMap(levyStats),
      reach:   toMap(reachStats),
      rohs:    toMap(rohsStats),
      eudr:    toMap(eudrStats),
      pop:     toMap(popStats),
    },
  });
}
