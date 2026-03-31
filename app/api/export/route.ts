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
    // mode=slim → only import-relevant columns (no packaging profile)
    // mode=full → all columns including estimation data (default)
    const mode = searchParams.get("mode") ?? "full";

    const where: Record<string, unknown> = {};
    if (category) where.category = { equals: category, mode: "insensitive" };
    if (status) where.packagingProfile = { status: status.toUpperCase() };

    const products = await prisma.product.findMany({
      where,
      select: {
        id: true,
        ean: true,
        internalArticleNumber: true,
        productName: true,
        manufacturer: true,
        brand: true,
        category: true,
        subcategory: true,
        ekPrice: true,
        netWeightG: true,
        grossWeightG: true,
        netLengthMm: true,
        netWidthMm: true,
        netHeightMm: true,
        grossLengthMm: true,
        grossWidthMm: true,
        grossHeightMm: true,
        mfrNetWeightG: true,
        mfrGrossWeightG: true,
        mfrPlasticG: true,
        mfrPaperG: true,
        annualUnitsSold: true,
        source: true,
        // Only select the specific profile fields used in the CSV (not the entire model)
        ...(mode !== "slim" && {
          packagingProfile: {
            select: {
              status: true,
              currentPlasticG: true,
              currentPaperG: true,
              estimatedPlasticG: true,
              estimatedPaperG: true,
              measuredPlasticG: true,
              measuredPaperG: true,
              confidenceScore: true,
              estimationMethod: true,
            },
          },
          _count: { select: { samplingRecords: true } },
        }),
      },
      orderBy: [{ category: "asc" }, { productName: "asc" }],
    });

    const bom = "\uFEFF";
    let csv: string;

    if (mode === "slim") {
      // Compact export: only the import-relevant columns
      // Ideal for bulk corrections — smaller file, faster to open in Excel
      const headers = [
        "EAN",
        "InterneArtNr",
        "Produktname",
        "Hersteller",
        "Marke",
        "Kategorie",
        "Unterkategorie",
        "EK-Preis (EUR)",
        "Netto-Gewicht (g)",
        "Brutto-Gewicht (g)",
        "Netto-Laenge (mm)",
        "Netto-Breite (mm)",
        "Netto-Hoehe (mm)",
        "Brutto-Laenge (mm)",
        "Brutto-Breite (mm)",
        "Brutto-Hoehe (mm)",
        "Jahresabsatz (Stk.)",
        "System-ID",
        "Hersteller-Nettogewicht (g)",
        "Hersteller-Bruttogewicht (g)",
        "Hersteller-Kunststoff (g)",
        "Hersteller-Papier (g)",
      ];
      const lines = [row(headers)];
      for (const p of products) {
        lines.push(row([
          p.ean,
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
          p.annualUnitsSold,
          p.id,
          p.mfrNetWeightG,
          p.mfrGrossWeightG,
          p.mfrPlasticG,
          p.mfrPaperG,
        ]));
      }
      csv = bom + lines.join("\r\n");
    } else {
      // Full export: all columns including packaging/estimation data
      const headers = [
        "EAN",
        "InterneArtNr",
        "Produktname",
        "Hersteller",
        "Marke",
        "Kategorie",
        "Unterkategorie",
        "EK-Preis (EUR)",
        "Netto-Gewicht (g)",
        "Brutto-Gewicht (g)",
        "Netto-Laenge (mm)",
        "Netto-Breite (mm)",
        "Netto-Hoehe (mm)",
        "Brutto-Laenge (mm)",
        "Brutto-Breite (mm)",
        "Brutto-Hoehe (mm)",
        "Jahresabsatz (Stk.)",
        "System-ID",
        "Hersteller-Nettogewicht (g)",
        "Hersteller-Bruttogewicht (g)",
        "Hersteller-Kunststoff (g)",
        "Hersteller-Papier (g)",
        "Status",
        "Kunststoff aktuell (g)",
        "Papier aktuell (g)",
        "Kunststoff geschaetzt (g)",
        "Papier geschaetzt (g)",
        "Kunststoff gemessen (g)",
        "Papier gemessen (g)",
        "Konfidenz (%)",
        "Schaetzmethode",
        "Anzahl Stichproben",
        "Quelle",
      ];
      const lines = [row(headers)];
      for (const p of products) {
        const pp = (p as typeof p & { packagingProfile?: { status: string; currentPlasticG: number | null; currentPaperG: number | null; estimatedPlasticG: number | null; estimatedPaperG: number | null; measuredPlasticG: number | null; measuredPaperG: number | null; confidenceScore: number | null; estimationMethod: string | null } | null }).packagingProfile;
        const count = (p as typeof p & { _count?: { samplingRecords: number } })._count;
        lines.push(row([
          p.ean,
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
          p.annualUnitsSold,
          p.id,
          p.mfrNetWeightG,
          p.mfrGrossWeightG,
          p.mfrPlasticG,
          p.mfrPaperG,
          pp?.status ?? "",
          pp?.currentPlasticG,
          pp?.currentPaperG,
          pp?.estimatedPlasticG,
          pp?.estimatedPaperG,
          pp?.measuredPlasticG,
          pp?.measuredPaperG,
          pp?.confidenceScore != null ? Math.round(pp.confidenceScore * 100) : "",
          pp?.estimationMethod,
          count?.samplingRecords,
          p.source,
        ]));
      }
      csv = bom + lines.join("\r\n");
    }

    const filename = mode === "slim"
      ? `compliancehub_stammdaten_${new Date().toISOString().slice(0, 10)}.csv`
      : `compliancehub_export_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Row-Count": String(products.length),
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
