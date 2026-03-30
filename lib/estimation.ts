import { prisma } from "./prisma";
import { PackagingStatus } from "@prisma/client";

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
 * 1. Own SamplingRecords (highest confidence)
 * 2. Similar products by category/subcategory/brand/manufacturer/weight/price/volume
 * 3. Category average
 */
export async function estimatePackaging(
  productId: string
): Promise<EstimationResult | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { samplingRecords: true },
  });

  if (!product) return null;

  // 1. Own sampling records
  if (product.samplingRecords.length > 0) {
    const plasticValues = product.samplingRecords
      .map((r) => r.measuredPlasticG)
      .filter((v): v is number => v !== null);
    const paperValues = product.samplingRecords
      .map((r) => r.measuredPaperG)
      .filter((v): v is number => v !== null);

    const plasticG =
      plasticValues.length > 0
        ? plasticValues.reduce((a, b) => a + b, 0) / plasticValues.length
        : null;
    const paperG =
      paperValues.length > 0
        ? paperValues.reduce((a, b) => a + b, 0) / paperValues.length
        : null;

    const confidence = Math.min(0.5 + product.samplingRecords.length * 0.15, 0.95);
    return {
      plasticG,
      paperG,
      confidenceScore: confidence,
      method: `own_sampling_avg_n${product.samplingRecords.length}`,
      basedOnProductIds: [productId],
    };
  }

  // 2. Similar products with sampling data
  const similarProducts = await findSimilarProductsWithSampling(product);

  if (similarProducts.length > 0) {
    const plasticValues = similarProducts
      .flatMap((p) => p.samplingRecords.map((r) => r.measuredPlasticG))
      .filter((v): v is number => v !== null);
    const paperValues = similarProducts
      .flatMap((p) => p.samplingRecords.map((r) => r.measuredPaperG))
      .filter((v): v is number => v !== null);

    const plasticG =
      plasticValues.length > 0
        ? plasticValues.reduce((a, b) => a + b, 0) / plasticValues.length
        : null;
    const paperG =
      paperValues.length > 0
        ? paperValues.reduce((a, b) => a + b, 0) / paperValues.length
        : null;

    const baseConfidence = computeSimilarityConfidence(product, similarProducts);
    return {
      plasticG,
      paperG,
      confidenceScore: baseConfidence,
      method: `similar_products_n${similarProducts.length}`,
      basedOnProductIds: similarProducts.map((p) => p.id),
    };
  }

  // 3. Category-level average from all sampled products
  if (product.category) {
    const categoryProducts = await prisma.product.findMany({
      where: {
        category: product.category,
        id: { not: productId },
        samplingRecords: { some: {} },
      },
      include: { samplingRecords: true },
      take: 50,
    });

    if (categoryProducts.length > 0) {
      const plasticValues = categoryProducts
        .flatMap((p) => p.samplingRecords.map((r) => r.measuredPlasticG))
        .filter((v): v is number => v !== null);
      const paperValues = categoryProducts
        .flatMap((p) => p.samplingRecords.map((r) => r.measuredPaperG))
        .filter((v): v is number => v !== null);

      const plasticG =
        plasticValues.length > 0
          ? plasticValues.reduce((a, b) => a + b, 0) / plasticValues.length
          : null;
      const paperG =
        paperValues.length > 0
          ? paperValues.reduce((a, b) => a + b, 0) / paperValues.length
          : null;

      return {
        plasticG,
        paperG,
        confidenceScore: 0.2,
        method: `category_avg_n${categoryProducts.length}`,
        basedOnProductIds: categoryProducts.map((p) => p.id),
      };
    }
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
    samplingRecords: { some: {} },
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
      grossWeightG: { gte: product.grossWeightG * 0.75, lte: product.grossWeightG * 1.25 },
    });
  if (orConditions.length === 0 && product.category)
    orConditions.push({ category: product.category });
  if (orConditions.length === 0) return [];

  where.OR = orConditions;

  const results = await prisma.product.findMany({
    where,
    include: { samplingRecords: { select: { measuredPlasticG: true, measuredPaperG: true } } },
    take: 20,
  });

  return results as unknown as ProductWithSampling[];
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
      const d = Math.abs(product.grossWeightG - similar.grossWeightG) / product.grossWeightG;
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
 * Updates the ProductPackagingProfile, tracks estimation accuracy, and logs the change.
 */
export async function updateProfileAfterSampling(productId: string): Promise<void> {
  const existing = await prisma.productPackagingProfile.findUnique({
    where: { productId },
  });

  const result = await estimatePackaging(productId);
  if (!result) return;

  const oldPlasticG = existing?.currentPlasticG ?? null;
  const oldPaperG = existing?.currentPaperG ?? null;
  const isMeasured = result.method.startsWith("own_sampling");

  // B: Accuracy tracking — compute estimation error when transitioning ESTIMATED → SAMPLED
  let estimationErrorPct: number | null = null;
  if (
    isMeasured &&
    existing?.status === PackagingStatus.ESTIMATED &&
    existing.estimatedPlasticG != null &&
    result.plasticG != null &&
    result.plasticG > 0
  ) {
    // Signed % error: positive = we overestimated, negative = underestimated
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
            : "New sampling record added"
          : "Re-estimated from similar products",
        method: result.method,
      },
    });
  }
}

/**
 * A: Re-Estimation Cascade
 * After a new weighing is recorded, re-estimate all ESTIMATED products in the same
 * category so they immediately benefit from the new reference data.
 * Capped at 40 products to keep response time reasonable.
 * Returns the number of products whose estimates actually changed.
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

    // Only update if confidence improved or values shifted by more than 2%
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
