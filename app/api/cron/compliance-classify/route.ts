import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimateBattery } from "@/lib/compliance/battery";
import { estimateWeee } from "@/lib/compliance/weee";
import { estimateLevy } from "@/lib/compliance/levy";
import { estimateReach } from "@/lib/compliance/reach";
import { estimateRohs } from "@/lib/compliance/rohs";
import { estimateEudr } from "@/lib/compliance/eudr";
import { estimatePop } from "@/lib/compliance/pop";
import { computeComplianceScore } from "@/lib/compliance/score";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LIMIT_PER_MODULE = 100;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // Find products missing any compliance profile
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { batteryProfile: null },
        { weeeProfile: null },
        { levyProfile: null },
        { reachProfile: null },
        { rohsProfile: null },
        { eudrProfile: null },
        { popProfile: null },
        { batteryProfile: { status: "UNKNOWN" } },
        { weeeProfile: { status: "UNKNOWN" } },
        { levyProfile: { status: "UNKNOWN" } },
        { reachProfile: { status: "UNKNOWN" } },
        { rohsProfile: { status: "UNKNOWN" } },
        { eudrProfile: { status: "UNKNOWN" } },
        { popProfile: { status: "UNKNOWN" } },
      ],
    },
    select: { id: true },
    take: LIMIT_PER_MODULE,
  });

  let updated = 0;
  let errors = 0;

  const BATCH = 5;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ id }) => {
        try {
          await Promise.all([
            estimateBattery(id),
            estimateWeee(id),
            estimateLevy(id),
            estimateReach(id),
            estimateRohs(id),
            estimateEudr(id),
            estimatePop(id),
          ]);
          await computeComplianceScore(id);
          updated++;
        } catch {
          errors++;
        }
      })
    );
  }

  const durationMs = Date.now() - started;
  console.log(`[cron/compliance-classify] ${updated} updated, ${errors} errors / ${products.length} — ${durationMs}ms`);

  return NextResponse.json({ total: products.length, updated, errors, durationMs });
}
