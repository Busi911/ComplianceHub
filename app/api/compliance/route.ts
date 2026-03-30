import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const reportYear = new Date().getFullYear();

    // Fetch all products with their packaging profiles
    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        productName: true,
        category: true,
        annualUnitsSold: true,
        packagingProfile: {
          select: {
            currentPlasticG: true,
            currentPaperG: true,
            status: true,
            confidenceScore: true,
          },
        },
      },
    });

    const totalProducts = products.length;
    const productsWithSales = products.filter(
      (p) => p.annualUnitsSold != null && p.annualUnitsSold > 0
    ).length;
    const productsWithPackaging = products.filter(
      (p) =>
        p.packagingProfile?.currentPlasticG != null ||
        p.packagingProfile?.currentPaperG != null
    ).length;
    const productsFullyReady = products.filter(
      (p) =>
        p.annualUnitsSold != null &&
        p.annualUnitsSold > 0 &&
        (p.packagingProfile?.currentPlasticG != null ||
          p.packagingProfile?.currentPaperG != null)
    ).length;

    const readinessPct =
      totalProducts > 0
        ? Math.round((productsFullyReady / totalProducts) * 100)
        : 0;

    // Annual totals: Σ(currentPlasticG × annualUnitsSold) / 1000
    let totalPlasticKg = 0;
    let totalPaperKg = 0;
    for (const p of products) {
      if (p.annualUnitsSold && p.annualUnitsSold > 0) {
        if (p.packagingProfile?.currentPlasticG != null) {
          totalPlasticKg += (p.packagingProfile.currentPlasticG * p.annualUnitsSold) / 1000;
        }
        if (p.packagingProfile?.currentPaperG != null) {
          totalPaperKg += (p.packagingProfile.currentPaperG * p.annualUnitsSold) / 1000;
        }
      }
    }

    // Per-category aggregation
    const categoryMap = new Map<
      string,
      {
        productCount: number;
        plasticTotal: number;
        paperTotal: number;
        plasticCount: number;
        paperCount: number;
        annualPlasticKg: number;
        annualPaperKg: number;
        readyCount: number;
      }
    >();

    for (const p of products) {
      const cat = p.category ?? "(Keine Kategorie)";
      const existing = categoryMap.get(cat) ?? {
        productCount: 0,
        plasticTotal: 0,
        paperTotal: 0,
        plasticCount: 0,
        paperCount: 0,
        annualPlasticKg: 0,
        annualPaperKg: 0,
        readyCount: 0,
      };

      existing.productCount += 1;

      if (p.packagingProfile?.currentPlasticG != null) {
        existing.plasticTotal += p.packagingProfile.currentPlasticG;
        existing.plasticCount += 1;
      }
      if (p.packagingProfile?.currentPaperG != null) {
        existing.paperTotal += p.packagingProfile.currentPaperG;
        existing.paperCount += 1;
      }

      if (p.annualUnitsSold && p.annualUnitsSold > 0) {
        if (p.packagingProfile?.currentPlasticG != null) {
          existing.annualPlasticKg += (p.packagingProfile.currentPlasticG * p.annualUnitsSold) / 1000;
        }
        if (p.packagingProfile?.currentPaperG != null) {
          existing.annualPaperKg += (p.packagingProfile.currentPaperG * p.annualUnitsSold) / 1000;
        }
        if (
          p.packagingProfile?.currentPlasticG != null ||
          p.packagingProfile?.currentPaperG != null
        ) {
          existing.readyCount += 1;
        }
      }

      categoryMap.set(cat, existing);
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        productCount: data.productCount,
        avgPlasticG:
          data.plasticCount > 0
            ? Math.round((data.plasticTotal / data.plasticCount) * 10) / 10
            : null,
        avgPaperG:
          data.paperCount > 0
            ? Math.round((data.paperTotal / data.paperCount) * 10) / 10
            : null,
        annualPlasticKg: Math.round(data.annualPlasticKg * 100) / 100,
        annualPaperKg: Math.round(data.annualPaperKg * 100) / 100,
        readyCount: data.readyCount,
      }))
      .sort((a, b) => b.annualPlasticKg + b.annualPaperKg - (a.annualPlasticKg + a.annualPaperKg));

    // Top products missing data (limit 15)
    const topMissingData = products
      .filter(
        (p) =>
          !p.annualUnitsSold ||
          p.annualUnitsSold <= 0 ||
          (p.packagingProfile?.currentPlasticG == null &&
            p.packagingProfile?.currentPaperG == null)
      )
      .slice(0, 15)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        productName: p.productName,
        category: p.category,
        missingSales: !p.annualUnitsSold || p.annualUnitsSold <= 0,
        missingPackaging:
          p.packagingProfile?.currentPlasticG == null &&
          p.packagingProfile?.currentPaperG == null,
      }));

    return NextResponse.json({
      reportYear,
      totalProducts,
      productsWithSales,
      productsWithPackaging,
      productsFullyReady,
      readinessPct,
      totalPlasticKg: Math.round(totalPlasticKg * 100) / 100,
      totalPaperKg: Math.round(totalPaperKg * 100) / 100,
      byCategory,
      topMissingData,
    });
  } catch (error) {
    console.error("Compliance API error:", error);
    return NextResponse.json(
      { error: "Failed to load compliance data" },
      { status: 500 }
    );
  }
}
