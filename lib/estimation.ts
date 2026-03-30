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
 * 2. Similar products by category/subcategory/brand/manufacturer/weight/price
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

    // Confidence increases with more samples, caps at 0.95
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

    // Confidence based on similarity and sample count
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

  // Build OR conditions for similarity
  const orConditions: Record<string, unknown>[] = [];

  // Same subcategory (most specific)
  if (product.subcategory) {
    orConditions.push({ subcategory: product.subcategory });
  }

  // Same brand + category
  if (product.brand && product.category) {
    orConditions.push({ brand: product.brand, category: product.category });
  }

  // Same manufacturer + category
  if (product.manufacturer && product.category) {
    orConditions.push({
      manufacturer: product.manufacturer,
      category: product.category,
    });
  }

  // Same category + similar price range (±30%)
  if (product.category && product.ekPrice) {
    orConditions.push({
      category: product.category,
      ekPrice: {
        gte: product.ekPrice * 0.7,
        lte: product.ekPrice * 1.3,
      },
    });
  }

  // Same category + similar gross weight (±25%)
  if (product.category && product.grossWeightG) {
    orConditions.push({
      category: product.category,
      grossWeightG: {
        gte: product.grossWeightG * 0.75,
        lte: product.grossWeightG * 1.25,
      },
    });
  }

  if (orConditions.length === 0 && product.category) {
    orConditions.push({ category: product.category });
  }

  if (orConditions.length === 0) return [];

  where.OR = orConditions;

  const results = await prisma.product.findMany({
    where,
    include: {
      samplingRecords: {
        select: { measuredPlasticG: true, measuredPaperG: true },
      },
    },
    take: 20,
  });

  return results as unknown as ProductWithSampling[];
}

function computeSimilarityConfidence(
  product: ProductWithSampling,
  similarProducts: ProductWithSampling[]
): number {
  if (similarProducts.length === 0) return 0.1;

  // Score the best match
  let maxScore = 0;

  for (const similar of similarProducts) {
    let score = 0;

    if (product.subcategory && similar.subcategory === product.subcategory)
      score += 3;
    if (product.category && similar.category === product.category) score += 2;
    if (product.brand && similar.brand === product.brand) score += 2;
    if (
      product.manufacturer &&
      similar.manufacturer === product.manufacturer
    )
      score += 1;

    // Price similarity
    if (product.ekPrice && similar.ekPrice) {
      const priceDiff =
        Math.abs(product.ekPrice - similar.ekPrice) / product.ekPrice;
      if (priceDiff < 0.1) score += 2;
      else if (priceDiff < 0.3) score += 1;
    }

    // Weight similarity
    if (product.grossWeightG && similar.grossWeightG) {
      const weightDiff =
        Math.abs(product.grossWeightG - similar.grossWeightG) /
        product.grossWeightG;
      if (weightDiff < 0.1) score += 2;
      else if (weightDiff < 0.25) score += 1;
    }

    maxScore = Math.max(maxScore, score);
  }

  // Max possible score is ~12, map to 0.2–0.75
  const normalized = Math.min(maxScore / 12, 1);
  return Math.round((0.2 + normalized * 0.55) * 100) / 100;
}

/**
 * Called after a new SamplingRecord is created.
 * Updates the ProductPackagingProfile and logs the change.
 */
export async function updateProfileAfterSampling(
  productId: string
): Promise<void> {
  const existing = await prisma.productPackagingProfile.findUnique({
    where: { productId },
  });

  const result = await estimatePackaging(productId);
  if (!result) return;

  const oldPlasticG = existing?.currentPlasticG ?? null;
  const oldPaperG = existing?.currentPaperG ?? null;

  // Determine if this is from real sampling (method starts with "own_sampling")
  const isMeasured = result.method.startsWith("own_sampling");

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
    },
  });

  // Log the change if values actually changed
  if (
    oldPlasticG !== result.plasticG ||
    oldPaperG !== result.paperG
  ) {
    await prisma.productEstimateHistory.create({
      data: {
        productId,
        oldPlasticG,
        oldPaperG,
        newPlasticG: result.plasticG,
        newPaperG: result.paperG,
        reason: isMeasured ? "New sampling record added" : "Re-estimated from similar products",
        method: result.method,
      },
    });
  }
}
