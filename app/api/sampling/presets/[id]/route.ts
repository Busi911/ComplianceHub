import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sampling/presets/[id] — get preset with resolved product data
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preset = await prisma.samplingPreset.findUnique({ where: { id } });
  if (!preset) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const productIds: string[] = JSON.parse(preset.productIds);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      ean: true,
      internalArticleNumber: true,
      productName: true,
      manufacturer: true,
      brand: true,
      category: true,
      subcategory: true,
      grossWeightG: true,
      packagingProfile: { select: { confidenceScore: true, status: true } },
    },
  });

  // Return products in the order they were saved in the preset
  const productMap = new Map(products.map((p) => [p.id, p]));
  const orderedProducts = productIds.map((pid) => productMap.get(pid)).filter(Boolean);

  return NextResponse.json({ ...preset, products: orderedProducts });
}

// PUT /api/sampling/presets/[id] — update name/description/productIds
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const data: { name?: string; description?: string; productIds?: string } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (Array.isArray(body.productIds)) data.productIds = JSON.stringify(body.productIds);

  const preset = await prisma.samplingPreset.update({ where: { id }, data });
  return NextResponse.json(preset);
}

// DELETE /api/sampling/presets/[id] — delete preset
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.samplingPreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
