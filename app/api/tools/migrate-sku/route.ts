import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tools/migrate-sku — dry run analysis
// Note: SKU has been renamed to EAN. This tool is kept for legacy migration purposes.
// Returns stats about how many products would be affected
export async function GET() {
  try {
    // Count products where ean is set but internalArticleNumber is null
    const eanOnly = await prisma.product.count({
      where: {
        ean: { not: "" },
        internalArticleNumber: null,
      },
    });

    // Use raw SQL for ean == internalArticleNumber
    const dupResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE ean IS NOT NULL
        AND ean <> ''
        AND "internalArticleNumber" IS NOT NULL
        AND ean = "internalArticleNumber"
    `;
    const duplicateExact = Number(dupResult[0].count);

    // Preview: first 10 products with ean set but no internalArticleNumber
    const preview = await prisma.product.findMany({
      where: {
        ean: { not: "" },
        internalArticleNumber: null,
      },
      select: {
        id: true,
        ean: true,
        internalArticleNumber: true,
        productName: true,
      },
      take: 10,
      orderBy: { productName: "asc" },
    });

    return NextResponse.json({
      eanOnlyCount: eanOnly,
      duplicateExactCount: duplicateExact,
      preview,
    });
  } catch (error) {
    console.error("migrate-ean dry-run error:", error);
    return NextResponse.json({ error: "Failed to analyze" }, { status: 500 });
  }
}

// POST /api/tools/migrate-sku
// Body: { action: "copy_to_internal" | "copy_and_clear" | "clear_duplicate" }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action: string = body.action ?? "copy_to_internal";

    if (!["copy_to_internal", "copy_and_clear", "clear_duplicate"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    let affected = 0;

    if (action === "copy_to_internal" || action === "copy_and_clear") {
      const products = await prisma.product.findMany({
        where: { ean: { not: "" }, internalArticleNumber: null },
        select: { id: true, ean: true },
      });

      for (const p of products) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            internalArticleNumber: p.ean,
            ...(action === "copy_and_clear" ? { ean: p.id } : {}),
          },
        });
        affected++;
      }
    }

    if (action === "clear_duplicate") {
      const dupes = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Product"
        WHERE ean IS NOT NULL AND ean <> ''
          AND "internalArticleNumber" IS NOT NULL
          AND ean = "internalArticleNumber"
      `;
      for (const { id } of dupes) {
        await prisma.product.update({
          where: { id },
          data: { ean: id },
        });
        affected++;
      }
    }

    return NextResponse.json({ ok: true, affected });
  } catch (error) {
    console.error("migrate-ean execute error:", error);
    return NextResponse.json({ error: "Failed to migrate" }, { status: 500 });
  }
}
