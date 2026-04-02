"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface BatteryProfile {
  productId: string;
  status: string;
  containsBattery: boolean | null;
  batteryType: string | null;
  isRemovable: boolean | null;
  annualBatteryTonnes: number | null;
  confidenceScore: number | null;
  estimationMethod: string | null;
  product: {
    id: string;
    productName: string;
    category: string | null;
    ean: string;
    annualUnitsSold: number | null;
  };
}

const STATUS_COLORS: Record<string, string> = {
  VERIFIED:       "bg-green-100 text-green-800",
  DECLARED:       "bg-blue-100 text-blue-800",
  ESTIMATED:      "bg-yellow-100 text-yellow-800",
  UNKNOWN:        "bg-gray-100 text-gray-600",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

export default function BatteryPage() {
  const [data, setData] = useState<{ profiles: BatteryProfile[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status) p.set("status", status);
    fetch(`/api/compliance/battery?${p}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  async function bulkClassify() {
    setClassifying(true);
    await fetch("/api/compliance/battery", { method: "POST" });
    setClassifying(false);
    load();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">BattDG — Batteriegesetz</h1>
          <p className="text-sm text-gray-500">
            Klassifizierung nach Batteriegesetz (BattDG) — {data?.total ?? 0} Profile
          </p>
        </div>
        <button
          onClick={bulkClassify}
          disabled={classifying}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {classifying ? "Klassifiziere…" : "KI-Bulk-Klassifizierung"}
        </button>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Suche Produkt / EAN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">Alle Status</option>
          <option value="UNKNOWN">UNKNOWN</option>
          <option value="ESTIMATED">ESTIMATED</option>
          <option value="DECLARED">DECLARED</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Lade…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Produkt</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Batterietyp</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Jahres-Tonnage</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Confidence</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.profiles ?? []).map((p) => (
                <tr key={p.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-xs">{p.product.productName}</p>
                    <p className="text-xs text-gray-400">{p.product.category ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.containsBattery === false
                      ? "Keine Batterie"
                      : p.batteryType ?? (p.containsBattery ? "Unbekannt" : "—")}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {p.annualBatteryTonnes != null
                      ? `${p.annualBatteryTonnes.toFixed(4)} t`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.confidenceScore != null ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${p.confidenceScore * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(p.confidenceScore * 100)}%</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/products/${p.product.id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Produkt →
                    </Link>
                  </td>
                </tr>
              ))}
              {(data?.profiles ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                    Keine Einträge gefunden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
