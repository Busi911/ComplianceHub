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
 * 1. Own SamplingRecords (outliers excluded) — highest confidence
 * 2. Similar products by category/subcategory/brand/weight/price/volume
 * 3. Linear regression: grossWeightG → plasticG in category (r² ≥ 0.4, n ≥ 5)
 * 4. Category average — lowest confidence
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
    const confidence = Math.min(0.5 + product.samplingRecords.length * 0.15, 0.95);

    return {
      plasticG,
      paperG,
      confidenceScore: confidence,
      method: `own_sampling_avg_n${product.samplingRecords.length}`,
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

  // ── Tier 3: Regression model (grossWeightG → plasticG) within category ────
  if (product.category && product.grossWeightG) {
    const regressionResult = await tryRegressionEstimate(
      product.category,
      productId,
      product.grossWeightG
    );
    if (regressionResult) return regressionResult;
  }

  // ── Tier 4: Category-level average ────────────────────────────────────────
  if (product.category) {
    const categoryProducts = await prisma.product.findMany({
      where: {
        category: product.category,
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

      return {
        plasticG: plasticValues.length > 0 ? mean(plasticValues) : null,
        paperG: paperValues.length > 0 ? mean(paperValues) : null,
        confidenceScore: 0.2,
        method: `category_avg_n${categoryProducts.length}`,
        basedOnProductIds: categoryProducts.map((p) => p.id),
      };
    }
  }

  return null;
}

/**
 * Tier 3 helper: linear regression on category data.
 * Requires ≥5 data points and r² ≥ 0.4.
 * Confidence = 0.20 + r2 × 0.50  (range: 0.40–0.70)
 */
async function tryRegressionEstimate(
  category: string,
  excludeId: string,
  grossWeightG: number
): Promise<EstimationResult | null> {
  const catProducts = await prisma.product.findMany({
    where: {
      category,
      id: { not: excludeId },
      grossWeightG: { not: null },
      samplingRecords: { some: { isOutlier: false } },
    },
    select: {
      id: true,
      grossWeightG: true,
      samplingRecords: {
        where: { isOutlier: false },
        select: { measuredPlasticG: true, measuredPaperG: true },
      },
    },
    take: 100,
  });

  const xs: number[] = [];
  const plasticYs: number[] = [];
  const paperYs: number[] = [];

  for (const p of catProducts) {
    if (!p.grossWeightG) continue;
    const pVals = p.samplingRecords
      .map((r) => r.measuredPlasticG)
      .filter((v): v is number => v !== null);
    if (pVals.length === 0) continue;
    xs.push(p.grossWeightG);
    plasticYs.push(mean(pVals));
    const paVals = p.samplingRecords
      .map((r) => r.measuredPaperG)
      .filter((v): v is number => v !== null);
    paperYs.push(paVals.length > 0 ? mean(paVals) : 0);
  }

  if (xs.length < 5) return null;

  const plasticModel = linearRegression(xs, plasticYs);
  if (!plasticModel || plasticModel.r2 < 0.4) return null;

  const predictedPlastic = plasticModel.a + plasticModel.b * grossWeightG;
  if (predictedPlastic < 0) return null;

  let predictedPaper: number | null = null;
  if (paperYs.length === xs.length) {
    const paperModel = linearRegression(xs, paperYs);
    if (paperModel && paperModel.r2 >= 0.3) {
      predictedPaper = Math.max(0, paperModel.a + paperModel.b * grossWeightG);
    }
  }

  const confidence = Math.round((0.2 + plasticModel.r2 * 0.5) * 100) / 100;

  return {
    plasticG: Math.round(predictedPlastic * 10) / 10,
    paperG: predictedPaper !== null ? Math.round(predictedPaper * 10) / 10 : null,
    confidenceScore: Math.min(confidence, 0.70),
    method: `regression_gross_weight_r2=${Math.round(plasticModel.r2 * 100)}_n${xs.length}`,
    basedOnProductIds: catProducts.map((p) => p.id),
  };
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
 * Capped at 40 products. Returns the count of products actually updated.
 */
export async function cascadeReestimateCategory(
  category: string,
  excludeProductId: string
): Promise<number> {
  const toReestimate = await prisma.product.findMany({
    where: {
      category,
      id: { not: excludeProductId },
      samplingRecords: { none: {} },
      packagingProfile: { status: PackagingStatus.ESTIMATED },
    },
    include: { packagingProfile: true },
    take: 40,
  });

  let updatedCount = 0;

  for (const p of toReestimate) {
    const result = await estimatePackaging(p.id);
    if (!result) continue;

    const old = p.packagingProfile;
    if (!old) continue;

    const plasticShift =
      old.currentPlasticG && result.plasticG
        ? Math.abs(old.currentPlasticG - result.plasticG) / old.currentPlasticG
        : old.currentPlasticG !== result.plasticG
          ? 1
          : 0;

    const confidenceImproved =
      (result.confidenceScore ?? 0) > (old.confidenceScore ?? 0) + 0.01;

    if (plasticShift > 0.02 || confidenceImproved) {
      await prisma.productPackagingProfile.update({
        where: { productId: p.id },
        data: {
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
