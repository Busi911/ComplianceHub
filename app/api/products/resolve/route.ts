import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/products/resolve
// Body: { identifiers: string[] }
// Each identifier is matched against: ean (exact), internalArticleNumber (exact), then productName (icontains)
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
    // Strategy 1: exact EAN match
    const byEan = await prisma.product.findMany({
      where: { ean: { in: unique } },
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

    // Strategy 2: exact internalArticleNumber match
    const byInternal = await prisma.product.findMany({
      where: {
        internalArticleNumber: { in: unique },
        id: { notIn: byEan.map((p) => p.id) },
      },
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

    const foundById = new Map<string, (typeof byEan)[0]>();
    for (const p of [...byEan, ...byInternal]) foundById.set(p.id, p);

    // Build result: for each identifier, find the best match
    const resolved: Array<{ identifier: string; product: (typeof byEan)[0] }> = [];
    const unresolved: string[] = [];

    for (const identifier of unique) {
      const byEanMatch = byEan.find((p) => p.ean === identifier);
      if (byEanMatch) {
        resolved.push({ identifier, product: byEanMatch });
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
