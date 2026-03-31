"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";

interface BrandDetail {
  entityType: string;
  name: string;
  profile: {
    id: string;
    notes: string | null;
    packagingStyle: string | null;
    typicalMaterial: string | null;
    tags: string[];
  } | null;
  stats: {
    productCount: number;
    sampledCount: number;
    avgPlasticG: number | null;
    stdPlasticG: number | null;
    avgPaperG: number | null;
    avgConfidence: number | null;
    avgEstimationErrorPct: number | null;
    avgPlasticRatioPct: number | null;
    categoryBreakdown: [string, number][];
  };
  products: {
    id: string;
    ean: string;
    productName: string;
    category: string | null;
    subcategory: string | null;
    grossWeightG: number | null;
    packagingProfile: {
      status: string;
      currentPlasticG: number | null;
      confidenceScore: number | null;
      estimationMethod: string | null;
      estimationErrorPct: number | null;
    } | null;
    _count: { samplingRecords: number };
  }[];
}

const PACKAGING_STYLES = [
  "minimal",
  "standard",
  "oversized",
  "eco-freundlich",
  "aufwendig",
];

export default function BrandDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const name = decodeURIComponent(params.name as string);
  const entityType = searchParams.get("type") ?? "brand";

  const [data, setData] = useState<BrandDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    notes: "",
    packagingStyle: "",
    typicalMaterial: "",
    tagInput: "",
    tags: [] as string[],
  });

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/brands/${encodeURIComponent(name)}?type=${entityType}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        const p = d.profile;
        setForm({
          notes: p?.notes ?? "",
          packagingStyle: p?.packagingStyle ?? "",
          typicalMaterial: p?.typicalMaterial ?? "",
          tagInput: "",
          tags: p?.tags ?? [],
        });
      })
      .finally(() => setLoading(false));
  }, [name, entityType]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/brands/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          notes: form.notes || null,
          packagingStyle: form.packagingStyle || null,
          typicalMaterial: form.typicalMaterial || null,
          tags: form.tags,
        }),
      });
      setEditMode(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  function addTag(tag: string) {
    const t = tag.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t], tagInput: "" }));
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-40 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const sampledPct =
    data.stats.productCount > 0
      ? Math.round((data.stats.sampledCount / data.stats.productCount) * 100)
      : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/brands" className="text-sm text-gray-500 hover:text-gray-700">
            ← Marken & Hersteller
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${entityType === "brand" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
              {entityType === "brand" ? "Marke" : "Hersteller"}
            </span>
            {data.profile?.packagingStyle && (
              <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                {data.profile.packagingStyle}
              </span>
            )}
            {data.profile?.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
                {t}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          className="flex-shrink-0 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          {editMode ? "Abbrechen" : "✏ Profil bearbeiten"}
        </button>
      </div>

      {/* Edit form */}
      {editMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Profil bearbeiten</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Verpackungsstil</label>
              <select
                value={form.packagingStyle}
                onChange={(e) => setForm((f) => ({ ...f, packagingStyle: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              >
                <option value="">— kein Stil gewählt —</option>
                {PACKAGING_STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Typisches Material</label>
              <input
                type="text"
                value={form.typicalMaterial}
                onChange={(e) => setForm((f) => ({ ...f, typicalMaterial: e.target.value }))}
                placeholder="z. B. überwiegend Karton, wenig Plastik"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Notizen & Beobachtungen</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              placeholder="Besonderheiten, Trends, Erfahrungen mit dieser Marke/Hersteller…"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs">
                  {t}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}
                    className="text-yellow-600 hover:text-yellow-900 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.tagInput}
                onChange={(e) => setForm((f) => ({ ...f, tagInput: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(form.tagInput); } }}
                placeholder="Tag eingeben + Enter"
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <button
                type="button"
                onClick={() => addTag(form.tagInput)}
                className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded text-sm hover:bg-yellow-200"
              >
                + Tag
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Speichert…" : "Profil speichern"}
            </button>
            <button onClick={() => setEditMode(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 border rounded">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Profile notes (view mode) */}
      {!editMode && data.profile?.notes && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900">Notizen</h2>
            {data.profile.typicalMaterial && (
              <span className="text-xs text-gray-500">{data.profile.typicalMaterial}</span>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-line">{data.profile.notes}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{data.stats.productCount}</div>
          <div className="text-xs text-gray-500 mt-1">Produkte</div>
          <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${sampledPct}%` }} />
          </div>
          <div className="text-xs text-gray-400 mt-1">{sampledPct}% gemessen</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-800">
            {data.stats.avgPlasticG != null ? `${data.stats.avgPlasticG} g` : "—"}
          </div>
          <div className="text-xs text-blue-600 mt-1">Ø Kunststoff</div>
          {data.stats.stdPlasticG != null && (
            <div className="text-xs text-blue-400 mt-0.5">± {data.stats.stdPlasticG} g</div>
          )}
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-800">
            {data.stats.avgPaperG != null ? `${data.stats.avgPaperG} g` : "—"}
          </div>
          <div className="text-xs text-green-600 mt-1">Ø Papier/Pappe</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-purple-800">
            {data.stats.avgPlasticRatioPct != null ? `${data.stats.avgPlasticRatioPct}%` : "—"}
          </div>
          <div className="text-xs text-purple-600 mt-1">Ø Plastik/Bruttogew.</div>
          <div className="text-xs text-purple-400 mt-0.5">Verpackungsanteil</div>
        </div>
      </div>

      {/* Confidence + error + category row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category breakdown */}
        {data.stats.categoryBreakdown.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Kategorien</h2>
            <div className="space-y-2">
              {data.stats.categoryBreakdown.slice(0, 6).map(([cat, count]) => {
                const pct = Math.round((count / data.stats.productCount) * 100);
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 w-32 flex-shrink-0 truncate">{cat}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                      <div className="h-2.5 bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-gray-500 w-10 text-right">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quality metrics */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Datenqualität</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Ø Konfidenz</span>
              <span className={`text-sm font-bold ${
                (data.stats.avgConfidence ?? 0) >= 70 ? "text-green-600" :
                (data.stats.avgConfidence ?? 0) >= 40 ? "text-yellow-600" : "text-red-500"
              }`}>
                {data.stats.avgConfidence != null ? `${data.stats.avgConfidence}%` : "—"}
              </span>
            </div>
            {data.stats.avgEstimationErrorPct !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Ø Schätzfehler (erste Messung)</span>
                <span className={`text-sm font-bold ${
                  Math.abs(data.stats.avgEstimationErrorPct) < 15 ? "text-green-600" :
                  Math.abs(data.stats.avgEstimationErrorPct) < 30 ? "text-yellow-600" : "text-red-500"
                }`}>
                  {data.stats.avgEstimationErrorPct > 0 ? "+" : ""}{data.stats.avgEstimationErrorPct}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Stichproben-Abdeckung</span>
              <span className="text-sm font-bold text-gray-700">{sampledPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Produkte ({data.stats.productCount})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 font-medium text-gray-600">SKU</th>
                <th className="px-4 py-2 font-medium text-gray-600">Produkt</th>
                <th className="px-4 py-2 font-medium text-gray-600 hidden md:table-cell">Kategorie</th>
                <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="px-4 py-2 font-medium text-gray-600 text-right">Plastik</th>
                <th className="px-4 py-2 font-medium text-gray-600 min-w-[100px] hidden md:table-cell">Konfidenz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-blue-600">{p.ean}</td>
                  <td className="px-4 py-2">
                    <Link href={`/products/${p.id}`} className="hover:text-blue-600 font-medium">
                      {p.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 hidden md:table-cell">
                    {p.category}{p.subcategory ? ` / ${p.subcategory}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={p.packagingProfile?.status ?? "IMPORTED"} size="sm" />
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {p.packagingProfile?.currentPlasticG != null
                      ? `${p.packagingProfile.currentPlasticG.toFixed(1)} g`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 min-w-[100px] hidden md:table-cell">
                    <ConfidenceBar score={p.packagingProfile?.confidenceScore ?? null} showLabel={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
