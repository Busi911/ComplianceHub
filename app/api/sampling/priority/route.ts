import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns products sorted by sampling priority:
// sortBy=confidence (default): lowest confidence first
// sortBy=leverage: products that benefit the most other unsampled products first
//   leverage = (subcatPeers × 3 + catPeers) × (1 − confidence)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? "";
    const sortBy = searchParams.get("sortBy") ?? "confidence"; // "confidence" | "leverage"
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

    // Only products without own samples
    const unsampled = products.filter((p) => p._count.samplingRecords === 0);

    // Build count maps for leverage: how many other unsampled ESTIMATED products share
    // the same category or subcategory?
    const catCount: Record<string, number> = {};
    const subcatCount: Record<string, number> = {};

    for (const p of unsampled) {
      if (p.category) catCount[p.category] = (catCount[p.category] ?? 0) + 1;
      if (p.subcategory) subcatCount[p.subcategory] = (subcatCount[p.subcategory] ?? 0) + 1;
    }

    // Compute leverage and annotate
    const annotated = unsampled.map((p) => {
      const catPeers = p.category ? (catCount[p.category] ?? 1) - 1 : 0;
      const subcatPeers = p.subcategory ? (subcatCount[p.subcategory] ?? 1) - 1 : 0;
      const conf = p.packagingProfile?.confidenceScore ?? 0;
      // subcatPeers weighted 3× because subcategory match is strongest similarity signal
      const leverageRaw = subcatPeers * 3 + catPeers;
      const leverageScore = Math.round(leverageRaw * (1 - conf) * 10) / 10;
      return { ...p, leverageScore };
    });

    let sorted: typeof annotated;
    if (sortBy === "leverage") {
      sorted = annotated.sort((a, b) => b.leverageScore - a.leverageScore);
    } else {
      sorted = annotated.sort((a, b) => {
        const aScore = a.packagingProfile?.confidenceScore ?? -1;
        const bScore = b.packagingProfile?.confidenceScore ?? -1;
        return aScore - bScore;
      });
    }

    return NextResponse.json({
      products: sorted.slice(0, limit),
      total: sorted.length,
    });
  } catch (error) {
    console.error("Priority error:", error);
    return NextResponse.json({ error: "Failed to load priority list" }, { status: 500 });
  }
}
