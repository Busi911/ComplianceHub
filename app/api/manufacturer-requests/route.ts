import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/manufacturer-requests — list all requests with items + product data
export async function GET() {
  try {
    const requests = await prisma.manufacturerRequest.findMany({
      orderBy: { createdAt: "desc" },
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
    return NextResponse.json(requests);
  } catch (error) {
    console.error("manufacturer-requests GET error:", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}

// POST /api/manufacturer-requests — create a new request
// Body: { manufacturerName: string, contactEmail?: string, notes?: string, productIds: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { manufacturerName, contactEmail, notes, productIds } = body as {
      manufacturerName: string;
      contactEmail?: string;
      notes?: string;
      productIds: string[];
    };

    if (!manufacturerName?.trim()) {
      return NextResponse.json({ error: "manufacturerName is required" }, { status: 400 });
    }
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: "At least one productId is required" }, { status: 400 });
    }

    const req = await prisma.manufacturerRequest.create({
      data: {
        manufacturerName: manufacturerName.trim(),
        contactEmail: contactEmail?.trim() || null,
        notes: notes?.trim() || null,
        items: {
          create: productIds.map((productId) => ({ productId })),
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                ean: true,
                productName: true,
                manufacturer: true,
                category: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(req, { status: 201 });
  } catch (error) {
    console.error("manufacturer-requests POST error:", error);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
}
