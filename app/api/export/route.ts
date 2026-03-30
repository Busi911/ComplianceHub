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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? "";
    const status = searchParams.get("status") ?? "";

    const where: Record<string, unknown> = {};
    if (category) where.category = { equals: category, mode: "insensitive" };
    if (status) where.packagingProfile = { status: status.toUpperCase() };

    const products = await prisma.product.findMany({
      where,
      include: {
        packagingProfile: true,
        _count: { select: { samplingRecords: true } },
      },
      orderBy: [{ category: "asc" }, { productName: "asc" }],
    });

    const headers = [
      "SKU",
      "Interne Art.-Nr.",
      "Produktname",
      "Hersteller",
      "Marke",
      "Kategorie",
      "Unterkategorie",
      "EK-Preis (EUR)",
      "Nettogewicht (g)",
      "Bruttogewicht (g)",
      "Netto L (mm)",
      "Netto B (mm)",
      "Netto H (mm)",
      "Brutto L (mm)",
      "Brutto B (mm)",
      "Brutto H (mm)",
      "Status",
      "Kunststoff aktuell (g)",
      "Papier aktuell (g)",
      "Kunststoff geschätzt (g)",
      "Papier geschätzt (g)",
      "Kunststoff gemessen (g)",
      "Papier gemessen (g)",
      "Konfidenz (%)",
      "Schätzmethode",
      "Anzahl Stichproben",
      "Quelle",
    ];

    const lines: string[] = [row(headers)];

    for (const p of products) {
      const pp = p.packagingProfile;
      lines.push(
        row([
          p.sku,
          p.internalArticleNumber,
          p.productName,
          p.manufacturer,
          p.brand,
          p.category,
          p.subcategory,
          p.ekPrice,
          p.netWeightG,
          p.grossWeightG,
          p.netLengthMm,
          p.netWidthMm,
          p.netHeightMm,
          p.grossLengthMm,
          p.grossWidthMm,
          p.grossHeightMm,
          pp?.status ?? "",
          pp?.currentPlasticG,
          pp?.currentPaperG,
          pp?.estimatedPlasticG,
          pp?.estimatedPaperG,
          pp?.measuredPlasticG,
          pp?.measuredPaperG,
          pp?.confidenceScore != null ? Math.round(pp.confidenceScore * 100) : "",
          pp?.estimationMethod,
          p._count.samplingRecords,
          p.source,
        ])
      );
    }

    // UTF-8 BOM so Excel opens it correctly with umlauts
    const bom = "\uFEFF";
    const csv = bom + lines.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="compliancehub_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
