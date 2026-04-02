"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface LevyProfile {
  productId: string;
  status: string;
  levyCategory: string | null;
  estimatedLevyEur: number | null;
  annualLevyEur: number | null;
  confidenceScore: number | null;
  product: { id: string; productName: string; category: string | null; ean: string; annualUnitsSold: number | null };
}

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-800", DECLARED: "bg-blue-100 text-blue-800",
  ESTIMATED: "bg-yellow-100 text-yellow-800", UNKNOWN: "bg-gray-100 text-gray-600",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

const LEVY_LABELS: Record<string, string> = {
  PRINTER_SCANNER_COPIER: "Drucker/Scanner/Kopierer", USB_STICK: "USB-Stick",
  SSD_HDD: "SSD/HDD", MEMORY_CARD: "Speicherkarte",
  OPTICAL_MEDIA: "Optische Medien", TABLET_SMARTPHONE: "Tablet/Smartphone",
  PC_LAPTOP: "PC/Laptop", NOT_APPLICABLE: "Nicht anwendbar",
};

export default function LevyPage() {
  const [data, setData] = useState<{ profiles: LevyProfile[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status) p.set("status", status);
    fetch(`/api/compliance/levy?${p}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => { load(); }, [load]);

  async function bulkClassify() {
    setClassifying(true);
    await fetch("/api/compliance/levy", { method: "POST" });
    setClassifying(false);
    load();
  }

  const totalAnnual = (data?.profiles ?? [])
    .filter((p) => p.annualLevyEur != null)
    .reduce((sum, p) => sum + (p.annualLevyEur ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Abgaben §54 UrhG</h1>
          <p className="text-sm text-gray-500">Geräteabgabe (ZPÜ) — {data?.total ?? 0} Profile</p>
        </div>
        <button onClick={bulkClassify} disabled={classifying}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {classifying ? "Klassifiziere…" : "KI-Bulk-Klassifizierung"}
        </button>
      </div>

      {totalAnnual > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            Geschätzte Jahresabgabe (sichtbare Einträge): {totalAnnual.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
          </p>
        </div>
      )}

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
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">ZPÜ-Kategorie</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Satz/Stück</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Jahresabgabe</th>
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
                    {p.levyCategory ? LEVY_LABELS[p.levyCategory] ?? p.levyCategory : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {p.estimatedLevyEur != null ? `${p.estimatedLevyEur.toFixed(2)} €` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {p.annualLevyEur != null
                      ? p.annualLevyEur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
                      : "—"}
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
