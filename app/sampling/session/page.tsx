"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface ProductHit {
  id: string;
  sku: string;
  internalArticleNumber: string | null;
  productName: string;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  grossWeightG: number | null;
  packagingProfile: { confidenceScore: number | null; status: string } | null;
}

interface SessionRow {
  product: ProductHit;
  plasticG: string;
  paperG: string;
  totalG: string;
  notes: string;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

interface ResolveResult {
  identifier: string;
  product: ProductHit;
}

export default function SamplingSessionPage() {
  const [addTab, setAddTab] = useState<"search" | "upload">("search");

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);

  // Upload tab state
  const [uploadText, setUploadText] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResolved, setUploadResolved] = useState<ResolveResult[]>([]);
  const [uploadUnresolved, setUploadUnresolved] = useState<string[]>([]);
  const [uploadDone, setUploadDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Session state
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [globalSampledBy, setGlobalSampledBy] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  async function search(q: string) {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/products?search=${encodeURIComponent(q)}&pageSize=10`
      );
      const data = await res.json();
      setSearchResults(data.products ?? []);
    } finally {
      setSearching(false);
    }
  }

  function addProduct(product: ProductHit) {
    if (rows.some((r) => r.product.id === product.id)) return;
    setRows((prev) => [
      ...prev,
      {
        product,
        plasticG: "",
        paperG: "",
        totalG: "",
        notes: "",
        saved: false,
        saving: false,
        error: null,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
    searchRef.current?.focus();
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.product.id !== id));
  }

  function updateRow(id: string, field: keyof SessionRow, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.product.id === id ? { ...r, [field]: value } : r))
    );
  }

  async function saveRow(id: string) {
    const row = rows.find((r) => r.product.id === id);
    if (!row || row.saved) return;
    if (!row.plasticG && !row.paperG && !row.totalG) return;

    setRows((prev) =>
      prev.map((r) =>
        r.product.id === id ? { ...r, saving: true, error: null } : r
      )
    );

    try {
      const res = await fetch("/api/sampling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: row.product.id,
          sampledBy: globalSampledBy || null,
          measuredPlasticG: row.plasticG || null,
          measuredPaperG: row.paperG || null,
          measuredTotalPackagingG: row.totalG || null,
          notes: row.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows((prev) =>
        prev.map((r) =>
          r.product.id === id
            ? { ...r, saving: false, saved: true, error: null }
            : r
        )
      );
      setSavedCount((c) => c + 1);
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.product.id === id
            ? {
                ...r,
                saving: false,
                error: err instanceof Error ? err.message : "Fehler",
              }
            : r
        )
      );
    }
  }

  async function saveAll() {
    setSavingAll(true);
    const toSave = rows.filter(
      (r) => !r.saved && (r.plasticG || r.paperG || r.totalG)
    );
    for (const row of toSave) {
      await saveRow(row.product.id);
    }
    setSavingAll(false);
  }

  // ── Upload tab helpers ──────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadText(String(ev.target?.result ?? ""));
      setUploadDone(false);
      setUploadResolved([]);
      setUploadUnresolved([]);
    };
    reader.readAsText(file, "utf-8");
  }

  async function resolveUpload() {
    // Parse: one identifier per line, ignore empty lines and lines starting with #
    // Also detect CSV: if first non-empty line has commas, try to detect the identifier column
    const lines = uploadText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    if (lines.length === 0) return;

    // CSV detection: if first line contains semicolons or commas, parse as CSV
    let identifiers: string[] = [];
    const sep = lines[0].includes(";") ? ";" : lines[0].includes(",") ? "," : null;
    if (sep) {
      // Has header row — look for a column called sku / artikelnummer / article / id / nummer
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/["\s]/g, ""));
      const skuIdx = headers.findIndex((h) =>
        ["sku", "artikelnummer", "articlenumber", "article", "artnr", "artnummer",
         "internenummer", "interneartnr", "id"].includes(h)
      );
      const colIdx = skuIdx >= 0 ? skuIdx : 0; // fallback: first column
      for (const line of lines.slice(1)) {
        const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols[colIdx]) identifiers.push(cols[colIdx]);
      }
    } else {
      identifiers = lines;
    }

    identifiers = [...new Set(identifiers.filter(Boolean))];
    if (identifiers.length === 0) return;

    setUploadLoading(true);
    try {
      const res = await fetch("/api/products/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers }),
      });
      const data = await res.json();
      setUploadResolved(data.resolved ?? []);
      setUploadUnresolved(data.unresolved ?? []);
      setUploadDone(true);
    } catch {
      setUploadUnresolved(identifiers);
      setUploadDone(true);
    } finally {
      setUploadLoading(false);
    }
  }

  function addAllResolved() {
    for (const { product } of uploadResolved) {
      addProduct(product);
    }
    setUploadText("");
    setUploadResolved([]);
    setUploadUnresolved([]);
    setUploadDone(false);
    if (fileRef.current) fileRef.current.value = "";
    setAddTab("search");
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const filledRows = rows.filter(
    (r) => !r.saved && (r.plasticG || r.paperG || r.totalG)
  ).length;

  const newFromUpload = uploadResolved.filter(
    (r) => !rows.some((row) => row.product.id === r.product.id)
  );

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { font-size: 11pt; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #999; padding: 4px 8px; }
          th { background: #eee !important; -webkit-print-color-adjust: exact; }
          .page-title { font-size: 16pt; font-weight: bold; margin-bottom: 8px; }
          .page-subtitle { font-size: 10pt; color: #555; margin-bottom: 16px; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 no-print">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/sampling" className="hover:text-gray-700">
                ← Prioritätsliste
              </Link>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
              Wiegesession
            </h1>
            <p className="text-sm text-gray-500 mt-0.5 hidden md:block">
              Produkte per SKU / Artikelnummer auswählen und als Liste abarbeiten
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {rows.length > 0 && (
              <button
                onClick={() => window.print()}
                className="hidden md:flex border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 items-center gap-2"
              >
                🖨 Drucken
              </button>
            )}
            {savedCount > 0 && (
              <span className="text-sm text-green-600 font-medium hidden md:inline">
                ✓ {savedCount} gespeichert
              </span>
            )}
          </div>
        </div>

        {/* Print header */}
        <div className="print-only">
          <div className="page-title">Wiegesession — Stichprobenliste</div>
          <div className="page-subtitle">
            Datum: {new Date().toLocaleDateString("de-DE")} &nbsp;|&nbsp;
            Erfasst von: {globalSampledBy || "___________________"}
            &nbsp;|&nbsp; Anzahl Produkte: {rows.length}
          </div>
        </div>

        {/* Settings bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 no-print">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Erfasst von:
            </label>
            <input
              type="text"
              value={globalSampledBy}
              onChange={(e) => setGlobalSampledBy(e.target.value)}
              placeholder="Name des Mitarbeiters"
              className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400"
            />
          </div>
        </div>

        {/* ── Add product panel ── */}
        <div className="bg-white border border-gray-200 rounded-lg no-print overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setAddTab("search")}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                addTab === "search"
                  ? "border-b-2 border-blue-600 text-blue-700 bg-blue-50/40"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              Suche
            </button>
            <button
              onClick={() => setAddTab("upload")}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                addTab === "upload"
                  ? "border-b-2 border-blue-600 text-blue-700 bg-blue-50/40"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              Liste / CSV hochladen
            </button>
          </div>

          {/* Search tab */}
          {addTab === "search" && (
            <div className="p-4 space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Produkt hinzufügen
              </label>
              <div className="relative">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    search(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchQuery("");
                      setSearchResults([]);
                    }
                    if (e.key === "Enter" && searchResults.length === 1) {
                      addProduct(searchResults[0]);
                    }
                  }}
                  placeholder="SKU, interne Art.-Nr. oder Produktname …"
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base outline-none focus:border-blue-400"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-3.5 text-gray-400 text-xs">
                    Sucht…
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {searchResults.map((p) => {
                      const alreadyAdded = rows.some((r) => r.product.id === p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => !alreadyAdded && addProduct(p)}
                          disabled={alreadyAdded}
                          className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-0 flex items-center justify-between gap-4 ${
                            alreadyAdded
                              ? "opacity-40 cursor-default"
                              : "hover:bg-blue-50 cursor-pointer"
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-blue-600 mr-2">
                              {p.sku}
                            </span>
                            {p.internalArticleNumber && (
                              <span className="text-xs text-gray-400 mr-2">
                                {p.internalArticleNumber}
                              </span>
                            )}
                            <span className="font-medium">{p.productName}</span>
                          </div>
                          <div className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                            {p.category}
                            {alreadyAdded && (
                              <span className="ml-2 text-green-600">✓</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {rows.length > 0 && (
                <p className="text-xs text-gray-400">
                  {rows.length} Produkt{rows.length !== 1 ? "e" : ""} in der Session
                  {savedCount > 0 && (
                    <span className="text-green-600 ml-2">· ✓ {savedCount} gespeichert</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Upload tab */}
          {addTab === "upload" && (
            <div className="p-4 space-y-3">
              <div>
                <p className="text-sm text-gray-700 font-medium mb-1">
                  CSV oder Textdatei hochladen
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Eine Zeile pro Artikelnummer (SKU oder interne Art.-Nr.).
                  Oder CSV mit Spaltenüberschrift <code className="bg-gray-100 px-1 rounded">sku</code> /
                  {" "}<code className="bg-gray-100 px-1 rounded">artikelnummer</code>.
                  Nicht erkannte Artikel werden als Fehler angezeigt und übersprungen.
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 inline-flex items-center gap-2">
                    📂 Datei wählen
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.txt,.tsv"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                  <span className="text-xs text-gray-400">oder direkt einfügen:</span>
                </div>
              </div>

              <textarea
                value={uploadText}
                onChange={(e) => {
                  setUploadText(e.target.value);
                  setUploadDone(false);
                  setUploadResolved([]);
                  setUploadUnresolved([]);
                }}
                placeholder={"ART-001\nART-002\nART-003\n..."}
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-blue-400 resize-y"
              />

              <div className="flex gap-2 items-center">
                <button
                  onClick={resolveUpload}
                  disabled={!uploadText.trim() || uploadLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                >
                  {uploadLoading ? "Suche…" : "Auflösen"}
                </button>
                {uploadText && (
                  <button
                    onClick={() => {
                      setUploadText("");
                      setUploadResolved([]);
                      setUploadUnresolved([]);
                      setUploadDone(false);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="text-sm text-gray-400 hover:text-gray-700"
                  >
                    Leeren
                  </button>
                )}
              </div>

              {/* Upload results */}
              {uploadDone && (
                <div className="space-y-2">
                  {uploadResolved.length > 0 && (
                    <div className="border border-green-200 rounded-lg overflow-hidden">
                      <div className="bg-green-50 px-3 py-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-green-800">
                          ✓ {uploadResolved.length} Produkt{uploadResolved.length !== 1 ? "e" : ""} gefunden
                        </span>
                        {newFromUpload.length > 0 && (
                          <button
                            onClick={addAllResolved}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700 font-medium"
                          >
                            Alle {newFromUpload.length} hinzufügen
                          </button>
                        )}
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {uploadResolved.map(({ identifier, product }) => {
                          const alreadyInSession = rows.some((r) => r.product.id === product.id);
                          return (
                            <div key={product.id} className="px-3 py-2 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-mono text-xs text-gray-400 mr-1">{identifier}</span>
                                <span className="text-sm font-medium text-gray-800">{product.productName}</span>
                                {product.category && (
                                  <span className="text-xs text-gray-400 ml-1">· {product.category}</span>
                                )}
                              </div>
                              {alreadyInSession ? (
                                <span className="text-xs text-green-600 flex-shrink-0">✓ bereits drin</span>
                              ) : (
                                <button
                                  onClick={() => addProduct(product)}
                                  className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded hover:bg-green-200 flex-shrink-0"
                                >
                                  + Hinzufügen
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {uploadUnresolved.length > 0 && (
                    <div className="border border-red-200 rounded-lg overflow-hidden">
                      <div className="bg-red-50 px-3 py-2">
                        <span className="text-sm font-medium text-red-800">
                          ✗ {uploadUnresolved.length} nicht gefunden
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto divide-y divide-gray-100">
                        {uploadUnresolved.map((id) => (
                          <div key={id} className="px-3 py-1.5 font-mono text-xs text-red-600">
                            {id}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadResolved.length === 0 && uploadUnresolved.length === 0 && (
                    <p className="text-sm text-gray-400">Keine Identifier gefunden.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── MOBILE: card stack ─── */}
        {rows.length > 0 && (
          <>
            <div className="md:hidden space-y-3 no-print">
              {rows.map((row) => (
                <div
                  key={row.product.id}
                  className={`bg-white border rounded-xl p-4 space-y-3 ${
                    row.saved
                      ? "border-green-200 bg-green-50 opacity-70"
                      : "border-gray-200"
                  }`}
                >
                  {/* Product info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-blue-600">{row.product.sku}</span>
                        {row.product.internalArticleNumber && (
                          <span className="text-xs text-gray-400">{row.product.internalArticleNumber}</span>
                        )}
                      </div>
                      <div className="font-semibold text-gray-900 mt-0.5 leading-snug">
                        {row.product.productName}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {row.product.category}
                        {row.product.brand ? ` · ${row.product.brand}` : ""}
                      </div>
                    </div>
                    {!row.saved && (
                      <button
                        onClick={() => removeRow(row.product.id)}
                        className="text-gray-300 hover:text-red-400 p-1 flex-shrink-0"
                      >
                        ✕
                      </button>
                    )}
                    {row.saved && (
                      <span className="text-green-600 text-sm font-medium flex-shrink-0">✓</span>
                    )}
                  </div>

                  {/* Weight inputs */}
                  {!row.saved && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-blue-700 block mb-1">
                            Kunststoff (g)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            value={row.plasticG}
                            onChange={(e) =>
                              updateRow(row.product.id, "plasticG", e.target.value)
                            }
                            placeholder="0.0"
                            className="w-full border border-blue-200 rounded-lg px-3 py-3 text-base text-center outline-none focus:border-blue-400 bg-blue-50"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-green-700 block mb-1">
                            Papier (g)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            value={row.paperG}
                            onChange={(e) =>
                              updateRow(row.product.id, "paperG", e.target.value)
                            }
                            placeholder="0.0"
                            className="w-full border border-green-200 rounded-lg px-3 py-3 text-base text-center outline-none focus:border-green-400 bg-green-50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">
                          Gesamt (g)
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          value={row.totalG}
                          onChange={(e) =>
                            updateRow(row.product.id, "totalG", e.target.value)
                          }
                          placeholder="0.0"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base text-center outline-none focus:border-gray-400"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) =>
                            updateRow(row.product.id, "notes", e.target.value)
                          }
                          placeholder="Notiz (optional)"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 text-gray-600"
                        />
                      </div>
                      {row.error && (
                        <p className="text-red-500 text-xs">{row.error}</p>
                      )}
                      <button
                        onClick={() => saveRow(row.product.id)}
                        disabled={
                          row.saving ||
                          (!row.plasticG && !row.paperG && !row.totalG)
                        }
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-40 transition-colors"
                      >
                        {row.saving ? "Speichert…" : "Speichern"}
                      </button>
                    </>
                  )}

                  {row.saved && (
                    <div className="text-sm text-green-700">
                      Kunststoff: {row.plasticG || "—"} g · Papier: {row.paperG || "—"} g
                      {row.totalG ? ` · Gesamt: ${row.totalG} g` : ""}
                    </div>
                  )}
                </div>
              ))}

              {/* Mobile floating save-all */}
              {filledRows > 1 && (
                <div className="sticky bottom-4 pt-2">
                  <button
                    onClick={saveAll}
                    disabled={savingAll}
                    className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold text-base shadow-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {savingAll ? "Speichert…" : `Alle ${filledRows} Messungen speichern`}
                  </button>
                </div>
              )}
            </div>

            {/* ─── DESKTOP: table ─── */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-lg overflow-hidden no-print">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2.5 font-medium text-gray-600 w-8">#</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600">SKU / Produkt</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600">Kategorie</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600 text-center w-28">Kunststoff (g)</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600 text-center w-28">Papier (g)</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600 text-center w-28">Gesamt (g)</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600 w-36">Notiz</th>
                      <th className="px-3 py-2.5 font-medium text-gray-600 w-24">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, idx) => (
                      <tr
                        key={row.product.id}
                        className={
                          row.saved ? "bg-green-50 opacity-60" : "hover:bg-gray-50"
                        }
                      >
                        <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-blue-600">{row.product.sku}</div>
                          {row.product.internalArticleNumber && (
                            <div className="text-xs text-gray-400">{row.product.internalArticleNumber}</div>
                          )}
                          <div className="text-sm font-medium text-gray-800 truncate max-w-[200px]" title={row.product.productName}>
                            {row.product.productName}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {row.product.category}
                          {row.product.brand && <div className="text-gray-400">{row.product.brand}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.1" min="0" value={row.plasticG}
                            onChange={(e) => updateRow(row.product.id, "plasticG", e.target.value)}
                            disabled={row.saved} placeholder="0.0"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center outline-none focus:border-blue-400 disabled:bg-gray-100" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.1" min="0" value={row.paperG}
                            onChange={(e) => updateRow(row.product.id, "paperG", e.target.value)}
                            disabled={row.saved} placeholder="0.0"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center outline-none focus:border-green-400 disabled:bg-gray-100" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.1" min="0" value={row.totalG}
                            onChange={(e) => updateRow(row.product.id, "totalG", e.target.value)}
                            disabled={row.saved} placeholder="0.0"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center outline-none focus:border-gray-400 disabled:bg-gray-100" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={row.notes}
                            onChange={(e) => updateRow(row.product.id, "notes", e.target.value)}
                            disabled={row.saved} placeholder="optional"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-400 disabled:bg-gray-100" />
                        </td>
                        <td className="px-3 py-2">
                          {row.saved ? (
                            <span className="text-green-600 text-xs font-medium">✓ Gespeichert</span>
                          ) : row.error ? (
                            <span className="text-red-500 text-xs">{row.error}</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => saveRow(row.product.id)}
                                disabled={row.saving || (!row.plasticG && !row.paperG && !row.totalG)}
                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-40">
                                {row.saving ? "…" : "Speichern"}
                              </button>
                              <button onClick={() => removeRow(row.product.id)}
                                className="text-xs text-gray-400 hover:text-red-500 px-1" title="Entfernen">
                                ✕
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filledRows > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                  <button onClick={saveAll} disabled={savingAll}
                    className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {savingAll ? "Speichert…" : `Alle ${filledRows} speichern`}
                  </button>
                </div>
              )}
            </div>

            {/* Print table */}
            <div className="print-only">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>SKU</th><th>Produkt</th><th>Kategorie</th>
                    <th>Kunststoff (g)</th><th>Papier (g)</th><th>Gesamt (g)</th><th>Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.product.id}>
                      <td>{idx + 1}</td>
                      <td>{row.product.sku}{row.product.internalArticleNumber ? ` / ${row.product.internalArticleNumber}` : ""}</td>
                      <td>{row.product.productName}</td>
                      <td>{row.product.category}</td>
                      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {rows.length === 0 && (
          <div className="text-center py-16 text-gray-400 no-print">
            <div className="text-5xl mb-3">⚖️</div>
            <div className="font-medium text-gray-500">Noch keine Produkte in der Session</div>
            <div className="text-sm mt-1">SKU oder Artikelnummer oben eingeben oder Liste hochladen</div>
          </div>
        )}
      </div>
    </>
  );
}
