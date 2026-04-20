"use client";

import { useEffect, useState, useCallback, Suspense, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataQualityBadge } from "@/components/ui/DataQualityBar";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { computeDataQuality } from "@/lib/validation";

interface Product {
  id: string;
  ean: string;
  internalArticleNumber: string | null;
  productName: string;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  ekPrice: number | null;
  netWeightG: number | null;
  grossWeightG: number | null;
  packagingProfile: {
    status: string;
    currentPlasticG: number | null;
    currentPaperG: number | null;
    confidenceScore: number | null;
    estimationMethod: string | null;
  } | null;
  _count: { samplingRecords: number };
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  pageCount: number;
  filterOptions: {
    categories: string[];
    brands: string[];
  };
}

function fmt(val: number | null, unit = "g"): string {
  if (val === null) return "—";
  if (unit === "g" && val >= 1000) return `${parseFloat((val / 1000).toFixed(3))} kg`;
  return `${val.toFixed(1)} ${unit}`;
}

function fmtEur(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(2)} €`;
}

interface NewProductForm {
  ean: string;
  productName: string;
  internalArticleNumber: string;
  manufacturer: string;
  brand: string;
  category: string;
  subcategory: string;
  ekPrice: string;
  netWeightG: string;
  grossWeightG: string;
  annualUnitsSold: string;
}

const EMPTY_FORM: NewProductForm = {
  ean: "", productName: "", internalArticleNumber: "", manufacturer: "",
  brand: "", category: "", subcategory: "", ekPrice: "",
  netWeightG: "", grossWeightG: "", annualUnitsSold: "",
};

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"" | "full" | "slim">("");

  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState<NewProductForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error ?? "Fehler beim Anlegen");
        return;
      }
      setShowNewModal(false);
      setNewForm(EMPTY_FORM);
      router.push(`/products/${json.id}`);
    } catch {
      setCreateError("Netzwerkfehler");
    } finally {
      setCreating(false);
    }
  }

  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const brand = searchParams.get("brand") ?? "";
  const status = searchParams.get("status") ?? "";
  const minSamples = searchParams.get("minSamples") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (brand) params.set("brand", brand);
    if (status) params.set("status", status);
    if (minSamples) params.set("minSamples", minSamples);
    params.set("page", page.toString());

    const controller = new AbortController();
    fetch(`/api/products?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setError(null);
      })
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [search, category, brand, status, minSamples, page]);

  useEffect(() => {
    return fetchProducts();
  }, [fetchProducts]);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    router.push(`/products?${p.toString()}`);
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", p.toString());
    router.push(`/products?${params.toString()}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Produkte</h1>
        <div className="flex gap-2">
          {/* Slim export: import-ready columns only — ideal for bulk corrections */}
          <button
            title="Nur Stammdaten-Spalten (für Re-Import geeignet)"
            onClick={async () => {
              if (exporting) return;
              setExporting("slim");
              try {
                const params = new URLSearchParams();
                if (category) params.set("category", category);
                if (status) params.set("status", status);
                params.set("mode", "slim");
                const res = await fetch(`/api/export?${params}`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]
                  ?? `compliancehub_stammdaten_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } finally {
                setExporting("");
              }
            }}
            disabled={!!exporting}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60 transition-opacity"
          >
            {exporting === "slim" ? (
              <>
                <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Exportiert…
              </>
            ) : (
              "↓ Stammdaten"
            )}
          </button>
          {/* Full export: all columns including packaging/estimation data */}
          <button
            title="Alle Spalten inkl. Verpackungsdaten"
            onClick={async () => {
              if (exporting) return;
              setExporting("full");
              try {
                const params = new URLSearchParams();
                if (category) params.set("category", category);
                if (status) params.set("status", status);
                const res = await fetch(`/api/export?${params}`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]
                  ?? `compliancehub_export_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } finally {
                setExporting("");
              }
            }}
            disabled={!!exporting}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60 transition-opacity"
          >
            {exporting === "full" ? (
              <>
                <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Exportiert…
              </>
            ) : (
              "↓ Vollexport"
            )}
          </button>
          <button
            onClick={() => { setShowNewModal(true); setCreateError(null); }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + Neues Produkt
          </button>
          <Link
            href="/import"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + CSV importieren
          </Link>
        </div>
      </div>

      {/* New product modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Neues Produkt anlegen</h2>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">EAN / GTIN *</label>
                  <input required value={newForm.ean} onChange={e => setNewForm(f => ({ ...f, ean: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" placeholder="z.B. 4005808520404" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Interne Art.-Nr.</label>
                  <input value={newForm.internalArticleNumber} onChange={e => setNewForm(f => ({ ...f, internalArticleNumber: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Produktname *</label>
                  <input required value={newForm.productName} onChange={e => setNewForm(f => ({ ...f, productName: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hersteller</label>
                  <input value={newForm.manufacturer} onChange={e => setNewForm(f => ({ ...f, manufacturer: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marke</label>
                  <input value={newForm.brand} onChange={e => setNewForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
                  <input value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unterkategorie</label>
                  <input value={newForm.subcategory} onChange={e => setNewForm(f => ({ ...f, subcategory: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">EK-Preis (€)</label>
                  <input type="number" step="0.01" min="0" value={newForm.ekPrice} onChange={e => setNewForm(f => ({ ...f, ekPrice: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jahresabsatz (Stk.)</label>
                  <input type="number" step="1" min="0" value={newForm.annualUnitsSold} onChange={e => setNewForm(f => ({ ...f, annualUnitsSold: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Netto-Gewicht (g)</label>
                  <input type="number" step="0.1" min="0" value={newForm.netWeightG} onChange={e => setNewForm(f => ({ ...f, netWeightG: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Brutto-Gewicht (g)</label>
                  <input type="number" step="0.1" min="0" value={newForm.grossWeightG} onChange={e => setNewForm(f => ({ ...f, grossWeightG: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
                </div>
              </div>
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-sm">{createError}</div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  Abbrechen
                </button>
                <button type="submit" disabled={creating}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                  {creating ? "Anlegen…" : "Produkt anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Suche (SKU, Name, Hersteller…)"
          value={search}
          onChange={(e) => setParam("search", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 min-w-[200px] outline-none focus:border-blue-400"
        />
        <select
          value={category}
          onChange={(e) => setParam("category", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Alle Kategorien</option>
          {data?.filterOptions.categories.map((c) => (
            <option key={c} value={c ?? ""}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={brand}
          onChange={(e) => setParam("brand", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Alle Marken</option>
          {data?.filterOptions.brands.map((b) => (
            <option key={b} value={b ?? ""}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Alle Status</option>
          <option value="imported">Importiert</option>
          <option value="estimated">Geschätzt</option>
          <option value="sampled">Gemessen</option>
          <option value="reviewed">Geprüft</option>
        </select>
        {/* Stichproben-Filter */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            onClick={() => setParam("minSamples", "")}
            className={`px-3 py-1.5 transition-colors ${
              !minSamples ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Alle
          </button>
          <button
            onClick={() => setParam("minSamples", "1")}
            className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
              minSamples === "1" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            ≥ 1 Stichprobe
          </button>
          <button
            onClick={() => setParam("minSamples", "2")}
            className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
              minSamples === "2" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            &gt; 1 Stichprobe
          </button>
        </div>
        {(search || category || brand || status || minSamples) && (
          <button
            onClick={() => router.push("/products")}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
          {loading ? "Lädt…" : `${data?.total ?? 0} Produkte gefunden`}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2.5 font-medium text-gray-600">SKU</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Name</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Kategorie</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 hidden lg:table-cell">Marke</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden lg:table-cell">EK</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden xl:table-cell">Netto</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden sm:table-cell">Kunststoff</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden sm:table-cell">Papier</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Konfidenz</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 hidden lg:table-cell">Qualität</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading &&
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(11)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading &&
                data?.products.map((product) => {
                  const quality = computeDataQuality({
                    ean: product.ean,
                    productName: product.productName,
                    manufacturer: product.manufacturer ?? undefined,
                    brand: product.brand ?? undefined,
                    category: product.category ?? undefined,
                    ekPrice: product.ekPrice,
                    netWeightG: product.netWeightG,
                    grossWeightG: product.grossWeightG,
                  });

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${product.id}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {product.ean}
                        </Link>
                        {product.internalArticleNumber && (
                          <div className="text-xs text-gray-400 font-mono">
                            {product.internalArticleNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <Link
                          href={`/products/${product.id}`}
                          className="hover:text-blue-600 truncate block"
                          title={product.productName}
                        >
                          {product.productName}
                        </Link>
                        {product._count.samplingRecords > 0 && (
                          <span className="text-xs text-green-600">
                            {product._count.samplingRecords} Stichprobe
                            {product._count.samplingRecords > 1 ? "n" : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                        {product.category ?? "—"}
                        {product.subcategory && (
                          <span className="text-xs text-gray-400 block">
                            {product.subcategory}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                        {product.brand ?? product.manufacturer ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs hidden lg:table-cell">
                        {fmtEur(product.ekPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs hidden xl:table-cell">
                        {fmt(product.netWeightG)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs hidden sm:table-cell">
                        {product.packagingProfile
                          ? fmt(product.packagingProfile.currentPlasticG)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs hidden sm:table-cell">
                        {product.packagingProfile
                          ? fmt(product.packagingProfile.currentPaperG)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 min-w-[100px] hidden md:table-cell">
                        <ConfidenceBar
                          score={
                            product.packagingProfile?.confidenceScore ?? null
                          }
                          showLabel={false}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={product.packagingProfile?.status ?? "IMPORTED"}
                          estimationMethod={product.packagingProfile?.estimationMethod}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <DataQualityBadge score={quality.score} />
                      </td>
                    </tr>
                  );
                })}
              {!loading && data?.products.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    Keine Produkte gefunden.{" "}
                    <Link
                      href="/import"
                      className="text-blue-600 hover:underline"
                    >
                      CSV importieren
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pageCount > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Seite {data.page} von {data.pageCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(data.page - 1)}
                disabled={data.page <= 1}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                ←
              </button>
              <button
                onClick={() => setPage(data.page + 1)}
                disabled={data.page >= data.pageCount}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-gray-400">Lädt…</div>}>
      <ProductsPageInner />
    </Suspense>
  );
}
