"use client";

import { useEffect, useState, useCallback } from "react";

interface Correction {
  id: string;
  module: string;
  productName: string;
  productCategory: string | null;
  ean: string;
  correctedFields: Record<string, { old: unknown; new: unknown }>;
  createdAt: string;
}

interface CorrectionsResponse {
  corrections: Correction[];
  total: number;
  fieldCounts: Record<string, number>;
}

const MODULE_LABELS: Record<string, string> = {
  battery: "BattDG", weee: "ElektroG", levy: "Abgaben §54",
  reach: "REACH", rohs: "RoHS", eudr: "EUDR", pop: "POP",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}

export default function CorrectionsPage() {
  const [data, setData] = useState<CorrectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (module) p.set("module", module);
    fetch(`/api/compliance/corrections?${p}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [module]);

  useEffect(() => { load(); }, [load]);

  const topFields = Object.entries(data?.fieldCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Korrekturen & Lernhistorie</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manuelle Korrekturen werden als Lernbeispiele in zukünftige KI-Klassifizierungen eingebettet.
        </p>
      </div>

      {/* Pattern summary */}
      {topFields.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-blue-700 mb-2">Häufig korrigierte Felder</p>
          <div className="flex flex-wrap gap-2">
            {topFields.map(([field, count]) => (
              <span key={field} className="inline-flex items-center gap-1 bg-white border border-blue-200 rounded px-2 py-0.5 text-xs text-blue-800">
                <span className="font-medium">{field}</span>
                <span className="text-blue-400">{count}×</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-3">
        <select value={module} onChange={(e) => setModule(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm">
          <option value="">Alle Module</option>
          {Object.entries(MODULE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 self-center">{data?.total ?? 0} Korrekturen</span>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Lade…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Produkt</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Modul</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Korrigierte Felder</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.corrections ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-xs">{c.productName}</p>
                    <p className="text-xs text-gray-400">{c.productCategory ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                      {MODULE_LABELS[c.module] ?? c.module}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {Object.entries(c.correctedFields).map(([field, { old: oldVal, new: newVal }]) => (
                        <div key={field} className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">{field}:</span>{" "}
                          <span className="line-through text-red-400">{formatValue(oldVal)}</span>
                          {" → "}
                          <span className="text-green-600 font-medium">{formatValue(newVal)}</span>
                        </div>
                      ))}
                      {Object.keys(c.correctedFields).length === 0 && (
                        <span className="text-xs text-gray-400">Status bestätigt</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString("de-DE")}
                  </td>
                </tr>
              ))}
              {(data?.corrections ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Noch keine Korrekturen vorhanden.<br />
                    <span className="text-xs">Korrigiere eine KI-Klassifizierung auf einer Modulseite, um den Lernprozess zu starten.</span>
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
