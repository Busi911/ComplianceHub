import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateProfileAfterSampling } from "@/lib/estimation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel Cron Jobs call this route with Authorization: Bearer <CRON_SECRET>
// Set CRON_SECRET as an environment variable in Vercel.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // Fetch all product IDs — process in batches to avoid memory issues
  const products = await prisma.product.findMany({ select: { id: true } });
  const total = products.length;
  let updated = 0;
  let errors = 0;

  const BATCH = 20;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ id }) => {
        try {
          await updateProfileAfterSampling(id);
          updated++;
        } catch {
          errors++;
        }
      })
    );
  }

  const durationMs = Date.now() - started;
  console.log(`[cron/reestimate] ${updated}/${total} updated, ${errors} errors, ${durationMs}ms`);

  return NextResponse.json({ total, updated, errors, durationMs });
}
