import { prisma } from "@/lib/prisma";
import { classifyReach } from "@/lib/ai-classify";
import { fetchCorrectionExamples } from "./corrections";

// High-risk categories for SVHC
const HIGH_RISK_KEYWORDS = [
  "kunststoff", "plastik", "pvc", "gummi", "rubber", "leder",
  "elektronik", "beschichtung", "farbe", "lack", "kleber",
  "textil", "stoff", "möbel", "spielzeug",
];

function assessRiskFromCategory(name: string, category: string | null): "low" | "medium" | "high" {
  const haystack = `${name} ${category ?? ""}`.toLowerCase();
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (haystack.includes(kw)) return "medium";
  }
  return "low";
}

export async function estimateReach(productId: string, noAi = false): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      reachProfile: true,
    },
  });
  if (!product) return;

  const existing = product.reachProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  const ruleRisk = assessRiskFromCategory(product.productName, product.category);

  let aiResult = null;
  if (ruleRisk !== "low" && !noAi) {
    const examples = await fetchCorrectionExamples("reach", product.category);
    aiResult = await classifyReach(product.productName, product.category, product.subcategory, examples);
  }

  const svhcRisk = aiResult?.svhcRisk ?? ruleRisk;
  const confidence = aiResult ? Math.min(0.40, aiResult.confidence) : 0.25;
  const method = aiResult ? "ai_classify" : "category_rule";

  const status =
    svhcRisk === "low" ? "ESTIMATED" : confidence >= 0.25 ? "ESTIMATED" : "UNKNOWN";

  await prisma.productReachProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : null,
    },
    update: {
      status,
      confidenceScore: confidence,
      estimationMethod: method,
      aiClassifiedAt: aiResult ? new Date() : undefined,
    },
  });
}
