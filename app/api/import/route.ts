import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as iconv from "iconv-lite";
import { prisma } from "@/lib/prisma";
import { validateProductInput } from "@/lib/validation";
import { updateProfileAfterSampling } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

/**
 * Detects file encoding and returns UTF-8 string.
 * Handles UTF-8 (with/without BOM) and Windows-1252 / Latin-1 (common in German Excel exports).
 */
function decodeBuffer(buffer: Buffer): string {
  // UTF-8 BOM
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString("utf-8");
  }
  // Try UTF-8 — if it round-trips cleanly, use it
  const utf8 = buffer.toString("utf-8");
  // Replacement character U+FFFD indicates invalid UTF-8 bytes → fall back to Windows-1252
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }
  // Fall back to Windows-1252 (covers all German umlauts from Excel)
  return iconv.decode(buffer, "windows-1252");
}

// CSV column → Product field mapping (flexible, case-insensitive)
const FIELD_MAP: Record<string, string> = {
  sku: "sku",
  "art.-nr": "sku",
  "art.nr": "sku",
  artikelnummer: "sku",
  "artikel-nr": "sku",
  "interne artikelnummer": "internalArticleNumber",
  "interne art.-nr": "internalArticleNumber",
  "int. art.-nr": "internalArticleNumber",
  "int.art.nr": "internalArticleNumber",
  "interne nr": "internalArticleNumber",
  "interne nr.": "internalArticleNumber",
  "intern": "internalArticleNumber",
  "artikel nr intern": "internalArticleNumber",
  internalarticlenumber: "internalArticleNumber",
  hersteller: "manufacturer",
  manufacturer: "manufacturer",
  marke: "brand",
  brand: "brand",
  produktname: "productName",
  "produkt name": "productName",
  productname: "productName",
  name: "productName",
  bezeichnung: "productName",
  kategorie: "category",
  category: "category",
  unterkategorie: "subcategory",
  subcategory: "subcategory",
  "ek-preis": "ekPrice",
  ekpreis: "ekPrice",
  "ek preis": "ekPrice",
  einkaufspreis: "ekPrice",
  ekprice: "ekPrice",
  price: "ekPrice",
  "netto-gewicht": "netWeightG",
  nettogewicht: "netWeightG",
  netweight: "netWeightG",
  netweightg: "netWeightG",
  "netto gewicht g": "netWeightG",
  "brutto-gewicht": "grossWeightG",
  bruttogewicht: "grossWeightG",
  grossweight: "grossWeightG",
  grossweightg: "grossWeightG",
  "brutto gewicht g": "grossWeightG",
  "netto-länge": "netLengthMm",
  nettolänge: "netLengthMm",
  netlength: "netLengthMm",
  "netto-breite": "netWidthMm",
  nettobreite: "netWidthMm",
  netwidth: "netWidthMm",
  "netto-höhe": "netHeightMm",
  nettohöhe: "netHeightMm",
  netheight: "netHeightMm",
  "brutto-länge": "grossLengthMm",
  bruttolänge: "grossLengthMm",
  grosslength: "grossLengthMm",
  "brutto-breite": "grossWidthMm",
  bruttobreite: "grossWidthMm",
  grosswidth: "grossWidthMm",
  "brutto-höhe": "grossHeightMm",
  bruttohöhe: "grossHeightMm",
  grossheight: "grossHeightMm",
  quelle: "source",
  source: "source",
  jahresabsatz: "annualUnitsSold",
  "jahresabsatz (stk)": "annualUnitsSold",
  "jahresabsatz (stk.)": "annualUnitsSold",
  "annual units sold": "annualUnitsSold",
  "absatz stk": "annualUnitsSold",
  annualunitssold: "annualUnitsSold",
};

function normalizeKey(key: string): string {
  // Strip parenthetical unit suffixes like "(g)", "(mm)", "(EUR)", "(€)" so
  // column headers with units ("Netto-Gewicht (g)") match the same as without.
  return key
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "") // remove trailing "(...)"
    .replace(/\s+/g, " ")
    .trim();
}

function mapRow(row: Record<string, string>): Record<string, string | number | null> {
  const mapped: Record<string, string | number | null> = {};

  for (const [rawKey, value] of Object.entries(row)) {
    const normalized = normalizeKey(rawKey);
    const field = FIELD_MAP[normalized];
    if (field) {
      const trimmed = value?.trim() ?? "";
      if (trimmed === "" || trimmed === "-" || trimmed === "n/a") {
        mapped[field] = null;
      } else if (field === "annualUnitsSold") {
        const num = parseInt(trimmed.replace(",", "."), 10);
        mapped[field] = isNaN(num) ? null : num;
      } else if (
        [
          "ekPrice",
          "netWeightG",
          "grossWeightG",
          "netLengthMm",
          "netWidthMm",
          "netHeightMm",
          "grossLengthMm",
          "grossWidthMm",
          "grossHeightMm",
        ].includes(field)
      ) {
        const num = parseFloat(trimmed.replace(",", "."));
        mapped[field] = isNaN(num) ? null : num;
      } else {
        mapped[field] = trimmed || null;
      }
    }
  }

  return mapped;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const batchName = (formData.get("batchName") as string) || "Import";
    const dryRun = formData.get("dryRun") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const text = decodeBuffer(Buffer.from(arrayBuffer));

    let rows: Record<string, string>[];
    try {
      rows = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter: [",", ";"],
        relax_column_count: true,
      });
    } catch {
      return NextResponse.json(
        { error: "CSV parsing failed. Please check the file format." },
        { status: 400 }
      );
    }

    // Filter out rows where every value is empty/whitespace (trailing empty lines
    // that csv-parse didn't skip because they contained only delimiters)
    rows = rows.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).trim() !== "")
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty" },
        { status: 400 }
      );
    }

    // Build column mapping from actual CSV headers so the UI can show
    // which columns were recognized, which were ignored, and what they map to.
    const FIELD_LABELS: Record<string, string> = {
      sku: "SKU",
      internalArticleNumber: "Interne Art.-Nr.",
      productName: "Produktname",
      manufacturer: "Hersteller",
      brand: "Marke",
      category: "Kategorie",
      subcategory: "Unterkategorie",
      ekPrice: "EK-Preis",
      netWeightG: "Nettogewicht (g)",
      grossWeightG: "Bruttogewicht (g) ⚡",
      netLengthMm: "Netto-Länge (mm)",
      netWidthMm: "Netto-Breite (mm)",
      netHeightMm: "Netto-Höhe (mm)",
      grossLengthMm: "Brutto-Länge (mm)",
      grossWidthMm: "Brutto-Breite (mm)",
      grossHeightMm: "Brutto-Höhe (mm)",
      annualUnitsSold: "Jahresabsatz (Stk.)",
      source: "Quelle",
    };

    const columnMappings = Object.keys(rows[0]).map((csvCol) => {
      const field = FIELD_MAP[normalizeKey(csvCol)] ?? null;
      return {
        csvColumn: csvCol,
        mappedField: field,
        fieldLabel: field ? (FIELD_LABELS[field] ?? field) : null,
      };
    });
    const unmappedColumns = columnMappings
      .filter((m) => !m.mappedField)
      .map((m) => m.csvColumn);

    const results: {
      row: number;
      sku: string | null;
      status: "success" | "updated" | "error" | "warning";
      errors: string[];
      warnings: string[];
      data: Record<string, unknown>;
    }[] = [];

    let successCount = 0;
    let errorCount = 0;

    // Create import batch record (even for dry run, so we can return batch info)
    let batch = null;
    if (!dryRun) {
      batch = await prisma.importBatch.create({
        data: {
          name: batchName,
          sourceFileName: file.name,
          rowCount: rows.length,
        },
      });
    }

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const mapped = mapRow(rawRow);
      const rowNum = i + 1;

      const validation = validateProductInput(mapped as Parameters<typeof validateProductInput>[0]);

      if (!validation.isValid) {
        errorCount++;
        results.push({
          row: rowNum,
          sku: (mapped.sku as string) ?? null,
          status: "error",
          errors: validation.errors,
          warnings: validation.warnings,
          data: mapped,
        });
        continue;
      }

      if (!dryRun && batch) {
        try {
          const upsertData = {
            sku: mapped.sku as string,
            internalArticleNumber: (mapped.internalArticleNumber as string) || null,
            productName: (mapped.productName as string) || "",
            manufacturer: (mapped.manufacturer as string) || null,
            brand: (mapped.brand as string) || null,
            category: (mapped.category as string) || null,
            subcategory: (mapped.subcategory as string) || null,
            ekPrice: mapped.ekPrice as number | null,
            netWeightG: mapped.netWeightG as number | null,
            grossWeightG: mapped.grossWeightG as number | null,
            netLengthMm: mapped.netLengthMm as number | null,
            netWidthMm: mapped.netWidthMm as number | null,
            netHeightMm: mapped.netHeightMm as number | null,
            grossLengthMm: mapped.grossLengthMm as number | null,
            grossWidthMm: mapped.grossWidthMm as number | null,
            grossHeightMm: mapped.grossHeightMm as number | null,
            annualUnitsSold: mapped.annualUnitsSold as number | null,
            source: (mapped.source as string) || null,
            importBatchId: batch.id,
          };

          const existing = await prisma.product.findUnique({
            where: { sku: upsertData.sku },
          });

          const product = await prisma.product.upsert({
            where: { sku: upsertData.sku },
            create: upsertData,
            update: {
              ...upsertData,
              // Don't overwrite importBatchId on update to keep original batch
              importBatchId: existing?.importBatchId ?? batch.id,
            },
          });

          // Create IMPORTED packaging profile if none exists
          await prisma.productPackagingProfile.upsert({
            where: { productId: product.id },
            create: {
              productId: product.id,
              status: PackagingStatus.IMPORTED,
            },
            update: {},
          });

          // Try to run initial estimation
          await updateProfileAfterSampling(product.id).catch(() => null);

          successCount++;
          results.push({
            row: rowNum,
            sku: upsertData.sku,
            status: existing ? "updated" : "success",
            errors: [],
            warnings: validation.warnings,
            data: mapped,
          });
        } catch (err) {
          errorCount++;
          results.push({
            row: rowNum,
            sku: (mapped.sku as string) ?? null,
            status: "error",
            errors: [
              `Database error: ${err instanceof Error ? err.message : "unknown"}`,
            ],
            warnings: [],
            data: mapped,
          });
        }
      } else {
        // Dry run
        successCount++;
        results.push({
          row: rowNum,
          sku: (mapped.sku as string) ?? null,
          status: validation.warnings.length > 0 ? "warning" : "success",
          errors: [],
          warnings: validation.warnings,
          data: mapped,
        });
      }
    }

    // Update batch counts
    if (!dryRun && batch) {
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { successCount, errorCount },
      });
    }

    return NextResponse.json({
      batchId: batch?.id ?? null,
      dryRun,
      totalRows: rows.length,
      successCount,
      errorCount,
      results,
      columnMappings,
      unmappedColumns,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Import failed: " + (error instanceof Error ? error.message : "unknown error") },
      { status: 500 }
    );
  }
}
