import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estimatePackaging } from "@/lib/estimation";

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

    // Re-run estimation after update
    await estimatePackaging(id);

    return NextResponse.json(product);
  } catch (error) {
    console.error("Product update error:", error);
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    );
  }
}
