"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataQualityBadge } from "@/components/ui/DataQualityBar";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { computeDataQuality } from "@/lib/validation";

interface Product {
  id: string;
  sku: string;
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
  return `${val.toFixed(1)} ${unit}`;
}

function fmtEur(val: number | null): string {
  if (val === null) return "—";
  return `${val.toFixed(2)} €`;
}

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const brand = searchParams.get("brand") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (brand) params.set("brand", brand);
    if (status) params.set("status", status);
    params.set("page", page.toString());

    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, category, brand, status, page]);

  useEffect(() => {
    fetchProducts();
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
          <a
            href="/api/export"
            download
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            ↓ CSV exportieren
          </a>
          <Link
            href="/import"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            + CSV importieren
          </Link>
        </div>
      </div>

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
        {(search || category || brand || status) && (
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
                <th className="px-4 py-2.5 font-medium text-gray-600">
                  Kategorie
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Marke</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right">
                  EK
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right">
                  Netto
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right">
                  Kunststoff
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right">
                  Papier
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600">
                  Konfidenz
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-2.5 font-medium text-gray-600">
                  Qualität
                </th>
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
                    sku: product.sku,
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
                          {product.sku}
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
                      <td className="px-4 py-3 text-gray-600">
                        {product.category ?? "—"}
                        {product.subcategory && (
                          <span className="text-xs text-gray-400 block">
                            {product.subcategory}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {product.brand ?? product.manufacturer ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {fmtEur(product.ekPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {fmt(product.netWeightG)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {product.packagingProfile
                          ? fmt(product.packagingProfile.currentPlasticG)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {product.packagingProfile
                          ? fmt(product.packagingProfile.currentPaperG)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 min-w-[100px]">
                        <ConfidenceBar
                          score={
                            product.packagingProfile?.confidenceScore ?? null
                          }
                          showLabel={false}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            product.packagingProfile?.status ?? "IMPORTED"
                          }
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3">
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
