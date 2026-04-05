import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || null;

  const [recentHistory, categoryBreakdown] = await Promise.all([
    // Last 100 history entries, optionally filtered by category
    prisma.productEstimateHistory.findMany({
      where: category
        ? { product: { category } }
        : undefined,
      select: {
        id: true,
        productId: true,
        oldPlasticG: true,
        newPlasticG: true,
        oldPaperG: true,
        newPaperG: true,
        method: true,
        reason: true,
        createdAt: true,
        product: {
          select: { productName: true, category: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),

    // Per-category: status counts + method breakdown
    prisma.product.groupBy({
      by: ["category"],
      _count: { id: true },
      where: category ? { category } : undefined,
      orderBy: { _count: { id: "desc" } },
      take: 60,
    }),
  ]);

  // Enrich category breakdown with status and method details
  const categories = await Promise.all(
    categoryBreakdown.map(async (row: { category: string | null; _count: { id: number } }) => {
      const cat = row.category ?? "(keine Kategorie)";

      const [statusCounts, methodCounts] = await Promise.all([
        prisma.productPackagingProfile.groupBy({
          by: ["status"],
          _count: { status: true },
          where: { product: { category: row.category ?? undefined } },
        }),
        prisma.productPackagingProfile.groupBy({
          by: ["estimationMethod"],
          _count: { estimationMethod: true },
          where: {
            estimationMethod: { not: null },
            product: { category: row.category ?? undefined },
          },
          orderBy: { _count: { estimationMethod: "desc" } },
          take: 8,
        }),
      ]);

      const noProfile = await prisma.product.count({
        where: {
          category: row.category ?? undefined,
          packagingProfile: null,
        },
      });

      const statusMap = Object.fromEntries(
        statusCounts.map((s: { status: string; _count: { status: number } }) => [s.status, s._count.status])
      );

      return {
        category: cat,
        total: row._count.id,
        noProfile,
        imported: (statusMap["IMPORTED"] as number) ?? 0,
        estimated: (statusMap["ESTIMATED"] as number) ?? 0,
        sampled: (statusMap["SAMPLED"] as number) ?? 0,
        reviewed: (statusMap["REVIEWED"] as number) ?? 0,
        methods: methodCounts.map((m: { estimationMethod: string | null; _count: { estimationMethod: number } }) => ({
          method: m.estimationMethod ?? "—",
          count: m._count.estimationMethod,
        })),
      };
    })
  );

  return NextResponse.json({
    recentHistory: recentHistory.map((h: typeof recentHistory[number]) => ({
      id: h.id,
      productId: h.productId,
      productName: h.product.productName,
      category: h.product.category,
      oldPlasticG: h.oldPlasticG,
      newPlasticG: h.newPlasticG,
      oldPaperG: h.oldPaperG,
      newPaperG: h.newPaperG,
      method: h.method,
      reason: h.reason,
      createdAt: h.createdAt,
    })),
    categories,
  });
}
