import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateProfileAfterSampling, cascadeReestimateCategory } from "@/lib/estimation";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const record = await prisma.samplingRecord.findUnique({
      where: { id: params.id },
      select: { productId: true },
    });

    if (!record) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    await prisma.samplingRecord.delete({ where: { id: params.id } });

    // Re-run estimation after deletion
    await updateProfileAfterSampling(record.productId);

    const product = await prisma.product.findUnique({
      where: { id: record.productId },
      select: { category: true },
    });
    if (product?.category) {
      cascadeReestimateCategory(product.category, record.productId).catch(console.error);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Sampling delete error:", error);
    return NextResponse.json({ error: "Failed to delete sampling record" }, { status: 500 });
  }
}
