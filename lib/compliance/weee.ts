import { prisma } from "@/lib/prisma";
import { classifyWeee } from "@/lib/ai-classify";

const CATEGORY_RULES: Array<[string, string]> = [
  ["kühlschrank",   "HAUSHALTSGROSSE_GERATE"],
  ["waschmaschine", "HAUSHALTSGROSSE_GERATE"],
  ["geschirrspüler","HAUSHALTSGROSSE_GERATE"],
  ["herd",          "HAUSHALTSGROSSE_GERATE"],
  ["mikrowelle",    "HAUSHALTSKLEINGERATE"],
  ["toaster",       "HAUSHALTSKLEINGERATE"],
  ["mixer",         "HAUSHALTSKLEINGERATE"],
  ["staubsauger",   "HAUSHALTSKLEINGERATE"],
  ["laptop",        "IT_TELEKOMMUNIKATION"],
  ["notebook",      "IT_TELEKOMMUNIKATION"],
  ["pc",            "IT_TELEKOMMUNIKATION"],
  ["drucker",       "IT_TELEKOMMUNIKATION"],
  ["tablet",        "IT_TELEKOMMUNIKATION"],
  ["smartphone",    "IT_TELEKOMMUNIKATION"],
  ["handy",         "IT_TELEKOMMUNIKATION"],
  ["router",        "IT_TELEKOMMUNIKATION"],
  ["monitor",       "IT_TELEKOMMUNIKATION"],
  ["fernseher",     "UNTERHALTUNGSELEKTRONIK"],
  ["tv",            "UNTERHALTUNGSELEKTRONIK"],
  ["lautsprecher",  "UNTERHALTUNGSELEKTRONIK"],
  ["kopfhörer",     "UNTERHALTUNGSELEKTRONIK"],
  ["headphone",     "UNTERHALTUNGSELEKTRONIK"],
  ["kamera",        "UNTERHALTUNGSELEKTRONIK"],
  ["lampe",         "BELEUCHTUNG"],
  ["leuchte",       "BELEUCHTUNG"],
  ["led",           "BELEUCHTUNG"],
  ["bohrmaschine",  "WERKZEUGE"],
  ["schrauber",     "WERKZEUGE"],
  ["säge",          "WERKZEUGE"],
  ["spielzeug",     "SPIELZEUG_FREIZEIT_SPORT"],
  ["spielkonsole",  "SPIELZEUG_FREIZEIT_SPORT"],
  ["blutdruck",     "MEDIZINPRODUKTE"],
  ["thermometer",   "MEDIZINPRODUKTE"],
  ["automat",       "AUTOMATEN"],
];

function applyRule(name: string, category: string | null, subcategory: string | null) {
  const haystack = `${name} ${category ?? ""} ${subcategory ?? ""}`.toLowerCase();
  for (const [keyword, weeeCategory] of CATEGORY_RULES) {
    if (haystack.includes(keyword)) {
      return { isElectronic: true, weeeCategory, confidence: 0.50 };
    }
  }
  return null;
}

export async function estimateWeee(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      grossWeightG: true,
      annualUnitsSold: true,
      weeeProfile: true,
      batteryProfile: { select: { containsBattery: true } },
    },
  });
  if (!product) return;

  const existing = product.weeeProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  // 1. Cross-reference: has battery → likely electronic
  let ruleResult = applyRule(product.productName, product.category, product.subcategory);

  if (!ruleResult && product.batteryProfile?.containsBattery === true) {
    ruleResult = { isElectronic: true, weeeCategory: "HAUSHALTSKLEINGERATE", confidence: 0.40 };
  }

  // 2. AI classification
  let aiResult = null;
  if (!ruleResult) {
    aiResult = await classifyWeee(product.productName, product.category, product.subcategory);
  }

  const isElectronic = ruleResult?.isElectronic ?? aiResult?.isElectronic ?? null;
  const weeeCategory = ruleResult?.weeeCategory ?? aiResult?.weeeCategory ?? null;
  const confidence = ruleResult?.confidence ?? (aiResult ? Math.min(0.70, aiResult.confidence) : 0);
  const method = ruleResult ? "category_rule" : aiResult ? "ai_classify" : "unknown";

  const deviceWeightG = product.grossWeightG ?? existing?.deviceWeightG ?? null;
  const annualWeeeKg =
    deviceWeightG && product.annualUnitsSold
      ? (deviceWeightG * product.annualUnitsSold) / 1000
      : null;

  const status =
    isElectronic === false
      ? "NOT_APPLICABLE"
      : isElectronic === null
      ? "UNKNOWN"
      : confidence >= 0.4
      ? "ESTIMATED"
      : "UNKNOWN";

  await prisma.productWeeeProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      isElectronic,
      weeeCategory: weeeCategory as never,
      deviceWeightG,
      annualWeeeKg,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : null,
    },
    update: {
      status,
      isElectronic,
      weeeCategory: weeeCategory as never,
      deviceWeightG,
      annualWeeeKg,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : undefined,
    },
  });
}
