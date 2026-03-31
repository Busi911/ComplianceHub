import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateProfileAfterSampling, cascadeReestimateCategory } from "@/lib/estimation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      productId,
      sampledBy,
      measuredPlasticG,
      measuredPaperG,
      measuredTotalPackagingG,
      netWeightAtSamplingG,
      grossWeightAtSamplingG,
      notes,
    } = body;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const record = await prisma.samplingRecord.create({
      data: {
        productId,
        sampledBy: sampledBy || null,
        measuredPlasticG:
          measuredPlasticG != null ? parseFloat(measuredPlasticG) : null,
        measuredPaperG:
          measuredPaperG != null ? parseFloat(measuredPaperG) : null,
        measuredTotalPackagingG:
          measuredTotalPackagingG != null
            ? parseFloat(measuredTotalPackagingG)
            : null,
        netWeightAtSamplingG:
          netWeightAtSamplingG != null
            ? parseFloat(netWeightAtSamplingG)
            : null,
        grossWeightAtSamplingG:
          grossWeightAtSamplingG != null
            ? parseFloat(grossWeightAtSamplingG)
            : null,
        notes: notes || null,
      },
    });

    // Update profile and run re-estimation
    await updateProfileAfterSampling(productId);

    // Fire cascade in background — don't block response
    if (product.category) {
      cascadeReestimateCategory(product.category, productId).catch(console.error);
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Sampling create error:", error);
    return NextResponse.json(
      { error: "Failed to create sampling record" },
      { status: 500 }
    );
  }
}
