import { prisma } from "@/lib/prisma";
import { classifyEudr } from "@/lib/ai-classify";

// Products commonly associated with regulated commodities
const COMMODITY_RULES: Array<[string, string[]]> = [
  ["holz",       ["Holz"]],
  ["wood",       ["Holz"]],
  ["möbel",      ["Holz"]],
  ["furniture",  ["Holz"]],
  ["papier",     ["Holz"]],
  ["karton",     ["Holz"]],
  ["kautschuk",  ["Kautschuk"]],
  ["rubber",     ["Kautschuk"]],
  ["reifen",     ["Kautschuk"]],
  ["latex",      ["Kautschuk"]],
  ["soja",       ["Soja"]],
  ["palmöl",     ["Palmöl"]],
  ["palm oil",   ["Palmöl"]],
  ["leder",      ["Rind"]],
  ["leather",    ["Rind"]],
  ["kaffee",     ["Kaffee"]],
  ["coffee",     ["Kaffee"]],
  ["kakao",      ["Kakao"]],
  ["schokolade", ["Kakao"]],
  ["chocolate",  ["Kakao"]],
];

function applyRule(name: string, category: string | null) {
  const haystack = `${name} ${category ?? ""}`.toLowerCase();
  const found: string[] = [];
  for (const [keyword, commodities] of COMMODITY_RULES) {
    if (haystack.includes(keyword)) {
      for (const c of commodities) {
        if (!found.includes(c)) found.push(c);
      }
    }
  }
  return found;
}

export async function estimateEudr(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      eudrProfile: true,
    },
  });
  if (!product) return;

  const existing = product.eudrProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  const ruleCommodities = applyRule(product.productName, product.category);

  let aiResult = null;
  let commodities: string[] = ruleCommodities;
  let confidence = ruleCommodities.length > 0 ? 0.55 : 0.20;
  let method = ruleCommodities.length > 0 ? "category_rule" : "none";

  if (ruleCommodities.length === 0) {
    aiResult = await classifyEudr(product.productName, product.category, product.subcategory);
    if (aiResult) {
      commodities = aiResult.commodities;
      confidence = Math.min(0.70, aiResult.confidence);
      method = "ai_classify";
    }
  }

  const containsRegulatedCommodity = commodities.length > 0;
  const dueDiligenceRequired = containsRegulatedCommodity;

  const status =
    !containsRegulatedCommodity
      ? "NOT_APPLICABLE"
      : confidence >= 0.4
      ? "ESTIMATED"
      : "UNKNOWN";

  await prisma.productEudrProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      containsRegulatedCommodity,
      commoditiesJson: JSON.stringify(commodities),
      dueDiligenceRequired,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : null,
    },
    update: {
      status,
      containsRegulatedCommodity,
      commoditiesJson: JSON.stringify(commodities),
      dueDiligenceRequired,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : undefined,
    },
  });
}
