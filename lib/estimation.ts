import { prisma } from "./prisma";
import { PackagingStatus } from "@prisma/client";
import { mean, pearsonR, linearRegression, detectOutliers } from "./stats";

export interface EstimationResult {
  plasticG: number | null;
  paperG: number | null;
  confidenceScore: number;
  method: string;
  basedOnProductIds: string[];
}

/**
 * Main estimation function for a product.
 * Priority:
 * 1.  Own SamplingRecords (outliers excluded) — highest confidence
 * 1.5 Manufacturer-provided mfrPlasticG / mfrPaperG
 * 2.  Similar products by category/subcategory/brand/weight/price/volume
 * 2.5 Packaging-fraction from net weight: packagingG = grossWeightG − netWeightG,
 *     apply mean plastic/paper fraction from sampled reference products
 * 3.  Linear regression within category:
 *     - preferred predictor: packagingWeightG (gross − net) when available
 *     - fallback predictor:  grossWeightG
 * 3.5 Category average of manufacturer data
 * 4.  Category-level sampling average — lowest confidence
 */
export async function estimatePackaging(
  productId: string
): Promise<EstimationResult | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      samplingRecords: {
        where: { isOutlier: false }, // exclude flagged outliers
      },
    },
  });

  if (!product) return null;

  // ── Tier 1: Own sampling records (outliers already excluded by query) ──────
  if (product.samplingRecords.length > 0) {
    const plasticValues = product.samplingRecords
      .map((r) => r.measuredPlasticG)
      .filter((v): v is number => v !== null);
    const paperValues = product.samplingRecords
      .map((r) => r.measuredPaperG)
      .filter((v): v is number => v !== null);

    const plasticG = plasticValues.length > 0 ? mean(plasticValues) : null;
    const paperG = paperValues.length > 0 ? mean(paperValues) : null;
    const confidence = Math.min(0.70 + product.samplingRecords.length * 0.10, 0.95);

    return {
      plasticG,
      paperG,
      confidenceScore: confidence,
      method: `own_sampling_avg_n${product.samplingRecords.length}`,
      basedOnProductIds: [productId],
    };
  }

  // ── Tier 1.5: Manufacturer-provided packaging data (mfrPlasticG / mfrPaperG) ─
  // Direct Hersteller-Angaben are more reliable than similarity estimates.
  if (product.mfrPlasticG != null || product.mfrPaperG != null) {
    return {
      plasticG: product.mfrPlasticG ?? null,
      paperG: product.mfrPaperG ?? null,
      confidenceScore: 0.80,
      method: "manufacturer_data",
      basedOnProductIds: [productId],
    };
  }

  // ── Tier 2: Similar products with sampling data ───────────────────────────
  const similarProducts = await findSimilarProductsWithSampling(product);

  if (similarProducts.length > 0) {
    const plasticValues = similarProducts
      .flatMap((p) => p.samplingRecords.map((r) => r.measuredPlasticG))
      .filter((v): v is number => v !== null);
    const paperValues = similarProducts
      .flatMap((p) => p.samplingRecords.map((r) => r.measuredPaperG))
      .filter((v): v is number => v !== null);

    const plasticG = plasticValues.length > 0 ? mean(plasticValues) : null;
    const paperG = paperValues.length > 0 ? mean(paperValues) : null;
    const baseConfidence = computeSimilarityConfidence(product, similarProducts);

    return {
      plasticG,
      paperG,
      confidenceScore: baseConfidence,
      method: `similar_products_n${similarProducts.length}`,
      basedOnProductIds: similarProducts.map((p) => p.id),
    };
  }

  // ── Tier 2.5: Packaging-fraction estimation from known net weight ─────────
  // If we know packagingG = gross − net, apply the mean plastic/paper fraction
  // observed in sampled reference products — a much tighter physical constraint
  // than regressing on gross weight alone.
  if (product.grossWeightG && product.netWeightG) {
    const packagingG = product.grossWeightG - product.netWeightG;
    if (packagingG > 0) {
      const fractionResult = await tryPackagingFractionEstimate(
        product.category,
        product.subcategory,
        productId,
        packagingG
      );
      if (fractionResult) return fractionResult;
    }
  }

  // ── Tier 3: Regression model within category ──────────────────────────────
  // Priority: packagingWeightG (gross−net) → grossWeightG → netWeightG alone.
  // netWeightG alone is weaker but still informative: a 5 kg product ships
  // in more packaging than a 1 kg product even without knowing the exact
  // gross weight.
  if (product.category && (product.grossWeightG || product.netWeightG)) {
    const regressionResult = await tryRegressionEstimate(
      product.category,
      productId,
      product.grossWeightG,
      product.netWeightG
    );
    if (regressionResult) return regressionResult;
  }

  // ── Tier 3.5: Category average from other products' manufacturer data ─────
  // Fills the gap when no sampling data exists but sibling products have MFR values.
  // E.g. 10 Ketchup products — 2 have mfrPlasticG → other 8 can use their average.
  // Uses subcategory first (most specific), falls back to main category.
  if (product.category) {
    const mfrCategoryFilters = product.subcategory
      ? [{ subcategory: product.subcategory }, { category: product.category }]
      : [{ category: product.category }];

    for (const categoryFilter of mfrCategoryFilters) {
      const mfrProducts = await prisma.product.findMany({
        where: {
          ...categoryFilter,
          id: { not: productId },
          samplingRecords: { none: {} },
          OR: [{ mfrPlasticG: { not: null } }, { mfrPaperG: { not: null } }],
        },
        select: { id: true, mfrPlasticG: true, mfrPaperG: true },
        take: 20,
      });

      if (mfrProducts.length > 0) {
        const plasticValues = mfrProducts
          .map((p) => p.mfrPlasticG)
          .filter((v): v is number => v !== null);
        const paperValues = mfrProducts
          .map((p) => p.mfrPaperG)
          .filter((v): v is number => v !== null);

        const level = "subcategory" in categoryFilter ? "subcategory" : "category";
        return {
          plasticG: plasticValues.length > 0 ? mean(plasticValues) : null,
          paperG: paperValues.length > 0 ? mean(paperValues) : null,
          confidenceScore: 0.25,
          method: `${level}_mfr_avg_n${mfrProducts.length}`,
          basedOnProductIds: mfrProducts.map((p) => p.id),
        };
      }
    }
  }

  // ── Tier 4: Category-level average ────────────────────────────────────────
  // Uses subcategory first (most specific), falls back to main category.
  if (product.category) {
    const categoryFilters = product.subcategory
      ? [{ subcategory: product.subcategory }, { category: product.category }]
      : [{ category: product.category }];

    for (const categoryFilter of categoryFilters) {
      const categoryProducts = await prisma.product.findMany({
        where: {
          ...categoryFilter,
          id: { not: productId },
          samplingRecords: { some: { isOutlier: false } },
        },
        include: {
          samplingRecords: {
            where: { isOutlier: false },
            select: { measuredPlasticG: true, measuredPaperG: true },
          },
        },
        take: 50,
      });

      if (categoryProducts.length > 0) {
        const plasticValues = categoryProducts
          .flatMap((p) => p.samplingRecords.map((r) => r.measuredPlasticG))
          .filter((v): v is number => v !== null);
        const paperValues = categoryProducts
          .flatMap((p) => p.samplingRecords.map((r) => r.measuredPaperG))
          .filter((v): v is number => v !== null);

        const level = "subcategory" in categoryFilter ? "subcategory" : "category";
        return {
          plasticG: plasticValues.length > 0 ? mean(plasticValues) : null,
          paperG: paperValues.length > 0 ? mean(paperValues) : null,
          confidenceScore: 0.2,
          method: `${level}_avg_n${categoryProducts.length}`,
          basedOnProductIds: categoryProducts.map((p) => p.id),
        };
      }
    }
  }

  return null;
}

/**
 * Tier 2.5 helper: apply the mean plastic/paper fraction from sampled reference
 * products to a known packagingG = grossWeightG − netWeightG.
 * Tries subcategory first, falls back to category.
 * Requires ≥2 reference products with both gross/net weights and sampling records.
 */
async function tryPackagingFractionEstimate(
  category: string | null,
  subcategory: string | null,
  excludeId: string,
  packagingG: number
): Promise<EstimationResult | null> {
  if (!category) return null;

  const filters = subcategory
    ? [{ subcategory } as Record<string, unknown>, { category } as Record<string, unknown>]
    : [{ category } as Record<string, unknown>];

  for (const filter of filters) {
    const refProducts = await prisma.product.findMany({
      where: {
        ...filter,
        id: { not: excludeId },
        grossWeightG: { not: null },
        netWeightG: { not: null },
        samplingRecords: { some: { isOutlier: false } },
      },
      select: {
        id: true,
        grossWeightG: true,
        netWeightG: true,
        samplingRecords: {
          where: { isOutlier: false },
          select: { measuredPlasticG: true, measuredPaperG: true },
        },
      },
      take: 50,
    });

    const plasticFractions: number[] = [];
    const paperFractions: number[] = [];
    const ids: string[] = [];

    for (const p of refProducts) {
      if (!p.grossWeightG || !p.netWeightG) continue;
      const refPackW = p.grossWeightG - p.netWeightG;
      if (refPackW <= 0) continue;

      const pVals = p.samplingRecords
        .map((r) => r.measuredPlasticG)
        .filter((v): v is number => v !== null);
      if (pVals.length === 0) continue;

      plasticFractions.push(mean(pVals) / refPackW);
      ids.push(p.id);

      const paVals = p.samplingRecords
        .map((r) => r.measuredPaperG)
        .filter((v): v is number => v !== null);
      if (paVals.length > 0) paperFractions.push(mean(paVals) / refPackW);
    }

    if (plasticFractions.length < 2) continue;

    const level = "subcategory" in filter ? "subcategory" : "category";
    const confidence = Math.min(
      (level === "subcategory" ? 0.50 : 0.42) + plasticFractions.length * 0.02,
      level === "subcategory" ? 0.65 : 0.60
    );

    return {
      plasticG: Math.round(mean(plasticFractions) * packagingG * 10) / 10,
      paperG:
        paperFractions.length > 0
          ? Math.round(mean(paperFractions) * packagingG * 10) / 10
          : null,
      confidenceScore: confidence,
      method: `${level}_packaging_fraction_n${plasticFractions.length}`,
      basedOnProductIds: ids,
    };
  }

  return null;
}

/**
 * Tier 3 helper: linear regression on category data.
 * Three predictor strategies tried in order:
 *   1. packagingWeightG = gross − net  (best physical signal, r² ≥ 0.4/0.3)
 *   2. grossWeightG alone              (classic fallback,      r² ≥ 0.4/0.3)
 *   3. netWeightG alone                (last resort when only net is known,
 *                                       weaker but still informative — a 5 kg
 *                                       product ships in more packaging than
 *                                       a 1 kg product,         r² ≥ 0.35/0.25)
 */
async function tryRegressionEstimate(
  category: string,
  excludeId: string,
  grossWeightG: number | null,
  netWeightG?: number | null
): Promise<EstimationResult | null> {
  // Single query covers all three strategies; each filters the relevant subset.
  const catProducts = await prisma.product.findMany({
    where: {
      category,
      id: { not: excludeId },
      samplingRecords: { some: { isOutlier: false } },
      OR: [{ grossWeightG: { not: null } }, { netWeightG: { not: null } }],
    },
    select: {
      id: true,
      grossWeightG: true,
      netWeightG: true,
      samplingRecords: {
        where: { isOutlier: false },
        select: { measuredPlasticG: true, measuredPaperG: true },
      },
    },
    take: 100,
  });

  // Shared helper to run one regression attempt and return an EstimationResult.
  function runRegression(
    xs: number[],
    plasticYs: number[],
    paperYs: number[],
    ids: string[],
    predictX: number,
    methodPrefix: string,
    plasticR2Min: number,
    paperR2Min: number,
    maxConfidence: number,
    confidenceBase: number
  ): EstimationResult | null {
    if (xs.length < 5) return null;
    const pm = linearRegression(xs, plasticYs);
    const paM = paperYs.length === xs.length ? linearRegression(xs, paperYs) : null;
    const plasticOk = pm != null && pm.r2 >= plasticR2Min;
    const paperOk = paM != null && paM.r2 >= paperR2Min;
    if (!plasticOk && !paperOk) return null;
    const predictedPlastic = plasticOk ? Math.max(0, pm!.a + pm!.b * predictX) : null;
    if (plasticOk && predictedPlastic! < 0) return null;
    const predictedPaper = paperOk ? Math.max(0, paM!.a + paM!.b * predictX) : null;
    const bestR2 = Math.max(plasticOk ? pm!.r2 : 0, paperOk ? paM!.r2 : 0);
    const confidence = Math.min(Math.round((confidenceBase + bestR2 * 0.5) * 100) / 100, maxConfidence);
    const parts: string[] = [];
    if (plasticOk) parts.push(`plastic_r2=${Math.round(pm!.r2 * 100)}`);
    if (paperOk) parts.push(`paper_r2=${Math.round(paM!.r2 * 100)}`);
    return {
      plasticG: predictedPlastic !== null ? Math.round(predictedPlastic * 10) / 10 : null,
      paperG: predictedPaper !== null ? Math.round(predictedPaper * 10) / 10 : null,
      confidenceScore: confidence,
      method: `${methodPrefix}_${parts.join("_")}_n${xs.length}`,
      basedOnProductIds: ids,
    };
  }

  // ── Attempt 1: packagingWeightG = gross − net ─────────────────────────────
  if (grossWeightG != null && netWeightG != null) {
    const targetPackW = grossWeightG - netWeightG;
    if (targetPackW > 0) {
      const xs: number[] = [], pYs: number[] = [], paYs: number[] = [], ids: string[] = [];
      for (const p of catProducts) {
        if (!p.grossWeightG || !p.netWeightG) continue;
        const refPack = p.grossWeightG - p.netWeightG;
        if (refPack <= 0) continue;
        const pv = p.samplingRecords.map((r) => r.measuredPlasticG).filter((v): v is number => v !== null);
        if (pv.length === 0) continue;
        xs.push(refPack); pYs.push(mean(pv)); ids.push(p.id);
        const pav = p.samplingRecords.map((r) => r.measuredPaperG).filter((v): v is number => v !== null);
        paYs.push(pav.length > 0 ? mean(pav) : 0);
      }
      const result = runRegression(xs, pYs, paYs, ids, targetPackW, "regression_packaging_weight", 0.4, 0.3, 0.72, 0.25);
      if (result) return result;
    }
  }

  // ── Attempt 2: grossWeightG alone ─────────────────────────────────────────
  if (grossWeightG != null) {
    const xs: number[] = [], pYs: number[] = [], paYs: number[] = [], ids: string[] = [];
    for (const p of catProducts) {
      if (!p.grossWeightG) continue;
      const pv = p.samplingRecords.map((r) => r.measuredPlasticG).filter((v): v is number => v !== null);
      if (pv.length === 0) continue;
      xs.push(p.grossWeightG); pYs.push(mean(pv)); ids.push(p.id);
      const pav = p.samplingRecords.map((r) => r.measuredPaperG).filter((v): v is number => v !== null);
      paYs.push(pav.length > 0 ? mean(pav) : 0);
    }
    const result = runRegression(xs, pYs, paYs, ids, grossWeightG, "regression_gross_weight", 0.4, 0.3, 0.70, 0.20);
    if (result) return result;
  }

  // ── Attempt 3: netWeightG alone (weaker signal, lower r² threshold) ───────
  if (netWeightG != null) {
    const xs: number[] = [], pYs: number[] = [], paYs: number[] = [], ids: string[] = [];
    for (const p of catProducts) {
      if (!p.netWeightG) continue;
      const pv = p.samplingRecords.map((r) => r.measuredPlasticG).filter((v): v is number => v !== null);
      if (pv.length === 0) continue;
      xs.push(p.netWeightG); pYs.push(mean(pv)); ids.push(p.id);
      const pav = p.samplingRecords.map((r) => r.measuredPaperG).filter((v): v is number => v !== null);
      paYs.push(pav.length > 0 ? mean(pav) : 0);
    }
    const result = runRegression(xs, pYs, paYs, ids, netWeightG, "regression_net_weight", 0.35, 0.25, 0.62, 0.15);
    if (result) return result;
  }

  return null;
}

interface ProductWithSampling {
  id: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  manufacturer: string | null;
  ekPrice: number | null;
  netWeightG: number | null;
  grossWeightG: number | null;
  grossLengthMm: number | null;
  grossWidthMm: number | null;
  grossHeightMm: number | null;
  samplingRecords: {
    measuredPlasticG: number | null;
    measuredPaperG: number | null;
  }[];
}

async function findSimilarProductsWithSampling(
  product: ProductWithSampling
): Promise<ProductWithSampling[]> {
  const where: Record<string, unknown> = {
    id: { not: product.id },
    samplingRecords: { some: { isOutlier: false } },
  };

  const orConditions: Record<string, unknown>[] = [];

  if (product.subcategory) orConditions.push({ subcategory: product.subcategory });
  if (product.brand && product.category)
    orConditions.push({ brand: product.brand, category: product.category });
  if (product.manufacturer && product.category)
    orConditions.push({ manufacturer: product.manufacturer, category: product.category });
  if (product.category && product.ekPrice)
    orConditions.push({
      category: product.category,
      ekPrice: { gte: product.ekPrice * 0.7, lte: product.ekPrice * 1.3 },
    });
  if (product.category && product.grossWeightG)
    orConditions.push({
      category: product.category,
      grossWeightG: {
        gte: product.grossWeightG * 0.75,
        lte: product.grossWeightG * 1.25,
      },
    });
  if (product.category && product.netWeightG)
    orConditions.push({
      category: product.category,
      netWeightG: {
        gte: product.netWeightG * 0.75,
        lte: product.netWeightG * 1.25,
      },
    });
  if (orConditions.length === 0 && product.category)
    orConditions.push({ category: product.category });
  if (orConditions.length === 0) return [];

  where.OR = orConditions;

  const results = await prisma.product.findMany({
    where,
    include: {
      samplingRecords: {
        where: { isOutlier: false },
        select: { measuredPlasticG: true, measuredPaperG: true },
      },
    },
    take: 20,
  });

  // Drop any candidate whose records all turned out outliers (empty after filter)
  return results.filter(
    (p) => p.samplingRecords.length > 0
  ) as unknown as ProductWithSampling[];
}

function computeSimilarityConfidence(
  product: ProductWithSampling,
  similarProducts: ProductWithSampling[]
): number {
  if (similarProducts.length === 0) return 0.1;

  let maxScore = 0;
  for (const similar of similarProducts) {
    let score = 0;

    if (product.subcategory && similar.subcategory === product.subcategory) score += 3;
    if (product.category && similar.category === product.category) score += 2;
    if (product.brand && similar.brand === product.brand) score += 2;
    if (product.manufacturer && similar.manufacturer === product.manufacturer) score += 1;

    if (product.ekPrice && similar.ekPrice) {
      const d = Math.abs(product.ekPrice - similar.ekPrice) / product.ekPrice;
      if (d < 0.1) score += 2;
      else if (d < 0.3) score += 1;
    }
    if (product.grossWeightG && similar.grossWeightG) {
      const d =
        Math.abs(product.grossWeightG - similar.grossWeightG) / product.grossWeightG;
      if (d < 0.1) score += 2;
      else if (d < 0.25) score += 1;
    }
    if (product.netWeightG && similar.netWeightG) {
      const d = Math.abs(product.netWeightG - similar.netWeightG) / product.netWeightG;
      if (d < 0.1) score += 2;
      else if (d < 0.25) score += 1;
    }

    const pVol =
      product.grossLengthMm && product.grossWidthMm && product.grossHeightMm
        ? product.grossLengthMm * product.grossWidthMm * product.grossHeightMm
        : null;
    const sVol =
      similar.grossLengthMm && similar.grossWidthMm && similar.grossHeightMm
        ? similar.grossLengthMm * similar.grossWidthMm * similar.grossHeightMm
        : null;
    if (pVol && sVol) {
      const d = Math.abs(pVol - sVol) / pVol;
      if (d < 0.1) score += 3;
      else if (d < 0.25) score += 2;
      else if (d < 0.5) score += 1;
    }

    const pPackW =
      product.grossWeightG && product.netWeightG
        ? product.grossWeightG - product.netWeightG
        : null;
    const sPackW =
      similar.grossWeightG && similar.netWeightG
        ? similar.grossWeightG - similar.netWeightG
        : null;
    if (pPackW && sPackW && pVol && sVol) {
      const pRatio = pPackW / pVol;
      const sRatio = sPackW / sVol;
      if (pRatio > 0 && sRatio > 0) {
        const d = Math.abs(pRatio - sRatio) / pRatio;
        if (d < 0.15) score += 2;
        else if (d < 0.35) score += 1;
      }
    }

    maxScore = Math.max(maxScore, score);
  }

  const normalized = Math.min(maxScore / 20, 1);
  return Math.round((0.2 + normalized * 0.58) * 100) / 100;
}

/**
 * Called after a new SamplingRecord is created.
 * 1. Re-runs outlier detection across ALL of the product's own records.
 * 2. Updates the ProductPackagingProfile (with accuracy tracking on ESTIMATED→SAMPLED).
 * 3. Logs the change to ProductEstimateHistory.
 */
export async function updateProfileAfterSampling(productId: string): Promise<void> {
  // ── Step 1: Re-evaluate outliers on all own records ──────────────────────
  await redetectOutliersForProduct(productId);

  const existing = await prisma.productPackagingProfile.findUnique({
    where: { productId },
  });

  const result = await estimatePackaging(productId);
  if (!result) return;

  const oldPlasticG = existing?.currentPlasticG ?? null;
  const oldPaperG = existing?.currentPaperG ?? null;
  const isMeasured = result.method.startsWith("own_sampling");

  // ── Step 2: Accuracy tracking (ESTIMATED → SAMPLED transition) ───────────
  let estimationErrorPct: number | null = null;
  if (
    isMeasured &&
    existing?.status === PackagingStatus.ESTIMATED &&
    existing.estimatedPlasticG != null &&
    result.plasticG != null &&
    result.plasticG > 0
  ) {
    estimationErrorPct =
      Math.round(
        ((existing.estimatedPlasticG - result.plasticG) / result.plasticG) * 1000
      ) / 10;
  }

  await prisma.productPackagingProfile.upsert({
    where: { productId },
    create: {
      productId,
      status: isMeasured ? PackagingStatus.SAMPLED : PackagingStatus.ESTIMATED,
      currentPlasticG: result.plasticG,
      currentPaperG: result.paperG,
      measuredPlasticG: isMeasured ? result.plasticG : undefined,
      measuredPaperG: isMeasured ? result.paperG : undefined,
      estimatedPlasticG: isMeasured ? undefined : result.plasticG,
      estimatedPaperG: isMeasured ? undefined : result.paperG,
      confidenceScore: result.confidenceScore,
      estimationMethod: result.method,
      estimationErrorPct: estimationErrorPct ?? undefined,
    },
    update: {
      status: isMeasured ? PackagingStatus.SAMPLED : PackagingStatus.ESTIMATED,
      currentPlasticG: result.plasticG,
      currentPaperG: result.paperG,
      measuredPlasticG: isMeasured ? result.plasticG : undefined,
      measuredPaperG: isMeasured ? result.paperG : undefined,
      estimatedPlasticG: isMeasured ? undefined : result.plasticG,
      estimatedPaperG: isMeasured ? undefined : result.paperG,
      confidenceScore: result.confidenceScore,
      estimationMethod: result.method,
      ...(estimationErrorPct !== null ? { estimationErrorPct } : {}),
    },
  });

  if (oldPlasticG !== result.plasticG || oldPaperG !== result.paperG) {
    await prisma.productEstimateHistory.create({
      data: {
        productId,
        oldPlasticG,
        oldPaperG,
        newPlasticG: result.plasticG,
        newPaperG: result.paperG,
        reason: isMeasured
          ? estimationErrorPct !== null
            ? `Erste Wiegung — Schätzfehler war ${estimationErrorPct > 0 ? "+" : ""}${estimationErrorPct}%`
            : "Neue Stichprobe hinzugefügt"
          : "Re-Schätzung aus ähnlichen Produkten",
        method: result.method,
      },
    });
  }
}

/**
 * Re-runs IQR + Z-Score outlier detection across all SamplingRecords
 * (measuredPlasticG) for a product and persists the flags.
 * Only updates records whose flag actually changed to avoid noisy writes.
 */
export async function redetectOutliersForProduct(productId: string): Promise<void> {
  const records = await prisma.samplingRecord.findMany({
    where: { productId },
    select: { id: true, measuredPlasticG: true, isOutlier: true },
    orderBy: { sampledAt: "asc" },
  });

  const withValues = records.filter((r) => r.measuredPlasticG !== null);
  if (withValues.length < 3) return; // not enough data for statistics

  const values = withValues.map((r) => r.measuredPlasticG as number);
  const results = detectOutliers(values);

  for (let i = 0; i < withValues.length; i++) {
    const { isOutlier, reason } = results[i];
    if (isOutlier !== withValues[i].isOutlier) {
      await prisma.samplingRecord.update({
        where: { id: withValues[i].id },
        data: { isOutlier, outlierReason: reason },
      });
    }
  }
}

/**
 * A: Re-Estimation Cascade
 * After a new weighing is recorded, re-estimate all ESTIMATED products in the same
 * category so they immediately benefit from the new reference data.
 * Capped at 100 products. Returns the count of products actually updated.
 */
export async function cascadeReestimateCategory(
  category: string,
  excludeProductId: string
): Promise<number> {
  // Include IMPORTED and null-profile products, not just ESTIMATED.
  // This covers cases where new MFR data makes previously un-estimable
  // siblings (e.g. the other 8 Ketchup products) estimable for the first time.
  const toReestimate = await prisma.product.findMany({
    where: {
      category,
      id: { not: excludeProductId },
      samplingRecords: { none: {} },
      OR: [
        { packagingProfile: { status: { in: [PackagingStatus.ESTIMATED, PackagingStatus.IMPORTED] } } },
        { packagingProfile: null },
      ],
    },
    include: { packagingProfile: true },
    take: 100,
  });

  let updatedCount = 0;

  for (const p of toReestimate) {
    const result = await estimatePackaging(p.id);
    if (!result) continue;

    const old = p.packagingProfile;

    const plasticShift =
      old?.currentPlasticG && result.plasticG
        ? Math.abs(old.currentPlasticG - result.plasticG) / old.currentPlasticG
        : old?.currentPlasticG !== result.plasticG
          ? 1
          : 0;

    const confidenceImproved =
      (result.confidenceScore ?? 0) > (old?.confidenceScore ?? 0) + 0.01;

    // Always update if no prior estimate existed (old is null or no currentPlasticG)
    const isNew = !old || old.currentPlasticG == null;

    if (isNew || plasticShift > 0.02 || confidenceImproved) {
      await prisma.productPackagingProfile.upsert({
        where: { productId: p.id },
        create: {
          productId: p.id,
          status: PackagingStatus.ESTIMATED,
          currentPlasticG: result.plasticG,
          currentPaperG: result.paperG,
          estimatedPlasticG: result.plasticG,
          estimatedPaperG: result.paperG,
          confidenceScore: result.confidenceScore,
          estimationMethod: result.method,
        },
        update: {
          status: PackagingStatus.ESTIMATED,
          currentPlasticG: result.plasticG,
          currentPaperG: result.paperG,
          estimatedPlasticG: result.plasticG,
          estimatedPaperG: result.paperG,
          confidenceScore: result.confidenceScore,
          estimationMethod: result.method,
        },
      });
      updatedCount++;
    }
  }

  return updatedCount;
}
