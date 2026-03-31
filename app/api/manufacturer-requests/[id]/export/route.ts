import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(fields: unknown[]): string {
  return fields.map(escapeCSV).join(";");
}

// GET /api/manufacturer-requests/[id]/export
// Returns a CSV with EAN + product data + fields still missing from manufacturer
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
                subcategory: true,
                netWeightG: true,
                grossWeightG: true,
                mfrNetWeightG: true,
                mfrGrossWeightG: true,
                mfrPlasticG: true,
                mfrPaperG: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const bom = "\uFEFF";

    const headers = [
      "EAN",
      "Produktname",
      "Hersteller",
      "Marke",
      "Kategorie",
      "Unterkategorie",
      "System-ID",
      // Current values (read-only reference)
      "Netto-Gewicht aktuell (g)",
      "Brutto-Gewicht aktuell (g)",
      // Manufacturer fields to fill in (empty = missing)
      "Hersteller-Nettogewicht (g)",
      "Hersteller-Bruttogewicht (g)",
      "Hersteller-Kunststoff (g)",
      "Hersteller-Papier (g)",
      // Status columns
      "Nettogewicht fehlt",
      "Bruttogewicht fehlt",
      "Kunststoff fehlt",
      "Papier fehlt",
      // Notes
      "Hinweis",
    ];

    const lines = [row(headers)];

    for (const item of req.items) {
      const p = item.product;
      const missingNet = p.mfrNetWeightG == null ? "JA" : "";
      const missingGross = p.mfrGrossWeightG == null ? "JA" : "";
      const missingPlastic = p.mfrPlasticG == null ? "JA" : "";
      const missingPaper = p.mfrPaperG == null ? "JA" : "";

      lines.push(row([
        p.ean,
        p.productName,
        p.manufacturer,
        p.brand,
        p.category,
        p.subcategory,
        p.id,
        p.netWeightG,
        p.grossWeightG,
        p.mfrNetWeightG,
        p.mfrGrossWeightG,
        p.mfrPlasticG,
        p.mfrPaperG,
        missingNet,
        missingGross,
        missingPlastic,
        missingPaper,
        item.notes,
      ]));
    }

    const csv = bom + lines.join("\r\n");

    // Safe filename: remove non-alphanumeric chars from manufacturer name
    const safeName = req.manufacturerName.replace(/[^a-zA-Z0-9\-_äöüÄÖÜ]/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `herstelleranfrage_${safeName}_${date}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Row-Count": String(req.items.length),
      },
    });
  } catch (error) {
    console.error("manufacturer-requests export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
