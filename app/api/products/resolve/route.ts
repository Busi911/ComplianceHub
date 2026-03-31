import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/products/resolve
// Body: { identifiers: string[] }
// Each identifier is matched against: sku (exact), internalArticleNumber (exact), then productName (icontains)
// Returns: { resolved: Product[], unresolved: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifiers: string[] = body.identifiers ?? [];

    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: "identifiers array required" }, { status: 400 });
    }
    if (identifiers.length > 500) {
      return NextResponse.json({ error: "max 500 identifiers per request" }, { status: 400 });
    }

    const unique = [...new Set(identifiers.map((s) => String(s).trim()).filter(Boolean))];

    // Fetch candidates in one query per strategy to avoid N+1
    // Strategy 1: exact SKU match
    const bySku = await prisma.product.findMany({
      where: { sku: { in: unique } },
      select: {
        id: true,
        sku: true,
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

    // Strategy 2: exact internalArticleNumber match
    const byInternal = await prisma.product.findMany({
      where: {
        internalArticleNumber: { in: unique },
        id: { notIn: bySku.map((p) => p.id) },
      },
      select: {
        id: true,
        sku: true,
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

    const foundById = new Map<string, (typeof bySku)[0]>();
    for (const p of [...bySku, ...byInternal]) foundById.set(p.id, p);

    // Build result: for each identifier, find the best match
    const resolved: Array<{ identifier: string; product: (typeof bySku)[0] }> = [];
    const unresolved: string[] = [];

    for (const identifier of unique) {
      const bySkuMatch = bySku.find((p) => p.sku === identifier);
      if (bySkuMatch) {
        resolved.push({ identifier, product: bySkuMatch });
        continue;
      }
      const byInternalMatch = byInternal.find((p) => p.internalArticleNumber === identifier);
      if (byInternalMatch) {
        resolved.push({ identifier, product: byInternalMatch });
        continue;
      }
      unresolved.push(identifier);
    }

    // For unresolved: try loose productName match (only if few enough to be useful)
    const stillUnresolved: string[] = [];
    if (unresolved.length > 0 && unresolved.length <= 50) {
      const alreadyFoundIds = new Set(resolved.map((r) => r.product.id));
      for (const identifier of unresolved) {
        const nameMatch = await prisma.product.findFirst({
          where: {
            productName: { contains: identifier, mode: "insensitive" },
            id: { notIn: [...alreadyFoundIds] },
          },
          select: {
            id: true,
            sku: true,
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
        if (nameMatch) {
          resolved.push({ identifier, product: nameMatch });
          alreadyFoundIds.add(nameMatch.id);
        } else {
          stillUnresolved.push(identifier);
        }
      }
    } else {
      stillUnresolved.push(...unresolved);
    }

    return NextResponse.json({
      resolved,
      unresolved: stillUnresolved,
    });
  } catch (error) {
    console.error("Resolve error:", error);
    return NextResponse.json({ error: "Failed to resolve identifiers" }, { status: 500 });
  }
}
