import { prisma } from "@/lib/prisma";
import { classifyBattery } from "@/lib/ai-classify";
import { fetchCorrectionExamples } from "./corrections";

// Category-based rules: [categoryKeyword, batteryType, isRemovable]
const CATEGORY_RULES: Array<[string, string, boolean]> = [
  ["spielzeug",     "ALKALINE",  true],
  ["toy",           "ALKALINE",  true],
  ["fernsteuerung", "ALKALINE",  true],
  ["taschenlampe",  "ALKALINE",  true],
  ["laptop",        "LI_ION",    false],
  ["notebook",      "LI_ION",    false],
  ["tablet",        "LI_ION",    false],
  ["smartphone",    "LI_ION",    false],
  ["handy",         "LI_ION",    false],
  ["kopfhörer",     "LI_ION",    false],
  ["headphone",     "LI_ION",    false],
  ["powerbank",     "LI_ION",    true],
  ["akku",          "LI_ION",    true],
  ["kamera",        "LI_ION",    true],
  ["camera",        "LI_ION",    true],
  ["rasierapparat", "LI_ION",    false],
  ["elektrisch",    "LI_ION",    false],
  ["werkzeug",      "LI_ION",    true],
];

function applyRule(name: string, category: string | null, subcategory: string | null) {
  const haystack = `${name} ${category ?? ""} ${subcategory ?? ""}`.toLowerCase();
  for (const [keyword, batteryType, isRemovable] of CATEGORY_RULES) {
    if (haystack.includes(keyword)) {
      return { containsBattery: true, batteryType, isRemovable, confidence: 0.50 };
    }
  }
  return null;
}

export async function estimateBattery(productId: string, noAi = false): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      annualUnitsSold: true,
      batteryProfile: true,
    },
  });
  if (!product) return;

  const existing = product.batteryProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  // 1. Category rules
  const ruleResult = applyRule(product.productName, product.category, product.subcategory);

  // 2. AI classification (skip if noAi=true)
  let aiResult = null;
  if (!ruleResult && !noAi) {
    const examples = await fetchCorrectionExamples("battery", product.category);
    aiResult = await classifyBattery(product.productName, product.category, product.subcategory, examples);
  }

  const containsBattery = ruleResult?.containsBattery ?? aiResult?.containsBattery ?? null;
  const batteryType = ruleResult?.batteryType ?? aiResult?.batteryType ?? null;
  const isRemovable = ruleResult?.isRemovable ?? aiResult?.isRemovable ?? null;
  const confidence = ruleResult?.confidence ?? (aiResult ? Math.min(0.70, aiResult.confidence) : 0);
  const method = ruleResult ? "category_rule" : aiResult ? "ai_classify" : "unknown";

  const batteryWeightG = existing?.batteryWeightG ?? null;
  const annualBatteryTonnes =
    batteryWeightG && product.annualUnitsSold
      ? (batteryWeightG * product.annualUnitsSold) / 1_000_000
      : null;

  const status = containsBattery === null ? "UNKNOWN" : confidence >= 0.4 ? "ESTIMATED" : "UNKNOWN";

  await prisma.productBatteryProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      containsBattery,
      batteryType: batteryType as never,
      isRemovable,
      confidenceScore: confidence,
      estimationMethod: method,
      annualBatteryTonnes,
      aiClassifiedAt: aiResult ? new Date() : null,
    },
    update: {
      status,
      containsBattery,
      batteryType: batteryType as never,
      isRemovable,
      confidenceScore: confidence,
      estimationMethod: method,
      annualBatteryTonnes,
      aiClassifiedAt: aiResult ? new Date() : undefined,
    },
  });
}
