export interface DataQualityResult {
  score: number; // 0–100
  missingRequired: string[];
  missingRecommended: string[];
  presentFields: string[];
}

export interface ProductInput {
  sku?: string;
  internalArticleNumber?: string | null;
  productName?: string;
  manufacturer?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  ekPrice?: number | null;
  netWeightG?: number | null;
  grossWeightG?: number | null;
  netLengthMm?: number | null;
  netWidthMm?: number | null;
  netHeightMm?: number | null;
  grossLengthMm?: number | null;
  grossWidthMm?: number | null;
  grossHeightMm?: number | null;
  source?: string;
  importBatchId?: string;
}

function hasValue(val: unknown): boolean {
  return val !== undefined && val !== null && val !== "" && val !== 0;
}

/**
 * Scoring breakdown (total 100 pts):
 *
 * Identity (20 pts)
 *   sku            10 pts  required
 *   productName    10 pts  required
 *
 * Estimation-critical (50 pts) — these directly determine which estimation tier fires
 *   category       20 pts  needed for all similarity/regression/category-avg methods
 *   grossWeightG   15 pts  regression + weight-similarity matching
 *   netWeightG      5 pts  packaging-ratio signal
 *   brand/manuf.   10 pts  similarity matching
 *
 * Enrichment (30 pts) — improve match precision
 *   ekPrice         8 pts  price-range similarity
 *   subcategory     8 pts  strongest similarity signal (+3 pts in scoring)
 *   grossDimensions 8 pts  volume-based matching (all three gross L/W/H together)
 *   netDimensions   6 pts  net-volume ratio
 */

interface ScoredField {
  key: string;
  label: string;
  pts: number;
  tier: "required" | "critical" | "enrichment";
}

const SCORED_FIELDS: ScoredField[] = [
  { key: "sku",         label: "SKU",              pts: 10, tier: "required" },
  { key: "productName", label: "Produktname",       pts: 10, tier: "required" },
  { key: "category",    label: "Kategorie",         pts: 20, tier: "critical" },
  { key: "grossWeightG",label: "Bruttogewicht",     pts: 15, tier: "critical" },
  { key: "netWeightG",  label: "Nettogewicht",      pts:  5, tier: "critical" },
  // brand/manufacturer is handled as a combined check below
  { key: "ekPrice",     label: "EK-Preis",          pts:  8, tier: "enrichment" },
  { key: "subcategory", label: "Unterkategorie",    pts:  8, tier: "enrichment" },
];

export function validateProductInput(data: ProductInput): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  quality: DataQualityResult;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const presentFields: string[] = [];

  let score = 0;

  // Identity
  if (!hasValue(data.sku)) {
    errors.push("Pflichtfeld fehlt: SKU");
    missingRequired.push("SKU");
  } else {
    presentFields.push("sku");
    score += 10;
  }

  if (!hasValue(data.productName)) {
    errors.push("Pflichtfeld fehlt: Produktname");
    missingRequired.push("Produktname");
  } else {
    presentFields.push("productName");
    score += 10;
  }

  // Estimation-critical: category
  if (!hasValue(data.category)) {
    warnings.push("Kategorie fehlt — ohne Kategorie ist keine automatische Schätzung möglich");
    missingRecommended.push("Kategorie");
  } else {
    presentFields.push("category");
    score += 20;
  }

  // Estimation-critical: weights
  if (!hasValue(data.grossWeightG)) {
    warnings.push("Bruttogewicht fehlt — benötigt für Regressions-Schätzung und Gewichts-Matching");
    missingRecommended.push("Bruttogewicht (g)");
  } else {
    presentFields.push("grossWeightG");
    score += 15;
  }

  if (!hasValue(data.netWeightG)) {
    missingRecommended.push("Nettogewicht (g)");
  } else {
    presentFields.push("netWeightG");
    score += 5;
  }

  // Estimation-critical: brand or manufacturer (combined 10 pts)
  const hasBrand = hasValue(data.brand);
  const hasMfr = hasValue(data.manufacturer);
  if (!hasBrand && !hasMfr) {
    warnings.push("Weder Marke noch Hersteller angegeben — schränkt Ähnlichkeits-Matching ein");
    missingRecommended.push("Marke / Hersteller");
  } else {
    if (hasBrand) presentFields.push("brand");
    if (hasMfr) presentFields.push("manufacturer");
    score += 10;
  }

  // Enrichment: EK-Preis
  if (!hasValue(data.ekPrice)) {
    missingRecommended.push("EK-Preis");
  } else {
    presentFields.push("ekPrice");
    score += 8;
  }

  // Enrichment: subcategory
  if (!hasValue(data.subcategory)) {
    missingRecommended.push("Unterkategorie");
  } else {
    presentFields.push("subcategory");
    score += 8;
  }

  // Enrichment: gross dimensions (all three together = 8 pts)
  const hasGrossDims =
    hasValue(data.grossLengthMm) &&
    hasValue(data.grossWidthMm) &&
    hasValue(data.grossHeightMm);
  if (!hasGrossDims) {
    missingRecommended.push("Brutto-Maße (L×B×H)");
  } else {
    presentFields.push("grossLengthMm");
    presentFields.push("grossWidthMm");
    presentFields.push("grossHeightMm");
    score += 8;
  }

  // Enrichment: net dimensions (6 pts)
  const hasNetDims =
    hasValue(data.netLengthMm) &&
    hasValue(data.netWidthMm) &&
    hasValue(data.netHeightMm);
  if (hasNetDims) {
    presentFields.push("netLengthMm");
    presentFields.push("netWidthMm");
    presentFields.push("netHeightMm");
    score += 6;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    quality: {
      score: Math.min(score, 100),
      missingRequired,
      missingRecommended,
      presentFields,
    },
  };
}

export function computeDataQuality(product: ProductInput): DataQualityResult {
  return validateProductInput(product).quality;
}
