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
}

function SamplingPriorityInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = searchParams.get("category") ?? "";

  const [products, setProducts] = useState<PriorityProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
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
  }, [category]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stichproben-Priorität</h1>
          <p className="text-sm text-gray-500 mt-1">
            Produkte ohne eigene Messung — sortiert nach niedrigstem Konfidenzwert
          </p>
        </div>
        <Link
          href="/sampling/batch"
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Batch-Stichprobe starten →
        </Link>
      </div>

      <div className="flex gap-3">
        <select
          value={category}
          onChange={(e) => {
            const p = new URLSearchParams();
            if (e.target.value) p.set("category", e.target.value);
            router.push(`/sampling?${p.toString()}`);
          }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 self-center">
          {loading ? "Lädt…" : `${products.length} Produkte ohne eigene Stichprobe`}
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 font-medium text-gray-600 w-6">#</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">SKU / Int. Nr.</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Produkt</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Kategorie</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Marke</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Status</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 min-w-[130px]">Konfidenz</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading &&
              [...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && products.map((p, idx) => (
              <tr key={p.id} className="hover:bg-gray-50">
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
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.category}{p.subcategory ? ` / ${p.subcategory}` : ""}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {p.brand ?? p.manufacturer ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.packagingProfile?.status ?? "IMPORTED"} size="sm" />
                </td>
                <td className="px-4 py-3 min-w-[130px]">
                  <ConfidenceBar score={p.packagingProfile?.confidenceScore ?? null} showLabel={false} />
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.packagingProfile?.confidenceScore != null
                      ? `${Math.round(p.packagingProfile.confidenceScore * 100)}%`
                      : "Kein Profil"}
                  </div>
                </td>
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
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
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
