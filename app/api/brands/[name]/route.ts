import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mean, stdDev } from "@/lib/stats";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: encodedName } = await params;
    const name = decodeURIComponent(encodedName);
    const entityType = request.nextUrl.searchParams.get("type") ?? "brand";

    // Load or create-in-memory profile
    const profile = await prisma.brandProfile.findUnique({
      where: { entityType_name: { entityType, name } },
    });

    // Products for this brand/manufacturer
    const products = await prisma.product.findMany({
      where:
        entityType === "brand"
          ? { brand: name }
          : { manufacturer: name },
      select: {
        id: true,
        sku: true,
        productName: true,
        category: true,
        subcategory: true,
        grossWeightG: true,
        netWeightG: true,
        packagingProfile: {
          select: {
            status: true,
            currentPlasticG: true,
            currentPaperG: true,
            confidenceScore: true,
            estimationMethod: true,
            estimationErrorPct: true,
          },
        },
        _count: { select: { samplingRecords: true } },
      },
      orderBy: { productName: "asc" },
    });

    // Compute stats
    const plasticGs = products
      .map((p) => p.packagingProfile?.currentPlasticG)
      .filter((v): v is number => v != null);
    const paperGs = products
      .map((p) => p.packagingProfile?.currentPaperG)
      .filter((v): v is number => v != null);
    const errors = products
      .map((p) => p.packagingProfile?.estimationErrorPct)
      .filter((v): v is number => v != null);
    const confidences = products
      .map((p) => p.packagingProfile?.confidenceScore)
      .filter((v): v is number => v != null);

    // Packaging ratio: plasticG / grossWeightG
    const ratios = products
      .map((p) => {
        const plastic = p.packagingProfile?.currentPlasticG;
        const gross = p.grossWeightG;
        return plastic != null && gross != null && gross > 0
          ? plastic / gross
          : null;
      })
      .filter((v): v is number => v != null);

    // Category breakdown
    const catFreq: Record<string, number> = {};
    for (const p of products) {
      if (p.category) catFreq[p.category] = (catFreq[p.category] ?? 0) + 1;
    }

    const sampledCount = products.filter((p) => p._count.samplingRecords > 0).length;

    const stats = {
      productCount: products.length,
      sampledCount,
      avgPlasticG: plasticGs.length > 0 ? Math.round(mean(plasticGs) * 10) / 10 : null,
      stdPlasticG: plasticGs.length > 1 ? Math.round(stdDev(plasticGs) * 10) / 10 : null,
      avgPaperG: paperGs.length > 0 ? Math.round(mean(paperGs) * 10) / 10 : null,
      avgConfidence: confidences.length > 0 ? Math.round(mean(confidences) * 100) : null,
      avgEstimationErrorPct: errors.length > 0 ? Math.round(mean(errors) * 10) / 10 : null,
      avgPlasticRatioPct:
        ratios.length > 0 ? Math.round(mean(ratios) * 1000) / 10 : null,
      categoryBreakdown: Object.entries(catFreq).sort((a, b) => b[1] - a[1]),
    };

    return NextResponse.json({
      entityType,
      name,
      profile: profile
        ? {
            ...profile,
            tags: profile.tagsJson ? (JSON.parse(profile.tagsJson) as string[]) : [],
          }
        : null,
      stats,
      products,
    });
  } catch (error) {
    console.error("Brand detail error:", error);
    return NextResponse.json({ error: "Failed to load brand" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: encodedName } = await params;
    const name = decodeURIComponent(encodedName);
    const body = await request.json();
    const { entityType = "brand", notes, packagingStyle, typicalMaterial, tags } = body;

    const profile = await prisma.brandProfile.upsert({
      where: { entityType_name: { entityType, name } },
      create: {
        entityType,
        name,
        notes: notes ?? null,
        packagingStyle: packagingStyle ?? null,
        typicalMaterial: typicalMaterial ?? null,
        tagsJson: tags ? JSON.stringify(tags) : null,
      },
      update: {
        notes: notes ?? null,
        packagingStyle: packagingStyle ?? null,
        typicalMaterial: typicalMaterial ?? null,
        tagsJson: tags ? JSON.stringify(tags) : null,
      },
    });

    return NextResponse.json({
      ...profile,
      tags: profile.tagsJson ? (JSON.parse(profile.tagsJson) as string[]) : [],
    });
  } catch (error) {
    console.error("Brand update error:", error);
    return NextResponse.json({ error: "Failed to update brand profile" }, { status: 500 });
  }
}
