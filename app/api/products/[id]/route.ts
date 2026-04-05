import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePackaging } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        packagingProfile: true,
        samplingRecords: { orderBy: { sampledAt: "desc" } },
        estimateHistory: { orderBy: { createdAt: "desc" }, take: 20 },
        importBatch: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Product detail error:", error);
    return NextResponse.json(
      { error: "Failed to load product" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      internalArticleNumber,
      manufacturer,
      brand,
      productName,
      category,
      subcategory,
      ekPrice,
      netWeightG,
      grossWeightG,
      netLengthMm,
      netWidthMm,
      netHeightMm,
      grossLengthMm,
      grossWidthMm,
      grossHeightMm,
      annualUnitsSold,
      mfrNetWeightG,
      mfrGrossWeightG,
      mfrPlasticG,
      mfrPaperG,
    } = body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const parseOptFloat = (v: unknown) => (v != null && v !== "" ? parseFloat(String(v)) : null);

    const product = await prisma.product.update({
      where: { id },
      data: {
        internalArticleNumber: internalArticleNumber || null,
        manufacturer,
        brand,
        productName,
        category,
        subcategory,
        ekPrice: ekPrice != null ? parseFloat(ekPrice) : undefined,
        netWeightG: netWeightG != null ? parseFloat(netWeightG) : undefined,
        grossWeightG:
          grossWeightG != null ? parseFloat(grossWeightG) : undefined,
        netLengthMm: netLengthMm != null ? parseFloat(netLengthMm) : undefined,
        netWidthMm: netWidthMm != null ? parseFloat(netWidthMm) : undefined,
        netHeightMm: netHeightMm != null ? parseFloat(netHeightMm) : undefined,
        grossLengthMm:
          grossLengthMm != null ? parseFloat(grossLengthMm) : undefined,
        grossWidthMm:
          grossWidthMm != null ? parseFloat(grossWidthMm) : undefined,
        grossHeightMm:
          grossHeightMm != null ? parseFloat(grossHeightMm) : undefined,
        annualUnitsSold:
          annualUnitsSold != null ? parseInt(String(annualUnitsSold), 10) : null,
        mfrNetWeightG: parseOptFloat(mfrNetWeightG),
        mfrGrossWeightG: parseOptFloat(mfrGrossWeightG),
        mfrPlasticG: parseOptFloat(mfrPlasticG),
        mfrPaperG: parseOptFloat(mfrPaperG),
      },
    });

    // Re-run estimation after update and persist the result
    const estimateResult = await estimatePackaging(id);
    if (estimateResult) {
      const existingProfile = await prisma.productPackagingProfile.findUnique({
        where: { productId: id },
        select: { currentPlasticG: true, currentPaperG: true, status: true },
      });

      const isMeasured = estimateResult.method.startsWith("own_sampling");
      const newStatus =
        existingProfile?.status === PackagingStatus.SAMPLED && !isMeasured
          ? PackagingStatus.SAMPLED
          : isMeasured
          ? PackagingStatus.SAMPLED
          : PackagingStatus.ESTIMATED;

      await prisma.productPackagingProfile.upsert({
        where: { productId: id },
        create: {
          productId: id,
          status: newStatus,
          currentPlasticG: estimateResult.plasticG,
          currentPaperG: estimateResult.paperG,
          estimatedPlasticG: isMeasured ? undefined : estimateResult.plasticG,
          estimatedPaperG: isMeasured ? undefined : estimateResult.paperG,
          measuredPlasticG: isMeasured ? estimateResult.plasticG : undefined,
          measuredPaperG: isMeasured ? estimateResult.paperG : undefined,
          confidenceScore: estimateResult.confidenceScore,
          estimationMethod: estimateResult.method,
        },
        update: {
          status: newStatus,
          currentPlasticG: estimateResult.plasticG,
          currentPaperG: estimateResult.paperG,
          ...(isMeasured
            ? { measuredPlasticG: estimateResult.plasticG, measuredPaperG: estimateResult.paperG }
            : { estimatedPlasticG: estimateResult.plasticG, estimatedPaperG: estimateResult.paperG }),
          confidenceScore: estimateResult.confidenceScore,
          estimationMethod: estimateResult.method,
        },
      });

      const plasticChanged = existingProfile?.currentPlasticG !== estimateResult.plasticG;
      const paperChanged = existingProfile?.currentPaperG !== estimateResult.paperG;
      if (plasticChanged || paperChanged) {
        await prisma.productEstimateHistory.create({
          data: {
            productId: id,
            oldPlasticG: existingProfile?.currentPlasticG ?? null,
            oldPaperG: existingProfile?.currentPaperG ?? null,
            newPlasticG: estimateResult.plasticG,
            newPaperG: estimateResult.paperG,
            reason: "Produkt-Update (manuelle Änderung)",
            method: estimateResult.method,
          },
        });
      }
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Product update error:", error);
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    );
  }
}
