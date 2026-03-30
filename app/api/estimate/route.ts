import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePackaging, updateProfileAfterSampling } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

// POST /api/estimate — run estimation for one or all products
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, all } = body;

    if (productId) {
      const result = await estimatePackaging(productId);
      if (!result) {
        return NextResponse.json(
          { error: "Could not estimate — no similar products found" },
          { status: 404 }
        );
      }

      // Upsert profile
      const isMeasured = result.method.startsWith("own_sampling");
      await prisma.productPackagingProfile.upsert({
        where: { productId },
        create: {
          productId,
          status: isMeasured ? PackagingStatus.SAMPLED : PackagingStatus.ESTIMATED,
          currentPlasticG: result.plasticG,
          currentPaperG: result.paperG,
          confidenceScore: result.confidenceScore,
          estimationMethod: result.method,
          estimatedPlasticG: isMeasured ? null : result.plasticG,
          estimatedPaperG: isMeasured ? null : result.paperG,
          measuredPlasticG: isMeasured ? result.plasticG : null,
          measuredPaperG: isMeasured ? result.paperG : null,
        },
        update: {
          status: isMeasured ? PackagingStatus.SAMPLED : PackagingStatus.ESTIMATED,
          currentPlasticG: result.plasticG,
          currentPaperG: result.paperG,
          confidenceScore: result.confidenceScore,
          estimationMethod: result.method,
          estimatedPlasticG: isMeasured ? undefined : result.plasticG,
          estimatedPaperG: isMeasured ? undefined : result.paperG,
        },
      });

      return NextResponse.json({ success: true, productId, result });
    }

    if (all) {
      // Batch estimate for all products without sampling records
      const products = await prisma.product.findMany({
        where: {
          packagingProfile: {
            status: PackagingStatus.IMPORTED,
          },
        },
        select: { id: true },
        take: 500,
      });

      let updated = 0;
      for (const p of products) {
        await updateProfileAfterSampling(p.id).catch(() => null);
        updated++;
      }

      return NextResponse.json({ success: true, updated });
    }

    return NextResponse.json(
      { error: "Provide productId or all=true" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Estimate error:", error);
    return NextResponse.json(
      { error: "Estimation failed" },
      { status: 500 }
    );
  }
}
