import { prisma } from "@/lib/prisma";
import { statusToScore } from "./types";
import type { ComplianceStatus } from "./types";

interface ModuleScore {
  key: keyof ScoreFields;
  status: ComplianceStatus | null;
}

interface ScoreFields {
  battScore: number | null;
  weeeScore: number | null;
  levyScore: number | null;
  reachScore: number | null;
  rohsScore: number | null;
  eudrScore: number | null;
  popScore: number | null;
}

export async function computeComplianceScore(productId: string): Promise<void> {
  const [batt, weee, levy, reach, rohs, eudr, pop] = await Promise.all([
    prisma.productBatteryProfile.findUnique({ where: { productId }, select: { status: true } }),
    prisma.productWeeeProfile.findUnique({ where: { productId }, select: { status: true } }),
    prisma.productLevyProfile.findUnique({ where: { productId }, select: { status: true } }),
    prisma.productReachProfile.findUnique({ where: { productId }, select: { status: true } }),
    prisma.productRohsProfile.findUnique({ where: { productId }, select: { status: true } }),
    prisma.productEudrProfile.findUnique({ where: { productId }, select: { status: true } }),
    prisma.productPopProfile.findUnique({ where: { productId }, select: { status: true } }),
  ]);

  const modules: ModuleScore[] = [
    { key: "battScore",  status: (batt?.status  ?? null) as ComplianceStatus | null },
    { key: "weeeScore",  status: (weee?.status  ?? null) as ComplianceStatus | null },
    { key: "levyScore",  status: (levy?.status  ?? null) as ComplianceStatus | null },
    { key: "reachScore", status: (reach?.status ?? null) as ComplianceStatus | null },
    { key: "rohsScore",  status: (rohs?.status  ?? null) as ComplianceStatus | null },
    { key: "eudrScore",  status: (eudr?.status  ?? null) as ComplianceStatus | null },
    { key: "popScore",   status: (pop?.status   ?? null) as ComplianceStatus | null },
  ];

  const fields: ScoreFields = {
    battScore: null, weeeScore: null, levyScore: null, reachScore: null,
    rohsScore: null, eudrScore: null, popScore: null,
  };

  let applicableCount = 0;
  let scoreSum = 0;
  let completedCount = 0;

  for (const mod of modules) {
    if (mod.status === null) {
      fields[mod.key] = null;
      continue;
    }
    const score = statusToScore(mod.status);
    fields[mod.key] = score;
    if (score !== null) {
      applicableCount++;
      scoreSum += score;
      if (score >= 0.8) completedCount++;
    }
  }

  const overallScore = applicableCount > 0 ? scoreSum / applicableCount : 0;

  await prisma.productComplianceScore.upsert({
    where: { productId },
    create: {
      productId,
      overallScore,
      ...fields,
      applicableCount,
      completedCount,
      lastComputedAt: new Date(),
    },
    update: {
      overallScore,
      ...fields,
      applicableCount,
      completedCount,
      lastComputedAt: new Date(),
    },
  });
}
