import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mean } from "@/lib/stats";

export interface BrandEntry {
  entityType: "brand" | "manufacturer";
  name: string;
  productCount: number;
  sampledCount: number;
  avgPlasticG: number | null;
  avgPaperG: number | null;
  avgConfidence: number | null;
  avgEstimationErrorPct: number | null;
  topCategory: string | null;
  profile: {
    notes: string | null;
    packagingStyle: string | null;
    typicalMaterial: string | null;
    tags: string[];
  } | null;
}

export async function GET() {
  try {
    // Fetch all products with packaging profiles
    const products = await prisma.product.findMany({
      select: {
        brand: true,
        manufacturer: true,
        category: true,
        packagingProfile: {
          select: {
            currentPlasticG: true,
            currentPaperG: true,
            confidenceScore: true,
            estimationErrorPct: true,
            status: true,
          },
        },
        _count: { select: { samplingRecords: true } },
      },
    });

    // Collect existing profiles
    const profiles = await prisma.brandProfile.findMany();
    const profileMap = new Map(
      profiles.map((p) => [`${p.entityType}::${p.name}`, p])
    );

    // Aggregate per brand and per manufacturer
    const aggregates = new Map<
      string,
      {
        entityType: "brand" | "manufacturer";
        name: string;
        plasticGs: number[];
        paperGs: number[];
        confidences: number[];
        errorPcts: number[];
        categories: string[];
        productCount: number;
        sampledCount: number;
      }
    >();

    function ensureKey(type: "brand" | "manufacturer", name: string) {
      const key = `${type}::${name}`;
      if (!aggregates.has(key)) {
        aggregates.set(key, {
          entityType: type,
          name,
          plasticGs: [],
          paperGs: [],
          confidences: [],
          errorPcts: [],
          categories: [],
          productCount: 0,
          sampledCount: 0,
        });
      }
      return aggregates.get(key)!;
    }

    for (const p of products) {
      for (const type of ["brand", "manufacturer"] as const) {
        const name = type === "brand" ? p.brand : p.manufacturer;
        if (!name) continue;
        const agg = ensureKey(type, name);
        agg.productCount++;
        if (p._count.samplingRecords > 0) agg.sampledCount++;
        if (p.category) agg.categories.push(p.category);
        if (p.packagingProfile) {
          if (p.packagingProfile.currentPlasticG != null)
            agg.plasticGs.push(p.packagingProfile.currentPlasticG);
          if (p.packagingProfile.currentPaperG != null)
            agg.paperGs.push(p.packagingProfile.currentPaperG);
          if (p.packagingProfile.confidenceScore != null)
            agg.confidences.push(p.packagingProfile.confidenceScore);
          if (p.packagingProfile.estimationErrorPct != null)
            agg.errorPcts.push(p.packagingProfile.estimationErrorPct);
        }
      }
    }

    const entries: BrandEntry[] = Array.from(aggregates.values())
      .filter((a) => a.productCount >= 1)
      .map((a) => {
        // Most common category
        const catFreq: Record<string, number> = {};
        for (const c of a.categories) catFreq[c] = (catFreq[c] ?? 0) + 1;
        const topCategory =
          Object.keys(catFreq).sort((x, y) => catFreq[y] - catFreq[x])[0] ?? null;

        const profileRaw = profileMap.get(`${a.entityType}::${a.name}`);
        const profile = profileRaw
          ? {
              notes: profileRaw.notes,
              packagingStyle: profileRaw.packagingStyle,
              typicalMaterial: profileRaw.typicalMaterial,
              tags: profileRaw.tagsJson ? (JSON.parse(profileRaw.tagsJson) as string[]) : [],
            }
          : null;

        return {
          entityType: a.entityType,
          name: a.name,
          productCount: a.productCount,
          sampledCount: a.sampledCount,
          avgPlasticG:
            a.plasticGs.length > 0
              ? Math.round(mean(a.plasticGs) * 10) / 10
              : null,
          avgPaperG:
            a.paperGs.length > 0
              ? Math.round(mean(a.paperGs) * 10) / 10
              : null,
          avgConfidence:
            a.confidences.length > 0
              ? Math.round(mean(a.confidences) * 100)
              : null,
          avgEstimationErrorPct:
            a.errorPcts.length > 0
              ? Math.round(mean(a.errorPcts) * 10) / 10
              : null,
          topCategory,
          profile,
        };
      })
      .sort((a, b) => b.productCount - a.productCount);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Brands list error:", error);
    return NextResponse.json({ error: "Failed to load brands" }, { status: 500 });
  }
}
