"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface EudrProfile {
  productId: string;
  status: string;
  containsRegulatedCommodity: boolean | null;
  commoditiesJson: string | null;
  dueDiligenceRequired: boolean | null;
  hasGeolocationData: boolean | null;
  confidenceScore: number | null;
  product: { id: string; productName: string; category: string | null; ean: string };
}

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-800", DECLARED: "bg-blue-100 text-blue-800",
  ESTIMATED: "bg-yellow-100 text-yellow-800", UNKNOWN: "bg-gray-100 text-gray-600",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

export default function EudrPage() {
  const [data, setData] = useState<{ profiles: EudrProfile[]; total: number; page: number; pageCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState<"" | "rules" | "ai">("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status) p.set("status", status);
    p.set("page", String(page));
    fetch(`/api/compliance/eudr?${p}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [search, status, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  async function bulkClassify(noAi: boolean) {
    setClassifying(noAi ? "rules" : "ai");
    await fetch(`/api/compliance/eudr${noAi ? "?noAi=true" : ""}`, { method: "POST" });
    setClassifying("");
    load();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">EUDR — Entwaldungsverordnung</h1>
          <p className="text-sm text-gray-500">EU Deforestation Regulation — {data?.total ?? 0} Profile</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => bulkClassify(true)} disabled={classifying !== ""}
            title="Nur Regelwerk — keine KI, kostenlos"
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50">
            {classifying === "rules" ? "Läuft…" : "Regelwerk (kostenlos)"}
          </button>
          <button onClick={() => bulkClassify(false)} disabled={classifying !== ""}
            title="Regelwerk + KI für unbekannte Produkte"
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {classifying === "ai" ? "Klassifiziere…" : "Regelwerk + KI"}
          </button>
        </div>
      </div>
      <div className="flex gap-3">
        <input type="text" placeholder="Suche Produkt / EAN…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded px-3 py-1.5 text-sm">
          <option value="">Alle Status</option>
          {["UNKNOWN","ESTIMATED","DECLARED","VERIFIED","NOT_APPLICABLE"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {loading ? <p className="text-gray-400 text-sm">Lade…</p> : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Produkt</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Regulierte Rohstoffe</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Sorgfaltspflicht</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.profiles ?? []).map((p) => {
                let commodities: string[] = [];
                try { commodities = JSON.parse(p.commoditiesJson ?? "[]"); } catch {}
                return (
                  <tr key={p.productId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-xs">{p.product.productName}</p>
                      <p className="text-xs text-gray-400">{p.product.category ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {commodities.length > 0 ? commodities.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 text-xs">
                      {p.dueDiligenceRequired === true ? "Ja" : p.dueDiligenceRequired === false ? "Nein" : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/products/${p.product.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-800">Produkt →</Link>
                    </td>
                  </tr>
                );
              })}
              {(data?.profiles ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">Keine Einträge gefunden</td></tr>
              )}
            </tbody>
          </table>
          {data && data.pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
              <span>{data.total} Einträge · Seite {data.page} von {data.pageCount}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">← Zurück</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= (data.pageCount ?? 1)}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">Weiter →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
