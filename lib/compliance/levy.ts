import { prisma } from "@/lib/prisma";
import { classifyLevy } from "@/lib/ai-classify";

// ZPÜ tariff rates (as of 2024, to be reviewed annually)
export const LEVY_RATES: Record<string, number> = {
  PRINTER_SCANNER_COPIER: 15.77,
  USB_STICK:              0.39,
  SSD_HDD:                1.10,
  MEMORY_CARD:            0.10,
  OPTICAL_MEDIA:          0.06,
  TABLET_SMARTPHONE:      8.23,
  PC_LAPTOP:              13.65,
  NOT_APPLICABLE:         0,
};

const CATEGORY_RULES: Array<[string, string]> = [
  ["drucker",    "PRINTER_SCANNER_COPIER"],
  ["scanner",    "PRINTER_SCANNER_COPIER"],
  ["kopierer",   "PRINTER_SCANNER_COPIER"],
  ["usb-stick",  "USB_STICK"],
  ["usb stick",  "USB_STICK"],
  ["flash drive","USB_STICK"],
  ["ssd",        "SSD_HDD"],
  ["festplatte", "SSD_HDD"],
  ["hdd",        "SSD_HDD"],
  ["speicherkarte","MEMORY_CARD"],
  ["sd-karte",   "MEMORY_CARD"],
  ["microsd",    "MEMORY_CARD"],
  ["cd ",        "OPTICAL_MEDIA"],
  ["dvd ",       "OPTICAL_MEDIA"],
  ["blu-ray",    "OPTICAL_MEDIA"],
  ["tablet",     "TABLET_SMARTPHONE"],
  ["smartphone", "TABLET_SMARTPHONE"],
  ["handy",      "TABLET_SMARTPHONE"],
  ["laptop",     "PC_LAPTOP"],
  ["notebook",   "PC_LAPTOP"],
  ["pc ",        "PC_LAPTOP"],
  ["desktop",    "PC_LAPTOP"],
];

function applyRule(name: string, category: string | null, subcategory: string | null) {
  const haystack = `${name} ${category ?? ""} ${subcategory ?? ""}`.toLowerCase();
  for (const [keyword, levyCategory] of CATEGORY_RULES) {
    if (haystack.includes(keyword)) {
      return { levyApplicable: true, levyCategory, confidence: 0.55 };
    }
  }
  return null;
}

export async function estimateLevy(productId: string, noAi = false): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      annualUnitsSold: true,
      levyProfile: true,
      weeeProfile: { select: { weeeCategory: true } },
    },
  });
  if (!product) return;

  const existing = product.levyProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  // 1. Category rules
  let ruleResult = applyRule(product.productName, product.category, product.subcategory);

  // 2. Cross-reference: IT_TELEKOMMUNIKATION from WEEE → run AI (skip if noAi=true)
  let aiResult = null;
  if (!ruleResult && !noAi) {
    aiResult = await classifyLevy(product.productName, product.category, product.subcategory);
  }

  const levyApplicable = ruleResult?.levyApplicable ?? aiResult?.levyApplicable ?? null;
  const levyCategory = ruleResult?.levyCategory ?? aiResult?.levyCategory ?? null;
  const confidence = ruleResult?.confidence ?? (aiResult ? Math.min(0.70, aiResult.confidence) : 0);
  const method = ruleResult ? "category_rule" : aiResult ? "ai_classify" : "unknown";

  const estimatedLevyEur =
    levyCategory && levyCategory in LEVY_RATES ? LEVY_RATES[levyCategory] : null;
  const annualLevyEur =
    estimatedLevyEur && product.annualUnitsSold
      ? estimatedLevyEur * product.annualUnitsSold
      : null;

  const status =
    levyApplicable === false || levyCategory === "NOT_APPLICABLE"
      ? "NOT_APPLICABLE"
      : levyApplicable === null
      ? "UNKNOWN"
      : confidence >= 0.4
      ? "ESTIMATED"
      : "UNKNOWN";

  await prisma.productLevyProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      levyApplicable,
      levyCategory: levyCategory as never,
      estimatedLevyEur,
      annualLevyEur,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : null,
    },
    update: {
      status,
      levyApplicable,
      levyCategory: levyCategory as never,
      estimatedLevyEur,
      annualLevyEur,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : undefined,
    },
  });
}
