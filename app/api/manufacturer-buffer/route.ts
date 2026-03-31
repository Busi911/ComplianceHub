import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as iconv from "iconv-lite";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ── Encoding detection ────────────────────────────────────────────────────────

function decodeBuffer(buffer: Buffer): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString("utf-8");
  }
  const utf8 = buffer.toString("utf-8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return iconv.decode(buffer, "windows-1252");
}

// ── Column normalisation ──────────────────────────────────────────────────────

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, "") // strip parenthetical units
    .replace(/\s+/g, " ")
    .trim();
}

// Known columns → internal field names
const BUFFER_FIELD_MAP: Record<string, string> = {
  // ── EAN ──────────────────────────────────────────────────────────────────────
  ean: "ean",
  gtin: "ean",
  sku: "ean",
  // ── Interne Artikelnummer ──────────────────────────────────────────────────
  "art.-nr": "internalArticleNr",
  "art.nr": "internalArticleNr",
  artikelnummer: "internalArticleNr",
  "artikel-nr": "internalArticleNr",
  "interne artikelnummer": "internalArticleNr",
  "interne art.-nr": "internalArticleNr",
  "int. art.-nr": "internalArticleNr",
  "int.art.nr": "internalArticleNr",
  "interne nr": "internalArticleNr",
  interneartnr: "internalArticleNr",
  "hersteller art nr": "internalArticleNr",
  "hersteller-art.-nr": "internalArticleNr",
  // ── Hersteller ────────────────────────────────────────────────────────────
  hersteller: "manufacturerName",
  manufacturer: "manufacturerName",
  herstellername: "manufacturerName",
  "hersteller name": "manufacturerName",
  lieferant: "manufacturerName",
  produktname: "productName",
  productname: "productName",
  bezeichnung: "productName",
  artikelbezeichnung: "productName",
  name: "productName",
  // Hersteller-Gewichte
  "hersteller-nettogewicht": "mfrNetWeightG",
  "hersteller nettogewicht": "mfrNetWeightG",
  mfrnetweightg: "mfrNetWeightG",
  "netto-gewicht": "mfrNetWeightG",
  nettogewicht: "mfrNetWeightG",
  netweight: "mfrNetWeightG",
  gewicht: "mfrNetWeightG",
  "hersteller-bruttogewicht": "mfrGrossWeightG",
  "hersteller bruttogewicht": "mfrGrossWeightG",
  mfrgrossweightg: "mfrGrossWeightG",
  "brutto-gewicht": "mfrGrossWeightG",
  bruttogewicht: "mfrGrossWeightG",
  grossweight: "mfrGrossWeightG",
  // Hersteller-Verpackungsmaterial
  "hersteller-kunststoff": "mfrPlasticG",
  "hersteller kunststoff": "mfrPlasticG",
  kunststoff: "mfrPlasticG",
  plastic: "mfrPlasticG",
  plasticg: "mfrPlasticG",
  mfrplasticg: "mfrPlasticG",
  "hersteller-papier": "mfrPaperG",
  "hersteller papier": "mfrPaperG",
  papier: "mfrPaperG",
  paper: "mfrPaperG",
  paperg: "mfrPaperG",
  mfrpaperg: "mfrPaperG",
};

const KNOWN_FIELDS = new Set(Object.values(BUFFER_FIELD_MAP));

function parseFloat_(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
}

// ── GET /api/manufacturer-buffer ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50")));
  const matched = searchParams.get("matched"); // "true" | "false" | null = all
  const eanSearch = searchParams.get("ean")?.trim() ?? "";

  const where = {
    ...(matched === "true" ? { matchedProductId: { not: null } } : {}),
    ...(matched === "false" ? { matchedProductId: null } : {}),
    ...(eanSearch ? { ean: { contains: eanSearch } } : {}),
  };

  const [total, unmatchedCount, matchedCount, items] = await Promise.all([
    prisma.manufacturerDataBuffer.count({ where }),
    prisma.manufacturerDataBuffer.count({ where: { matchedProductId: null } }),
    prisma.manufacturerDataBuffer.count({ where: { matchedProductId: { not: null } } }),
    prisma.manufacturerDataBuffer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        matchedProduct: {
          select: { id: true, productName: true, ean: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    unmatchedCount,
    matchedCount,
    page,
    pageSize,
    items,
  });
}

// ── POST /api/manufacturer-buffer — upload CSV ───────────────────────────────

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const manufacturerNameOverride = (formData.get("manufacturerName") as string | null)?.trim() || null;

  if (!file) {
    return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const text = decodeBuffer(Buffer.from(arrayBuffer));

  // Auto-detect delimiter
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";

  let rawRows: Record<string, string>[];
  try {
    rawRows = parse(text, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch {
    return NextResponse.json({ error: "CSV konnte nicht gelesen werden" }, { status: 400 });
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "CSV ist leer" }, { status: 400 });
  }

  // Build header→field map for this file
  const headers = Object.keys(rawRows[0]);
  const headerMap: Array<{ header: string; field: string | null }> = headers.map((h) => ({
    header: h,
    field: BUFFER_FIELD_MAP[normalizeKey(h)] ?? null,
  }));
  const extraHeaders = headerMap.filter((m) => !m.field && normalizeKey(m.header) !== "").map((m) => m.header);

  const entries: {
    ean: string | null;
    internalArticleNr: string | null;
    manufacturerName: string | null;
    productName: string | null;
    mfrNetWeightG: number | null;
    mfrGrossWeightG: number | null;
    mfrPlasticG: number | null;
    mfrPaperG: number | null;
    extraJson: string | null;
    sourceFileName: string;
  }[] = [];

  const skipped: string[] = [];

  for (const row of rawRows) {
    // Map known fields
    const mapped: Record<string, string | number | null> = {};
    for (const { header, field } of headerMap) {
      if (field) mapped[field] = row[header] ?? null;
    }

    const ean = (String(mapped.ean ?? "")).trim().replace(/\s/g, "") || null;
    const internalArticleNr = (String(mapped.internalArticleNr ?? "")).trim() || null;

    // Mindestens EAN oder interne Artikelnummer muss vorhanden sein
    if (!ean && !internalArticleNr) {
      skipped.push(JSON.stringify(row).slice(0, 80));
      continue;
    }

    // Collect extra columns as JSON
    const extra: Record<string, string> = {};
    for (const h of extraHeaders) {
      if (row[h] !== undefined && row[h] !== "") extra[h] = row[h];
    }

    entries.push({
      ean,
      internalArticleNr,
      manufacturerName: manufacturerNameOverride !== null
        ? manufacturerNameOverride
        : ((String(mapped.manufacturerName ?? "")).trim() || null),
      productName: (String(mapped.productName ?? "")).trim() || null,
      mfrNetWeightG: parseFloat_(mapped.mfrNetWeightG),
      mfrGrossWeightG: parseFloat_(mapped.mfrGrossWeightG),
      mfrPlasticG: parseFloat_(mapped.mfrPlasticG),
      mfrPaperG: parseFloat_(mapped.mfrPaperG),
      extraJson: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
      sourceFileName: file.name,
    });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "Keine Zeilen mit EAN oder interner Artikelnummer gefunden", skipped }, { status: 400 });
  }

  // Upsert: if same EAN from same file already in buffer (unmatched), overwrite it
  let created = 0;
  let updated = 0;
  let autoMatched = 0;

  for (const entry of entries) {
    // Produkt suchen: erst per EAN, dann per interner Artikelnummer
    let existingProduct: { id: string } | null = null;
    if (entry.ean) {
      existingProduct = await prisma.product.findUnique({
        where: { ean: entry.ean },
        select: { id: true },
      });
    }
    if (!existingProduct && entry.internalArticleNr) {
      existingProduct = await prisma.product.findFirst({
        where: { internalArticleNumber: entry.internalArticleNr },
        select: { id: true },
      });
    }

    // Bestehenden Puffer-Eintrag suchen (unmatched, gleiche EAN oder interne Nr.)
    const existingBuffer = await prisma.manufacturerDataBuffer.findFirst({
      where: {
        matchedProductId: null,
        ...(entry.ean
          ? { ean: entry.ean }
          : { internalArticleNr: entry.internalArticleNr }),
      },
    });

    if (existingProduct) {
      // Auto-match immediately: apply mfr data to the product and mark matched
      await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          ...(entry.mfrNetWeightG !== null ? { mfrNetWeightG: entry.mfrNetWeightG } : {}),
          ...(entry.mfrGrossWeightG !== null ? { mfrGrossWeightG: entry.mfrGrossWeightG } : {}),
          ...(entry.mfrPlasticG !== null ? { mfrPlasticG: entry.mfrPlasticG } : {}),
          ...(entry.mfrPaperG !== null ? { mfrPaperG: entry.mfrPaperG } : {}),
        },
      });

      if (existingBuffer) {
        await prisma.manufacturerDataBuffer.update({
          where: { id: existingBuffer.id },
          data: { ...entry, matchedProductId: existingProduct.id, matchedAt: new Date() },
        });
      } else {
        await prisma.manufacturerDataBuffer.create({
          data: { ...entry, matchedProductId: existingProduct.id, matchedAt: new Date() },
        });
      }
      autoMatched++;
    } else {
      if (existingBuffer) {
        await prisma.manufacturerDataBuffer.update({
          where: { id: existingBuffer.id },
          data: entry,
        });
        updated++;
      } else {
        await prisma.manufacturerDataBuffer.create({ data: entry });
        created++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: entries.length,
    created,
    updated,
    autoMatched,
    skipped: skipped.length,
    skippedRows: skipped,
  });
}
