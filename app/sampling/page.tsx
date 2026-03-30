"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";

interface PriorityProduct {
  id: string;
  sku: string;
  internalArticleNumber: string | null;
  productName: string;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  grossWeightG: number | null;
  packagingProfile: {
    status: string;
    confidenceScore: number | null;
    estimationMethod: string | null;
  } | null;
  _count: { samplingRecords: number };
  leverageScore: number;
}

function SamplingPriorityInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = searchParams.get("category") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "confidence";

  const [products, setProducts] = useState<PriorityProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    params.set("sortBy", sortBy);
    params.set("limit", "100");

    Promise.all([
      fetch(`/api/sampling/priority?${params}`).then((r) => r.json()),
      fetch("/api/products?pageSize=1").then((r) => r.json()),
    ])
      .then(([priority, productsData]) => {
        setProducts(priority.products ?? []);
        setCategories(productsData.filterOptions?.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [category, sortBy]);

  function updateParams(updates: Record<string, string>) {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (sortBy !== "confidence") p.set("sortBy", sortBy);
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`/sampling?${p.toString()}`);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stichproben-Priorität</h1>
          <p className="text-sm text-gray-500 mt-1">
            Produkte ohne eigene Messung — sortiert nach{" "}
            {sortBy === "leverage" ? "Hebelwirkung (wie viele andere profitieren)" : "niedrigstem Konfidenzwert"}
          </p>
        </div>
        <Link
          href="/sampling/batch"
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Batch-Stichprobe →
        </Link>
      </div>

      {/* Filters + sort toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={category}
          onChange={(e) => updateParams({ category: e.target.value, sortBy })}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Sort toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            onClick={() => updateParams({ category, sortBy: "confidence" })}
            className={`px-3 py-1.5 transition-colors ${
              sortBy !== "leverage"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Konfidenz ↑
          </button>
          <button
            onClick={() => updateParams({ category, sortBy: "leverage" })}
            className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
              sortBy === "leverage"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Hebelwirkung ↓
          </button>
        </div>

        <span className="text-sm text-gray-500">
          {loading ? "Lädt…" : `${products.length} Produkte ohne eigene Stichprobe`}
        </span>
      </div>

      {sortBy === "leverage" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-800">
          <strong>Hebelwirkung:</strong> Produkte ganz oben haben die meisten Gleichartigen ohne Messung.
          Eine Wiegung verbessert sofort die Schätzung aller ähnlichen Produkte.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 font-medium text-gray-600 w-6">#</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">SKU / Int. Nr.</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Produkt</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Kategorie</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Marke</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Status</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 min-w-[120px]">Konfidenz</th>
              {sortBy === "leverage" && (
                <th className="px-4 py-2.5 font-medium text-blue-700 text-right">Hebel</th>
              )}
              <th className="px-4 py-2.5 font-medium text-gray-600">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading &&
              [...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[...Array(sortBy === "leverage" ? 8 : 7)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && products.map((p, idx) => (
              <tr key={p.id} className={`hover:bg-gray-50 ${sortBy === "leverage" && p.leverageScore > 5 ? "bg-blue-50/30" : ""}`}>
                <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-blue-600">{p.sku}</div>
                  {p.internalArticleNumber && (
                    <div className="text-xs text-gray-400">{p.internalArticleNumber}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/products/${p.id}`} className="hover:text-blue-600 font-medium">
                    {p.productName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                  {p.category}{p.subcategory ? ` / ${p.subcategory}` : ""}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                  {p.brand ?? p.manufacturer ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.packagingProfile?.status ?? "IMPORTED"} size="sm" />
                </td>
                <td className="px-4 py-3 min-w-[120px]">
                  <ConfidenceBar score={p.packagingProfile?.confidenceScore ?? null} showLabel={false} />
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.packagingProfile?.confidenceScore != null
                      ? `${Math.round(p.packagingProfile.confidenceScore * 100)}%`
                      : "Kein Profil"}
                  </div>
                </td>
                {sortBy === "leverage" && (
                  <td className="px-4 py-3 text-right">
                    {p.leverageScore > 0 ? (
                      <span className={`text-xs font-bold ${p.leverageScore > 5 ? "text-blue-700" : "text-gray-500"}`}>
                        {p.leverageScore > 0 ? `+${p.leverageScore}` : "—"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link
                    href={`/products/${p.id}#sampling`}
                    className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                  >
                    + Wiegen
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={sortBy === "leverage" ? 9 : 8} className="px-4 py-8 text-center text-gray-400">
                  Alle Produkte haben bereits eigene Stichproben.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SamplingPriorityPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-8 text-gray-400">Lädt…</div>}>
      <SamplingPriorityInner />
    </Suspense>
  );
}
