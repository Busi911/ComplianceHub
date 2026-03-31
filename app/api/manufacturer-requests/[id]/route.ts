import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/manufacturer-requests/[id]
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const req = await prisma.manufacturerRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                ean: true,
                productName: true,
                manufacturer: true,
                brand: true,
                category: true,
                mfrNetWeightG: true,
                mfrGrossWeightG: true,
                mfrPlasticG: true,
                mfrPaperG: true,
                netWeightG: true,
                grossWeightG: true,
              },
            },
          },
        },
      },
    });
    if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(req);
  } catch (error) {
    console.error("manufacturer-requests/[id] GET error:", error);
    return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  }
}

// PUT /api/manufacturer-requests/[id] — update status / notes / email
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, notes, contactEmail, addProductIds, removeProductIds } = body as {
      status?: string;
      notes?: string;
      contactEmail?: string;
      addProductIds?: string[];
      removeProductIds?: string[];
    };

    const existing = await prisma.manufacturerRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Run product add/remove in parallel with update
    const ops: Promise<unknown>[] = [
      prisma.manufacturerRequest.update({
        where: { id },
        data: {
          ...(status !== undefined && { status }),
          ...(notes !== undefined && { notes }),
          ...(contactEmail !== undefined && { contactEmail: contactEmail || null }),
        },
      }),
    ];

    if (addProductIds?.length) {
      ops.push(
        prisma.manufacturerRequestItem.createMany({
          data: addProductIds.map((productId) => ({ requestId: id, productId })),
          skipDuplicates: true,
        })
      );
    }

    if (removeProductIds?.length) {
      ops.push(
        prisma.manufacturerRequestItem.deleteMany({
          where: { requestId: id, productId: { in: removeProductIds } },
        })
      );
    }

    await Promise.all(ops);

    const updated = await prisma.manufacturerRequest.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, ean: true, productName: true, manufacturer: true, category: true },
            },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("manufacturer-requests/[id] PUT error:", error);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}

// DELETE /api/manufacturer-requests/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.manufacturerRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("manufacturer-requests/[id] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete request" }, { status: 500 });
  }
}
