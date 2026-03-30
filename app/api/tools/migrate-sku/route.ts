import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tools/migrate-sku — dry run analysis
// Returns stats about how many products would be affected
export async function GET() {
  try {
    // Count products where sku is set but internalArticleNumber is null
    // These are the most likely candidates: user only has the internal number in sku
    const skuOnly = await prisma.product.count({
      where: {
        sku: { not: "" },
        internalArticleNumber: null,
      },
    });

    // Count products where sku == internalArticleNumber (clear duplicate)
    const duplicate = await prisma.product.count({
      where: {
        AND: [
          { sku: { not: "" } },
          { internalArticleNumber: { not: null } },
          // Prisma doesn't support field-to-field comparison directly, use raw
        ],
      },
    });

    // Use raw SQL for sku == internalArticleNumber
    const dupResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE sku IS NOT NULL
        AND sku <> ''
        AND "internalArticleNumber" IS NOT NULL
        AND sku = "internalArticleNumber"
    `;
    const duplicateExact = Number(dupResult[0].count);

    // Preview: first 10 products with sku set but no internalArticleNumber
    const preview = await prisma.product.findMany({
      where: {
        sku: { not: "" },
        internalArticleNumber: null,
      },
      select: {
        id: true,
        sku: true,
        internalArticleNumber: true,
        productName: true,
      },
      take: 10,
      orderBy: { productName: "asc" },
    });

    return NextResponse.json({
      skuOnlyCount: skuOnly,
      duplicateExactCount: duplicateExact,
      preview,
    });
  } catch (error) {
    console.error("migrate-sku dry-run error:", error);
    return NextResponse.json({ error: "Failed to analyze" }, { status: 500 });
  }
}

// POST /api/tools/migrate-sku
// Body: { action: "copy_to_internal" | "swap" | "copy_and_clear" }
//   copy_to_internal: copies sku → internalArticleNumber (only where internalArticleNumber is null), keeps sku
//   copy_and_clear:   copies sku → internalArticleNumber (only where internalArticleNumber is null), then clears sku
//   clear_duplicate:  clears sku where sku == internalArticleNumber exactly
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action: string = body.action ?? "copy_to_internal";

    if (!["copy_to_internal", "copy_and_clear", "clear_duplicate"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    let affected = 0;

    if (action === "copy_to_internal" || action === "copy_and_clear") {
      // Copy sku → internalArticleNumber for products that have no internalArticleNumber
      const products = await prisma.product.findMany({
        where: { sku: { not: "" }, internalArticleNumber: null },
        select: { id: true, sku: true },
      });

      for (const p of products) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            internalArticleNumber: p.sku,
            ...(action === "copy_and_clear" ? { sku: `__cleared_${p.id.slice(0, 8)}` } : {}),
          },
        });
        affected++;
      }
    }

    if (action === "clear_duplicate") {
      // Clear sku where sku == internalArticleNumber
      const dupes = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Product"
        WHERE sku IS NOT NULL AND sku <> ''
          AND "internalArticleNumber" IS NOT NULL
          AND sku = "internalArticleNumber"
      `;
      for (const { id } of dupes) {
        await prisma.product.update({
          where: { id },
          data: { sku: `__cleared_${id.slice(0, 8)}` },
        });
        affected++;
      }
    }

    return NextResponse.json({ ok: true, affected });
  } catch (error) {
    console.error("migrate-sku execute error:", error);
    return NextResponse.json({ error: "Failed to migrate" }, { status: 500 });
  }
}
