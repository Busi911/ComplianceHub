"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BrandEntry } from "@/app/api/brands/route";

const STYLE_COLORS: Record<string, string> = {
  "minimal":         "bg-green-100 text-green-800",
  "oversized":       "bg-orange-100 text-orange-800",
  "eco-freundlich":  "bg-emerald-100 text-emerald-800",
  "standard":        "bg-gray-100 text-gray-700",
  "aufwendig":       "bg-red-100 text-red-700",
};

function styleChip(style: string | null) {
  if (!style) return null;
  const cls = STYLE_COLORS[style.toLowerCase()] ?? "bg-blue-100 text-blue-800";
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{style}</span>
  );
}

export default function BrandsPage() {
  const [entries, setEntries] = useState<BrandEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "brand" | "manufacturer">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false));
  }, []);

  const visible = entries.filter((e) => {
    if (filter !== "all" && e.entityType !== filter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const withProfile = entries.filter((e) => e.profile).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marken & Hersteller</h1>
          <p className="text-sm text-gray-500 mt-1">
            Profile, Verpackungstrends und Kennzahlen — {entries.length} Einträge, {withProfile} mit Notizen
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name suchen…"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 w-48"
        />
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {(["all", "brand", "manufacturer"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 transition-colors ${filter === t ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"} ${t !== "all" ? "border-l border-gray-300" : ""}`}
            >
              {t === "all" ? "Alle" : t === "brand" ? "Marken" : "Hersteller"}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{loading ? "Lädt…" : `${visible.length} Ergebnisse`}</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left border-b border-gray-200">
              <th className="px-4 py-2.5 font-medium text-gray-600">Name</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden sm:table-cell">Typ</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Produkte</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden md:table-cell">Gemessen</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden md:table-cell">Ø Plastik</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden lg:table-cell">Ø Papier</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden lg:table-cell">Ø Konfidenz</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Top-Kategorie</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden lg:table-cell">Stil</th>
              <th className="px-4 py-2.5 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading &&
              [...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && visible.map((e) => {
              const href = `/brands/${encodeURIComponent(e.name)}?type=${e.entityType}`;
              const sampledPct = e.productCount > 0
                ? Math.round((e.sampledCount / e.productCount) * 100) : 0;
              return (
                <tr key={`${e.entityType}::${e.name}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={href} className="font-medium text-gray-900 hover:text-blue-600">
                      {e.name}
                    </Link>
                    {e.profile?.notes && (
                      <div className="text-xs text-gray-400 truncate max-w-xs mt-0.5">
                        {e.profile.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded text-xs ${e.entityType === "brand" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                      {e.entityType === "brand" ? "Marke" : "Hersteller"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{e.productCount}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${sampledPct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{sampledPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs hidden md:table-cell">
                    {e.avgPlasticG != null ? `${e.avgPlasticG} g` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs hidden lg:table-cell">
                    {e.avgPaperG != null ? `${e.avgPaperG} g` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    {e.avgConfidence != null ? (
                      <span className={`text-xs font-medium ${e.avgConfidence >= 70 ? "text-green-600" : e.avgConfidence >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                        {e.avgConfidence}%
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell truncate max-w-[140px]">
                    {e.topCategory ?? "—"}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {styleChip(e.profile?.packagingStyle ?? null)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={href}
                      className={`text-xs px-2.5 py-1 rounded transition-colors ${e.profile ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {e.profile ? "Profil ansehen" : "Profil anlegen"}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  Keine Einträge gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
