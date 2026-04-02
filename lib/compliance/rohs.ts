import { prisma } from "@/lib/prisma";
import { classifyRohs } from "@/lib/ai-classify";

export async function estimateRohs(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      productName: true,
      category: true,
      subcategory: true,
      rohsProfile: true,
      weeeProfile: { select: { isElectronic: true } },
    },
  });
  if (!product) return;

  const existing = product.rohsProfile;
  if (existing?.status === "DECLARED" || existing?.status === "VERIFIED") return;

  const isElectronic = product.weeeProfile?.isElectronic ?? null;

  // Direct derivation from WEEE
  if (isElectronic === false) {
    await prisma.productRohsProfile.upsert({
      where: { productId },
      create: {
        productId,
        status: "NOT_APPLICABLE",
        rohsApplicable: false,
        confidenceScore: 0.90,
        estimationMethod: "weee_crossref",
      },
      update: {
        status: "NOT_APPLICABLE",
        rohsApplicable: false,
        confidenceScore: 0.90,
        estimationMethod: "weee_crossref",
      },
    });
    return;
  }

  if (isElectronic === true) {
    // Check for existing CE + DoC info
    if (existing?.ceMarkingPresent && existing?.docAvailable) {
      await prisma.productRohsProfile.upsert({
        where: { productId },
        create: {
          productId,
          status: "VERIFIED",
          rohsApplicable: true,
          rohsStatus: "COMPLIANT",
          ceMarkingPresent: true,
          docAvailable: true,
          confidenceScore: 1.0,
          estimationMethod: "ce_doc_verified",
        },
        update: {
          status: "VERIFIED",
          rohsStatus: "COMPLIANT",
          confidenceScore: 1.0,
          estimationMethod: "ce_doc_verified",
        },
      });
      return;
    }

    // AI classification for electronic products
    const aiResult = await classifyRohs(product.productName, product.category, product.subcategory, true);
    const confidence = aiResult ? Math.min(0.65, aiResult.confidence) : 0.50;

    await prisma.productRohsProfile.upsert({
      where: { productId },
      create: {
        productId,
        status: "ESTIMATED",
        rohsApplicable: true,
        confidenceScore: confidence,
        estimationMethod: aiResult ? "ai_classify" : "weee_crossref",
        aiClassifiedAt: aiResult ? new Date() : null,
      },
      update: {
        status: "ESTIMATED",
        rohsApplicable: true,
        confidenceScore: confidence,
        estimationMethod: aiResult ? "ai_classify" : "weee_crossref",
        aiClassifiedAt: aiResult ? new Date() : undefined,
      },
    });
    return;
  }

  // isElectronic is null — use AI
  const aiResult = await classifyRohs(product.productName, product.category, product.subcategory, null);
  if (!aiResult) {
    await prisma.productRohsProfile.upsert({
      where: { productId },
      create: { productId, status: "UNKNOWN", confidenceScore: 0, estimationMethod: "none" },
      update: { status: "UNKNOWN", confidenceScore: 0, estimationMethod: "none" },
    });
    return;
  }

  const status = aiResult.rohsApplicable === false ? "NOT_APPLICABLE" : "ESTIMATED";
  await prisma.productRohsProfile.upsert({
    where: { productId },
    create: {
      productId,
      status,
      rohsApplicable: aiResult.rohsApplicable,
      confidenceScore: Math.min(0.65, aiResult.confidence),
      estimationMethod: "ai_classify",
      aiClassifiedAt: new Date(),
    },
    update: {
      status,
      rohsApplicable: aiResult.rohsApplicable,
      confidenceScore: Math.min(0.65, aiResult.confidence),
      estimationMethod: "ai_classify",
      aiClassifiedAt: new Date(),
    },
  });
}
