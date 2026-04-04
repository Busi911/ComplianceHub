import { prisma } from "@/lib/prisma";

// Categories with potential POP (persistent organic pollutants) risk
const HIGH_RISK_KEYWORDS = [
  "elektronik", "leiterplatte", "pcb", "kondensator",
  "flammschutz", "flame retardant",
  "pfas", "teflon", "ptfe",
  "pestizid", "insektizid",
  "farbe", "lack", "beschichtung",
  "textil imprägnierung",
];

function assessRisk(name: string, category: string | null): boolean {
  const haystack = `${name} ${category ?? ""}`.toLowerCase();
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (haystack.includes(kw)) return true;
  }
  return false;
}

export async function estimatePop(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      popProfile: true,
    },
  });
  if (!product) return;

  const existing = product.popProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  const hasRisk = assessRisk(product.productName, product.category);

  const status = hasRisk ? "ESTIMATED" : "NOT_APPLICABLE";
  const confidence = hasRisk ? 0.35 : 0.70;

  await prisma.productPopProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      containsPops: hasRisk ? null : false,
      confidenceScore: confidence,
      estimationMethod: "category_rule",
    },
    update: {
      status,
      containsPops: hasRisk ? null : false,
      confidenceScore: confidence,
      estimationMethod: "category_rule",
    },
  });
}
