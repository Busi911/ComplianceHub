import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePackaging, redetectOutliersForProduct } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// How many products to process per cron run.
// Ordered by packagingProfile.updatedAt ASC so the oldest-refreshed products
// are always processed first — this naturally cycles through the full catalogue.
const LIMIT = 150;

// Vercel Cron Jobs call this route with Authorization: Bearer <CRON_SECRET>
// Set CRON_SECRET as an environment variable in Vercel.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // Only re-estimate products that actually benefit from it:
  // - IMPORTED / ESTIMATED: may get a better estimate as new reference data accumulates
  // - No profile yet: need initial estimation
  // Skip SAMPLED (real measurements, updated on-demand) and REVIEWED (manually verified).
  const products = await prisma.product.findMany({
    where: {
      OR: [
        {
          packagingProfile: {
            status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] },
          },
        },
        { packagingProfile: null },
      ],
    },
    select: {
      id: true,
      samplingRecords: { select: { id: true }, take: 1 },
    },
    orderBy: { packagingProfile: { updatedAt: "asc" } },
    take: LIMIT,
  });

  const total = products.length;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Process in small concurrent batches to balance throughput vs DB connection pressure
  const BATCH = 10;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ id, samplingRecords }: { id: string; samplingRecords: { id: string }[] }) => {
        try {
          // Products with own sampling records need outlier re-detection too
          if (samplingRecords.length > 0) {
            await redetectOutliersForProduct(id);
          }

          const result = await estimatePackaging(id);
          if (!result) {
            skipped++;
            return;
          }

          const existing = await prisma.productPackagingProfile.findUnique({
            where: { productId: id },
            select: { currentPlasticG: true, currentPaperG: true, status: true },
          });

          const isMeasured = result.method.startsWith("own_sampling");

          // Don't downgrade a SAMPLED profile back to ESTIMATED
          const newStatus =
            existing?.status === PackagingStatus.SAMPLED && !isMeasured
              ? PackagingStatus.SAMPLED
              : isMeasured
              ? PackagingStatus.SAMPLED
              : PackagingStatus.ESTIMATED;

          await prisma.productPackagingProfile.upsert({
            where: { productId: id },
            create: {
              productId: id,
              status: newStatus,
              currentPlasticG: result.plasticG,
              currentPaperG: result.paperG,
              estimatedPlasticG: isMeasured ? undefined : result.plasticG,
              estimatedPaperG: isMeasured ? undefined : result.paperG,
              measuredPlasticG: isMeasured ? result.plasticG : undefined,
              measuredPaperG: isMeasured ? result.paperG : undefined,
              confidenceScore: result.confidenceScore,
              estimationMethod: result.method,
            },
            update: {
              status: newStatus,
              currentPlasticG: result.plasticG,
              currentPaperG: result.paperG,
              ...(isMeasured
                ? { measuredPlasticG: result.plasticG, measuredPaperG: result.paperG }
                : { estimatedPlasticG: result.plasticG, estimatedPaperG: result.paperG }),
              confidenceScore: result.confidenceScore,
              estimationMethod: result.method,
            },
          });

          // Log to history only if values changed meaningfully
          const plasticChanged =
            existing?.currentPlasticG !== result.plasticG;
          const paperChanged = existing?.currentPaperG !== result.paperG;
          if (plasticChanged || paperChanged) {
            await prisma.productEstimateHistory.create({
              data: {
                productId: id,
                oldPlasticG: existing?.currentPlasticG ?? null,
                oldPaperG: existing?.currentPaperG ?? null,
                newPlasticG: result.plasticG,
                newPaperG: result.paperG,
                reason: "Cron Re-Schätzung",
                method: result.method,
              },
            });
          }

          updated++;
        } catch {
          errors++;
        }
      })
    );
  }

  const durationMs = Date.now() - started;
  console.log(
    `[cron/reestimate] ${updated} updated, ${skipped} skipped, ${errors} errors / ${total} eligible — ${durationMs}ms`
  );

  return NextResponse.json({ total, updated, skipped, errors, durationMs });
}
