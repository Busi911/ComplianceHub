import { prisma } from "@/lib/prisma";

export interface CorrectionExample {
  productName: string;
  category: string;
  fields: Record<string, unknown>;
}

/** Log a manual user correction for audit trail + AI learning. */
export async function logCorrection(
  productId: string,
  module: string,
  correctedFields: Record<string, { old: unknown; new: unknown }>,
  productName?: string,
  productCategory?: string,
): Promise<void> {
  if (Object.keys(correctedFields).length === 0) return;
  try {
    await prisma.complianceCorrection.create({
      data: {
        productId,
        module,
        correctedFields: JSON.stringify(correctedFields),
        productName: productName ?? null,
        productCategory: productCategory ?? null,
      },
    });
  } catch {
    // Non-critical — don't block the main operation if table doesn't exist yet
  }
}

/**
 * Fetch recent corrections for a module as few-shot examples for AI.
 * Prefers same category, falls back to all categories.
 */
export async function fetchCorrectionExamples(
  module: string,
  category: string | null,
  limit = 5,
): Promise<CorrectionExample[]> {
  const rows = await prisma.complianceCorrection.findMany({
    where: {
      module,
      ...(category ? { productCategory: category } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // If no same-category corrections, fall back to any category
  const results = rows.length > 0 ? rows : await prisma.complianceCorrection.findMany({
    where: { module },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return results.map((r) => ({
    productName: r.productName ?? "unbekannt",
    category: r.productCategory ?? "unbekannt",
    fields: JSON.parse(r.correctedFields),
  }));
}

/** Build a formatted string of learning examples for injection into AI prompts. */
export function formatExamplesForPrompt(examples: CorrectionExample[]): string {
  if (examples.length === 0) return "";
  return (
    "\n\nManuell bestätigte Korrekturen (lerne daraus):\n" +
    examples
      .map(
        (e) =>
          `- Produkt: "${e.productName}" (Kategorie: ${e.category}) → ${JSON.stringify(e.fields)}`,
      )
      .join("\n")
  );
}
