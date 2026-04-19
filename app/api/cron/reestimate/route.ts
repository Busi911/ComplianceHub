import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePackaging, redetectOutliersForProduct } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LIMIT = 2000;

// Vercel Cron Jobs call this route with Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isDiagnose = new URL(request.url).searchParams.get("diagnose") === "true";
  const started = Date.now();

  // ── Diagnose mode: explain why products can't be estimated ──────────────────
  if (isDiagnose) {
    const [
      totalEligible,
      noCategory,
      hasMfrData,
      hasSamplingRecords,
      categoriesWithSampling,
    ] = await Promise.all([
      prisma.product.count({
        where: {
          OR: [
            { packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } } },
            { packagingProfile: null },
          ],
        },
      }),
      prisma.product.count({
        where: {
          category: null,
          OR: [
            { packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } } },
            { packagingProfile: null },
          ],
        },
      }),
      prisma.product.count({
        where: {
          OR: [{ mfrPlasticG: { not: null } }, { mfrPaperG: { not: null } }],
          packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } },
        },
      }),
      prisma.product.count({
        where: {
          samplingRecords: { some: { isOutlier: false } },
          packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } },
        },
      }),
      prisma.product.groupBy({
        by: ["category"],
        where: { samplingRecords: { some: { isOutlier: false } }, category: { not: null } },
        _count: true,
      }),
    ]);

    const sampledCategories = categoriesWithSampling.map((c) => c.category);

    const eligibleWithCategory = await prisma.product.count({
      where: {
        category: { not: null },
        OR: [
          { packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } } },
          { packagingProfile: null },
        ],
      },
    });

    const eligibleWithCategoryAndSampledRef = await prisma.product.count({
      where: {
        category: { in: sampledCategories as string[] },
        OR: [
          { packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } } },
          { packagingProfile: null },
        ],
      },
    });

    return NextResponse.json({
      diagnose: true,
      totalEligible,
      breakdown: {
        noCategory,
        hasMfrData,
        hasSamplingRecords,
        hasCategory: eligibleWithCategory,
        categoryHasSampledRef: eligibleWithCategoryAndSampledRef,
        categoryHasNoSampledRef: eligibleWithCategory - eligibleWithCategoryAndSampledRef,
        sampledCategoriesCount: sampledCategories.length,
        sampledCategories,
      },
      explanation: [
        noCategory > 0 && `${noCategory} Produkte ohne Kategorie → keine Schätzung möglich`,
        hasMfrData > 0 && `${hasMfrData} Produkte mit Hersteller-Daten → sollten geschätzt werden (Tier 1.5)`,
        hasSamplingRecords > 0 && `${hasSamplingRecords} Produkte mit eigenen Stichproben → sollten geschätzt werden (Tier 1)`,
        eligibleWithCategoryAndSampledRef === 0 && `Keine Kategorie hat gewogene Referenzprodukte → Tier 2/3/4 nicht verfügbar`,
        eligibleWithCategoryAndSampledRef > 0 && `${eligibleWithCategoryAndSampledRef} Produkte in Kategorien mit Referenzwerten → sollten via Tier 2/3/4 schätzbar sein`,
      ].filter(Boolean),
    });
  }

  // ── Normal cron run ─────────────────────────────────────────────────────────
  const cronRun = await prisma.cronRun.create({
    data: { type: "reestimate", startedAt: new Date() },
  });

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const eligibleOr = [
    { packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } } },
    { packagingProfile: null },
  ];
  const selectFields = {
    id: true,
    samplingRecords: { select: { id: true }, take: 1 },
  } as const;

  // Phase 0: Products in categories that received new measurements in the last 24 h.
  // These benefit most immediately from re-estimation since the category now has
  // fresh reference data that the cascade may not have fully propagated (cascade cap: 100).
  const recentlySampledProducts = await prisma.samplingRecord.findMany({
    where: { sampledAt: { gte: yesterday } },
    select: { productId: true },
    distinct: ["productId"],
  });
  const recentlySampledIds = recentlySampledProducts.map((r) => r.productId);

  const recentCategories = recentlySampledIds.length > 0
    ? (await prisma.product.findMany({
        where: { id: { in: recentlySampledIds }, category: { not: null } },
        select: { category: true },
        distinct: ["category"],
      })).map((p) => p.category).filter(Boolean) as string[]
    : [];

  const phase0 = recentCategories.length > 0
    ? await prisma.product.findMany({
        where: {
          category: { in: recentCategories },
          OR: eligibleOr,
        },
        select: selectFields,
        orderBy: { packagingProfile: { updatedAt: "asc" } },
        take: LIMIT,
      })
    : [];

  const phase0Ids = phase0.map((p) => p.id);
  const remaining0 = LIMIT - phase0.length;

  // Phase 1: Products changed in the last 24 h — clean up what wasn't re-estimated yet
  const phase1 = remaining0 > 0
    ? await prisma.product.findMany({
        where: { updatedAt: { gte: yesterday }, id: { notIn: phase0Ids }, OR: eligibleOr },
        select: selectFields,
        orderBy: { updatedAt: "desc" },
        take: remaining0,
      })
    : [];

  const phase1Ids = phase1.map((p) => p.id);
  const remaining = remaining0 - phase1.length;

  // Phase 2a: Products with no profile at all (never estimated) — oldest first
  const noProfile = remaining > 0
    ? await prisma.product.findMany({
        where: { id: { notIn: [...phase0Ids, ...phase1Ids] }, packagingProfile: null },
        select: selectFields,
        orderBy: { createdAt: "asc" },
        take: remaining,
      })
    : [];

  const noProfileIds = noProfile.map((p) => p.id);
  const remaining2 = remaining - noProfile.length;

  // Phase 2b: Fill rest with IMPORTED/ESTIMATED products — oldest estimate first
  const backfill = remaining2 > 0
    ? await prisma.product.findMany({
        where: {
          id: { notIn: [...phase0Ids, ...phase1Ids, ...noProfileIds] },
          packagingProfile: { status: { in: [PackagingStatus.IMPORTED, PackagingStatus.ESTIMATED] } },
        },
        select: selectFields,
        orderBy: { packagingProfile: { updatedAt: "asc" } },
        take: remaining2,
      })
    : [];

  const products = [...phase0, ...phase1, ...noProfile, ...backfill];
  const phase0Count = phase0.length;
  const phase1Count = phase1.length;
  const phase2Count = noProfile.length + backfill.length;

  const total = products.length;
  let updated = 0;
  let noChange = 0;
  let skipped = 0;
  let errors = 0;

  const BATCH = 10;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ id, samplingRecords }: { id: string; samplingRecords: { id: string }[] }) => {
        try {
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
            select: { currentPlasticG: true, currentPaperG: true, status: true, confidenceScore: true },
          });

          const isMeasured = result.method.startsWith("own_sampling");

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

          const plasticChanged = existing?.currentPlasticG !== result.plasticG;
          const paperChanged = existing?.currentPaperG !== result.paperG;
          if (plasticChanged || paperChanged) {
            const isNew = !existing;
            await prisma.productEstimateHistory.create({
              data: {
                productId: id,
                cronRunId: cronRun.id,
                oldPlasticG: existing?.currentPlasticG ?? null,
                oldPaperG: existing?.currentPaperG ?? null,
                newPlasticG: result.plasticG,
                newPaperG: result.paperG,
                reason: isNew ? "Erstschätzung (Cron)" : "Cron Re-Schätzung",
                method: result.method,
              },
            });
            updated++;
          } else {
            noChange++;
          }
        } catch {
          errors++;
        }
      })
    );
  }

  const durationMs = Date.now() - started;

  await prisma.cronRun.update({
    where: { id: cronRun.id },
    data: { finishedAt: new Date(), total, updated, skipped, errors, durationMs },
  });

  console.log(
    `[cron/reestimate] phase0=${phase0Count} (fresh categories) phase1=${phase1Count} (recent changes) phase2=${phase2Count} (backfill) | ${updated} updated, ${noChange} no-change, ${skipped} no-data, ${errors} errors / ${total} eligible — ${durationMs}ms`
  );

  return NextResponse.json({ cronRunId: cronRun.id, total, updated, noChange, skipped, errors, durationMs, phase0Count, phase1Count, phase2Count });
}
