import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pearsonR, linearRegression, mean, stdDev, detectOutliers } from "@/lib/stats";

export interface CategoryCorrelation {
  category: string;
  n: number; // number of products with own (non-outlier) samples
  outlierCount: number; // total outlier records across category
  correlations: {
    grossWeightVsPlastic: number | null;
    netWeightVsPlastic: number | null;
    ekPriceVsPlastic: number | null;
    volumeVsPlastic: number | null;
    grossWeightVsPaper: number | null;
  };
  regressionPlastic: {
    a: number;
    b: number;
    r2: number;
    usable: boolean; // r2 >= 0.4 && n >= 5
  } | null;
  cvPlastic: number | null; // coefficient of variation (std/mean) of plastic values — spread indicator
}

export async function GET() {
  try {
    // Load all sampled products with their non-outlier records and product attributes
    const products = await prisma.product.findMany({
      where: { samplingRecords: { some: { isOutlier: false } } },
      select: {
        id: true,
        category: true,
        grossWeightG: true,
        netWeightG: true,
        ekPrice: true,
        grossLengthMm: true,
        grossWidthMm: true,
        grossHeightMm: true,
        samplingRecords: {
          select: {
            measuredPlasticG: true,
            measuredPaperG: true,
            isOutlier: true,
          },
        },
      },
    });

    // Count total outlier records per category
    const outlierRecords = await prisma.samplingRecord.groupBy({
      by: ["productId"],
      where: { isOutlier: true },
      _count: { id: true },
    });
    const outlierCountByProduct = new Map<string, number>(
      outlierRecords.map((r) => [r.productId, r._count.id])
    );

    // Group products by category
    const byCategory = new Map<
      string,
      {
        grossWeights: number[];
        netWeights: number[];
        ekPrices: number[];
        volumes: number[];
        plasticMeans: number[];
        paperMeans: number[];
        outlierCount: number;
      }
    >();

    for (const p of products) {
      if (!p.category) continue;

      const nonOutlierRecords = p.samplingRecords.filter((r) => !r.isOutlier);
      const plasticVals = nonOutlierRecords
        .map((r) => r.measuredPlasticG)
        .filter((v): v is number => v !== null);
      if (plasticVals.length === 0) continue;

      const avgPlastic = mean(plasticVals);
      const paperVals = nonOutlierRecords
        .map((r) => r.measuredPaperG)
        .filter((v): v is number => v !== null);
      const avgPaper = paperVals.length > 0 ? mean(paperVals) : null;

      const volume =
        p.grossLengthMm && p.grossWidthMm && p.grossHeightMm
          ? p.grossLengthMm * p.grossWidthMm * p.grossHeightMm
          : null;

      if (!byCategory.has(p.category)) {
        byCategory.set(p.category, {
          grossWeights: [],
          netWeights: [],
          ekPrices: [],
          volumes: [],
          plasticMeans: [],
          paperMeans: [],
          outlierCount: 0,
        });
      }
      const cat = byCategory.get(p.category)!;

      cat.plasticMeans.push(avgPlastic);
      if (avgPaper !== null) cat.paperMeans.push(avgPaper);
      if (p.grossWeightG) cat.grossWeights.push(p.grossWeightG);
      else cat.grossWeights.push(NaN); // placeholder for index alignment
      if (p.netWeightG) cat.netWeights.push(p.netWeightG);
      else cat.netWeights.push(NaN);
      if (p.ekPrice) cat.ekPrices.push(p.ekPrice);
      else cat.ekPrices.push(NaN);
      if (volume) cat.volumes.push(volume);
      else cat.volumes.push(NaN);

      cat.outlierCount += outlierCountByProduct.get(p.id) ?? 0;
    }

    const result: CategoryCorrelation[] = [];

    for (const [category, data] of byCategory.entries()) {
      const n = data.plasticMeans.length;
      if (n < 3) continue;

      // Build clean paired arrays (drop NaN placeholders for correlation inputs)
      function cleanPair(xs: number[], ys: number[]) {
        const pairs = xs
          .map((x, i) => [x, ys[i]] as [number, number])
          .filter(([x, y]) => !isNaN(x) && !isNaN(y));
        return { xs: pairs.map((p) => p[0]), ys: pairs.map((p) => p[1]) };
      }

      const gwPair = cleanPair(data.grossWeights, data.plasticMeans);
      const nwPair = cleanPair(data.netWeights, data.plasticMeans);
      const epPair = cleanPair(data.ekPrices, data.plasticMeans);
      const volPair = cleanPair(data.volumes, data.plasticMeans);
      const paperPair = cleanPair(data.grossWeights, data.paperMeans);

      const regressionInput = gwPair.xs.length >= 5
        ? linearRegression(gwPair.xs, gwPair.ys)
        : null;

      const cvPlastic =
        data.plasticMeans.length >= 3
          ? (() => {
              const m = mean(data.plasticMeans);
              const sd = stdDev(data.plasticMeans, m);
              return m > 0 ? Math.round((sd / m) * 1000) / 10 : null;
            })()
          : null;

      // Re-run outlier detection on the per-category plastic distribution
      const catOutlierResults = n >= 3 ? detectOutliers(data.plasticMeans) : null;
      const catOutlierCount = catOutlierResults
        ? catOutlierResults.filter((r) => r.isOutlier).length
        : 0;

      result.push({
        category,
        n,
        outlierCount: data.outlierCount + catOutlierCount,
        correlations: {
          grossWeightVsPlastic: pearsonR(gwPair.xs, gwPair.ys),
          netWeightVsPlastic: pearsonR(nwPair.xs, nwPair.ys),
          ekPriceVsPlastic: pearsonR(epPair.xs, epPair.ys),
          volumeVsPlastic: pearsonR(volPair.xs, volPair.ys),
          grossWeightVsPaper: pearsonR(paperPair.xs, paperPair.ys),
        },
        regressionPlastic: regressionInput
          ? {
              ...regressionInput,
              usable: regressionInput.r2 >= 0.4 && gwPair.xs.length >= 5,
            }
          : null,
        cvPlastic,
      });
    }

    // Sort by most data
    result.sort((a, b) => b.n - a.n);

    return NextResponse.json({ categories: result, computedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Correlations error:", error);
    return NextResponse.json(
      { error: "Failed to compute correlations" },
      { status: 500 }
    );
  }
}
