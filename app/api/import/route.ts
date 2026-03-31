import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as iconv from "iconv-lite";
import { prisma } from "@/lib/prisma";
import { validateProductInput } from "@/lib/validation";
import { updateProfileAfterSampling } from "@/lib/estimation";
import { PackagingStatus } from "@prisma/client";

// Allow large CSV uploads and enough time to process them
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
// Covers: import template names, export abbreviations, English names, common typos.
// normalizeKey() strips trailing "(unit)" before lookup, so "Netto-Gewicht (g)" → "netto-gewicht".
const FIELD_MAP: Record<string, string> = {
  // ── EAN / article number ────────────────────────────────────────────────────
  ean: "ean",
  gtin: "ean",
  "art.-nr": "ean",
  "art.nr": "ean",
  artikelnummer: "ean",
  "artikel-nr": "ean",
  sku: "ean",
  "lieferanten-art.-nr": "ean",
  "lieferanten art nr": "ean",
  "hersteller art nr": "ean",
  "hersteller-art.-nr": "ean",
  // ── Internal article number ──────────────────────────────────────────────────
  "interne artikelnummer": "internalArticleNumber",
  "interne art.-nr": "internalArticleNumber",
  "int. art.-nr": "internalArticleNumber",
  "int.art.nr": "internalArticleNumber",
  "interne nr": "internalArticleNumber",
  "interne nr.": "internalArticleNumber",
  intern: "internalArticleNumber",
  "intern. art.-nr": "internalArticleNumber",
  "artikel nr intern": "internalArticleNumber",
  internalarticlenumber: "internalArticleNumber",
  // Export-Spaltenname (kein Sonderzeichen, sicheres Mapping)
  // "InterneArtNr".toLowerCase() = "interneartnr"
  interneartnr: "internalArticleNumber",
  // ── Names / descriptions ────────────────────────────────────────────────────
  hersteller: "manufacturer",
  manufacturer: "manufacturer",
  marke: "brand",
  brand: "brand",
  produktname: "productName",
  "produkt name": "productName",
  productname: "productName",
  name: "productName",
  bezeichnung: "productName",
  artikelbezeichnung: "productName",
  // ── Category ────────────────────────────────────────────────────────────────
  kategorie: "category",
  category: "category",
  warengruppe: "category",
  unterkategorie: "subcategory",
  subcategory: "subcategory",
  untergruppe: "subcategory",
  // ── Price ────────────────────────────────────────────────────────────────────
  "ek-preis": "ekPrice",
  ekpreis: "ekPrice",
  "ek preis": "ekPrice",
  einkaufspreis: "ekPrice",
  ekprice: "ekPrice",
  price: "ekPrice",
  preis: "ekPrice",
  // ── Net weight ──────────────────────────────────────────────────────────────
  "netto-gewicht": "netWeightG",
  nettogewicht: "netWeightG",
  netweight: "netWeightG",
  netweightg: "netWeightG",
  "netto gewicht g": "netWeightG",
  gewicht: "netWeightG",
  weight: "netWeightG",
  // ── Gross weight ─────────────────────────────────────────────────────────────
  "brutto-gewicht": "grossWeightG",
  bruttogewicht: "grossWeightG",
  grossweight: "grossWeightG",
  grossweightg: "grossWeightG",
  "brutto gewicht g": "grossWeightG",
  "brutto-gewicht inkl. verpackung": "grossWeightG",
  // ── Net dimensions ───────────────────────────────────────────────────────────
  "netto-länge": "netLengthMm",
  nettolänge: "netLengthMm",
  netlength: "netLengthMm",
  "netto l": "netLengthMm",
  nettol: "netLengthMm",
  "netto-breite": "netWidthMm",
  nettobreite: "netWidthMm",
  netwidth: "netWidthMm",
  "netto b": "netWidthMm",
  nettob: "netWidthMm",
  "netto-höhe": "netHeightMm",
  nettohöhe: "netHeightMm",
  netheight: "netHeightMm",
  "netto h": "netHeightMm",
  nettoh: "netHeightMm",
  // ── Gross dimensions ─────────────────────────────────────────────────────────
  "brutto-länge": "grossLengthMm",
  bruttolänge: "grossLengthMm",
  grosslength: "grossLengthMm",
  "brutto l": "grossLengthMm",
  bruttol: "grossLengthMm",
  "brutto-breite": "grossWidthMm",
  bruttobreite: "grossWidthMm",
  grosswidth: "grossWidthMm",
  "brutto b": "grossWidthMm",
  bruttob: "grossWidthMm",
  "brutto-höhe": "grossHeightMm",
  bruttohöhe: "grossHeightMm",
  grossheight: "grossHeightMm",
  "brutto h": "grossHeightMm",
  bruttoh: "grossHeightMm",
  // ── Hersteller-Angaben ────────────────────────────────────────────────────────
  "hersteller-nettogewicht": "mfrNetWeightG",
  "hersteller nettogewicht": "mfrNetWeightG",
  mfrnetweightg: "mfrNetWeightG",
  "mfr-nettogewicht": "mfrNetWeightG",
  "hersteller-bruttogewicht": "mfrGrossWeightG",
  "hersteller bruttogewicht": "mfrGrossWeightG",
  mfrgrossweightg: "mfrGrossWeightG",
  "mfr-bruttogewicht": "mfrGrossWeightG",
  "hersteller-kunststoff": "mfrPlasticG",
  "hersteller kunststoff": "mfrPlasticG",
  mfrplasticg: "mfrPlasticG",
  "mfr-kunststoff": "mfrPlasticG",
  "hersteller-papier": "mfrPaperG",
  "hersteller papier": "mfrPaperG",
  mfrpaperg: "mfrPaperG",
  "mfr-papier": "mfrPaperG",
  // ── Other ────────────────────────────────────────────────────────────────────
  quelle: "source",
  source: "source",
  jahresabsatz: "annualUnitsSold",
  "jahresabsatz (stk)": "annualUnitsSold",
  "jahresabsatz (stk.)": "annualUnitsSold",
  "annual units sold": "annualUnitsSold",
  "absatz stk": "annualUnitsSold",
  annualunitssold: "annualUnitsSold",
  // ── System-ID (permanent record key, used for updates instead of EAN) ────────
  "system-id": "_systemId",
  systemid: "_systemId",
  "system id": "_systemId",
  "compliancehub-id": "_systemId",
  "compliance-id": "_systemId",
};

function normalizeKey(key: string): string {
  // Strip parenthetical unit suffixes like "(g)", "(mm)", "(EUR)", "(€)" so
  // column headers with units ("Netto-Gewicht (g)") match the same as without.
  return key
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "") // remove trailing "(...)"
    .replace(/\.+$/, "")             // remove trailing dots ("Art.-Nr." → "Art.-Nr")
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
      // _systemId is just a lookup key — store as-is (empty = not provided)
      if (field === "_systemId") {
        mapped[field] = trimmed || null;
        continue;
      }
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
          "mfrNetWeightG",
          "mfrGrossWeightG",
          "mfrPlasticG",
          "mfrPaperG",
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

    // Detect delimiter from the first non-empty line.
    // German Excel saves CSVs with semicolons AND uses commas as decimal separator —
    // auto-detection with [",",";"] can fail because decimal commas appear in data.
    // Strategy: count unquoted semicolons vs commas in the header line.
    // Prefer semicolon (the German locale default) when both appear equally.
    function detectDelimiter(raw: string): string {
      const firstLine = raw.split(/\r?\n/).find((l) => l.trim()) ?? "";
      // Count occurrences outside quoted strings
      let inQuote = false;
      let semicolons = 0;
      let commas = 0;
      for (const ch of firstLine) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (inQuote) continue;
        if (ch === ";") semicolons++;
        else if (ch === ",") commas++;
      }
      // Prefer semicolon; only use comma if zero semicolons and commas present
      return semicolons > 0 || commas === 0 ? ";" : ",";
    }

    const delimiter = detectDelimiter(text);

    let rows: Record<string, string>[];
    try {
      rows = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter,
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
      _systemId: "System-ID 🔑",
      ean: "EAN",
      internalArticleNumber: "InterneArtNr",
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
      mfrNetWeightG: "Hersteller-Nettogewicht (g) 🏭",
      mfrGrossWeightG: "Hersteller-Bruttogewicht (g) 🏭",
      mfrPlasticG: "Hersteller-Kunststoff (g) 🏭",
      mfrPaperG: "Hersteller-Papier (g) 🏭",
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
      ean: string | null;
      status: "success" | "updated" | "error" | "warning";
      errors: string[];
      warnings: string[];
      data: Record<string, unknown>;
    }[] = [];

    let successCount = 0;
    let errorCount = 0;

    // Create import batch record (even for dry run, so we can return batch info)
    let batch: { id: string } | null = null;
    if (!dryRun) {
      batch = await prisma.importBatch.create({
        data: {
          name: batchName,
          sourceFileName: file.name,
          rowCount: rows.length,
        },
      });
    }

    // Process rows in parallel batches for speed.
    // Larger batch size for better throughput on big files.
    const BATCH_SIZE = 50;

    type RowResult = (typeof results)[0];

    // Numeric fields that should NOT overwrite existing DB values when the CSV cell is empty.
    // If a column is absent from the CSV, mapped[field] is undefined → Prisma skips it (correct).
    // If a column IS present but empty, mapped[field] = null → would overwrite existing value (BUG).
    // Fix: for UPDATE, strip null values for these sparse numeric fields.
    const SPARSE_NUMERIC_FIELDS = new Set([
      "netWeightG", "grossWeightG",
      "netLengthMm", "netWidthMm", "netHeightMm",
      "grossLengthMm", "grossWidthMm", "grossHeightMm",
      "ekPrice", "annualUnitsSold",
      "mfrNetWeightG", "mfrGrossWeightG", "mfrPlasticG", "mfrPaperG",
    ]);

    function buildUpdateFields(base: Record<string, unknown>): Record<string, unknown> {
      return Object.fromEntries(
        Object.entries(base).filter(([k, v]) =>
          !(SPARSE_NUMERIC_FIELDS.has(k) && (v === null || v === undefined))
        )
      );
    }

    async function processRow(rawRow: Record<string, string>, rowNum: number): Promise<RowResult> {
      const mapped = mapRow(rawRow);
      const systemId = mapped._systemId as string | null;

      // EAN is required UNLESS a System-ID is provided (in that case the existing record's EAN is used).
      const hasSystemId = !!systemId;
      const validationInput = hasSystemId
        ? { ...mapped, ean: (mapped.ean as string) || "_lookup_" } // satisfy validator temporarily
        : mapped;
      const validation = validateProductInput(validationInput as Parameters<typeof validateProductInput>[0]);

      // Re-check: if ean error and we have a system-id, clear that specific error
      const errors = hasSystemId
        ? validation.errors.filter((e) => !e.includes("EAN"))
        : validation.errors;

      if (errors.length > 0) {
        errorCount++;
        return {
          row: rowNum,
          ean: (mapped.ean as string) ?? null,
          status: "error",
          errors,
          warnings: validation.warnings,
          data: mapped,
        };
      }

      if (!dryRun && batch) {
        try {
          const productFields = {
            ean: mapped.ean as string,
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
            mfrNetWeightG: mapped.mfrNetWeightG as number | null,
            mfrGrossWeightG: mapped.mfrGrossWeightG as number | null,
            mfrPlasticG: mapped.mfrPlasticG as number | null,
            mfrPaperG: mapped.mfrPaperG as number | null,
            annualUnitsSold: mapped.annualUnitsSold as number | null,
            source: (mapped.source as string) || null,
          };

          let product: { id: string };
          let isNew = false;

          if (systemId) {
            // ── System-ID path (preferred): look up by permanent ID ──────────
            const existingById = await prisma.product.findUnique({ where: { id: systemId } });
            if (existingById) {
              // Found by System-ID → update, keep existing EAN if not provided in CSV
              const updateData = buildUpdateFields({
                ...productFields,
                ean: productFields.ean || existingById.ean,
                importBatchId: existingById.importBatchId ?? batch.id,
              });
              product = await prisma.product.update({ where: { id: systemId }, data: updateData });
            } else {
              // System-ID not in DB → fall through to EAN-based upsert below
              const existingByEan = productFields.ean
                ? await prisma.product.findUnique({ where: { ean: productFields.ean } })
                : null;
              if (existingByEan) {
                product = await prisma.product.update({
                  where: { id: existingByEan.id },
                  data: { ...buildUpdateFields(productFields), importBatchId: existingByEan.importBatchId ?? batch.id },
                });
              } else if (productFields.ean) {
                product = await prisma.product.create({ data: { ...productFields, importBatchId: batch.id } });
                isNew = true;
              } else {
                throw new Error("System-ID nicht gefunden und keine EAN angegeben — Zeile übersprungen");
              }
            }
          } else {
            // ── No System-ID: EAN-based upsert ───────────────────────────────
            // Update if EAN already exists, create if new. EAN is required.
            const existingByEan = await prisma.product.findUnique({ where: { ean: productFields.ean } });
            if (existingByEan) {
              product = await prisma.product.update({
                where: { id: existingByEan.id },
                data: { ...buildUpdateFields(productFields), importBatchId: existingByEan.importBatchId ?? batch.id },
              });
            } else {
              product = await prisma.product.create({ data: { ...productFields, importBatchId: batch.id } });
              isNew = true;
            }
          }

          // Ensure packaging profile exists
          await prisma.productPackagingProfile.upsert({
            where: { productId: product.id },
            create: { productId: product.id, status: PackagingStatus.IMPORTED },
            update: {},
          });

          // Hersteller-Puffer: apply any pre-loaded manufacturer data for this EAN.
          // Fire-and-forget — buffer matching must never block or fail an import row.
          prisma.manufacturerDataBuffer.findFirst({
            where: { ean: productFields.ean, matchedProductId: null },
          }).then(async (bufferEntry) => {
            if (!bufferEntry) return;
            await prisma.product.update({
              where: { id: product.id },
              data: {
                ...(bufferEntry.mfrNetWeightG !== null ? { mfrNetWeightG: bufferEntry.mfrNetWeightG } : {}),
                ...(bufferEntry.mfrGrossWeightG !== null ? { mfrGrossWeightG: bufferEntry.mfrGrossWeightG } : {}),
                ...(bufferEntry.mfrPlasticG !== null ? { mfrPlasticG: bufferEntry.mfrPlasticG } : {}),
                ...(bufferEntry.mfrPaperG !== null ? { mfrPaperG: bufferEntry.mfrPaperG } : {}),
              },
            });
            await prisma.manufacturerDataBuffer.update({
              where: { id: bufferEntry.id },
              data: { matchedProductId: product.id, matchedAt: new Date() },
            });
          }).catch(console.error);

          // Estimation: fire-and-forget — don't block the response.
          // Runs in background; errors are logged but don't fail the import row.
          updateProfileAfterSampling(product.id).catch(console.error);

          successCount++;
          return {
            row: rowNum,
            ean: productFields.ean,
            status: isNew ? "success" : "updated",
            errors: [],
            warnings: validation.warnings,
            data: mapped,
          };
        } catch (err) {
          errorCount++;
          return {
            row: rowNum,
            ean: (mapped.ean as string) ?? null,
            status: "error",
            errors: [`Database error: ${err instanceof Error ? err.message : "unknown"}`],
            warnings: [],
            data: mapped,
          };
        }
      } else {
        // Dry run
        successCount++;
        return {
          row: rowNum,
          ean: (mapped.ean as string) ?? null,
          status: validation.warnings.length > 0 ? "warning" : "success",
          errors: [],
          warnings: validation.warnings,
          data: mapped,
        };
      }
    }

    // Execute in parallel batches
    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchRows = rows.slice(batchStart, batchStart + BATCH_SIZE);
      const batchResults = await Promise.all(
        batchRows.map((r, idx) => processRow(r, batchStart + idx + 1))
      );
      results.push(...batchResults);
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
      detectedDelimiter: delimiter === ";" ? "Semikolon (;)" : "Komma (,)",
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Import failed: " + (error instanceof Error ? error.message : "unknown error") },
      { status: 500 }
    );
  }
}
