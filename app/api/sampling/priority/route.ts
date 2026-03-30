import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns products sorted by sampling priority:
// 1. Products with NO packaging profile (never estimated)
// 2. Products with IMPORTED status (no estimate yet)
// 3. Products sorted by confidenceScore ASC (lowest confidence first)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? "";
    const limit = parseInt(searchParams.get("limit") ?? "100");

    const where: Record<string, unknown> = {};
    if (category) where.category = { equals: category, mode: "insensitive" };

    const products = await prisma.product.findMany({
      where,
      include: {
        packagingProfile: true,
        _count: { select: { samplingRecords: true } },
      },
      orderBy: { productName: "asc" },
      take: 500,
    });

    // Sort: no profile first, then by confidence ASC, then by samplingRecords count ASC
    const sorted = products
      .filter((p) => p._count.samplingRecords === 0) // only products without own samples
      .sort((a, b) => {
        const aScore = a.packagingProfile?.confidenceScore ?? -1;
        const bScore = b.packagingProfile?.confidenceScore ?? -1;
        return aScore - bScore;
      })
      .slice(0, limit);

    return NextResponse.json({
      products: sorted,
      total: sorted.length,
    });
  } catch (error) {
    console.error("Priority error:", error);
    return NextResponse.json({ error: "Failed to load priority list" }, { status: 500 });
  }
}
