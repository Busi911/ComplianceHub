export interface DataQualityResult {
  score: number; // 0–100
  missingRequired: string[];
  missingRecommended: string[];
  presentFields: string[];
}

export interface ProductInput {
  sku?: string;
  productName?: string;
  manufacturer?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
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

const REQUIRED_FIELDS: (keyof ProductInput)[] = ["sku", "productName"];

const RECOMMENDED_FIELDS: (keyof ProductInput)[] = [
  "category",
  "manufacturer",
  "brand",
  "ekPrice",
  "netWeightG",
  "grossWeightG",
];

const OPTIONAL_FIELDS: (keyof ProductInput)[] = [
  "subcategory",
  "netLengthMm",
  "netWidthMm",
  "netHeightMm",
  "grossLengthMm",
  "grossWidthMm",
  "grossHeightMm",
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

  for (const field of REQUIRED_FIELDS) {
    const val = data[field];
    if (val === undefined || val === null || val === "") {
      errors.push(`Pflichtfeld fehlt: ${field}`);
      missingRequired.push(field);
    } else {
      presentFields.push(field);
    }
  }

  for (const field of RECOMMENDED_FIELDS) {
    const val = data[field];
    if (val === undefined || val === null || val === "") {
      warnings.push(`Empfohlenes Feld fehlt: ${field}`);
      missingRecommended.push(field);
    } else {
      presentFields.push(field);
    }
  }

  for (const field of OPTIONAL_FIELDS) {
    const val = data[field];
    if (val !== undefined && val !== null && val !== "") {
      presentFields.push(field);
    }
  }

  // At least manufacturer OR brand must be present (soft rule)
  if (!data.manufacturer && !data.brand) {
    warnings.push("Mindestens Hersteller oder Marke sollte angegeben sein");
  }

  // At least net or gross weight should be present
  if (!data.netWeightG && !data.grossWeightG) {
    warnings.push("Mindestens Netto- oder Bruttogewicht sollte angegeben sein");
  }

  // Quality score: required=40pts, recommended=60pts split evenly
  const requiredScore =
    (REQUIRED_FIELDS.length - missingRequired.length) /
    REQUIRED_FIELDS.length *
    40;

  const recommendedScore =
    (RECOMMENDED_FIELDS.length - missingRecommended.length) /
    RECOMMENDED_FIELDS.length *
    60;

  const score = Math.round(requiredScore + recommendedScore);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    quality: { score, missingRequired, missingRecommended, presentFields },
  };
}

export function computeDataQuality(product: ProductInput): DataQualityResult {
  return validateProductInput(product).quality;
}
