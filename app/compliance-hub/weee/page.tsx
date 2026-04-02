"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface WeeeProfile {
  productId: string;
  status: string;
  isElectronic: boolean | null;
  weeeCategory: string | null;
  annualWeeeKg: number | null;
  confidenceScore: number | null;
  product: { id: string; productName: string; category: string | null; ean: string };
}

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-800", DECLARED: "bg-blue-100 text-blue-800",
  ESTIMATED: "bg-yellow-100 text-yellow-800", UNKNOWN: "bg-gray-100 text-gray-600",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

const WEEE_LABELS: Record<string, string> = {
  HAUSHALTSGROSSE_GERATE: "Haushaltsgroßgeräte", HAUSHALTSKLEINGERATE: "Haushaltskleingeräte",
  IT_TELEKOMMUNIKATION: "IT & Telekommunikation", UNTERHALTUNGSELEKTRONIK: "Unterhaltungselektronik",
  BELEUCHTUNG: "Beleuchtung", WERKZEUGE: "Werkzeuge",
  SPIELZEUG_FREIZEIT_SPORT: "Spielzeug/Freizeit/Sport", MEDIZINPRODUKTE: "Medizinprodukte",
  UEBERWACHUNGS_INSTRUMENTE: "Überwachungsinstrumente", AUTOMATEN: "Automaten",
};

export default function WeeePage() {
  const [data, setData] = useState<{ profiles: WeeeProfile[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState<"" | "rules" | "ai">("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status) p.set("status", status);
    fetch(`/api/compliance/weee?${p}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  async function bulkClassify(noAi: boolean) {
    setClassifying(noAi ? "rules" : "ai");
    await fetch(`/api/compliance/weee${noAi ? "?noAi=true" : ""}`, { method: "POST" });
    setClassifying("");
    load();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ElektroG / WEEE</h1>
          <p className="text-sm text-gray-500">Elektro- und Elektronikgerätegesetz — {data?.total ?? 0} Profile</p>
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
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">ElektroG-Kategorie</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Jahres-WEEE (kg)</th>
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
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {p.weeeCategory ? WEEE_LABELS[p.weeeCategory] ?? p.weeeCategory : (p.isElectronic === false ? "Nicht elektronisch" : "—")}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {p.annualWeeeKg != null ? `${p.annualWeeeKg.toFixed(1)} kg` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.confidenceScore != null ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.confidenceScore * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(p.confidenceScore * 100)}%</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/products/${p.product.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-800">Produkt →</Link>
                  </td>
                </tr>
              ))}
              {(data?.profiles ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">Keine Einträge gefunden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
