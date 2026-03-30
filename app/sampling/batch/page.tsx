"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BatchProduct {
  id: string;
  sku: string;
  internalArticleNumber: string | null;
  productName: string;
  category: string | null;
  brand: string | null;
  manufacturer: string | null;
  grossWeightG: number | null;
  packagingProfile: { confidenceScore: number | null; status: string } | null;
}

interface BatchRow {
  product: BatchProduct;
  plasticG: string;
  paperG: string;
  totalG: string;
  sampledBy: string;
  notes: string;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

export default function BatchSamplingPage() {
  const [products, setProducts] = useState<BatchProduct[]>([]);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSampledBy, setGlobalSampledBy] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    fetch("/api/sampling/priority?limit=50")
      .then((r) => r.json())
      .then((d) => {
        const prods: BatchProduct[] = d.products ?? [];
        setProducts(prods);
        setRows(
          prods.map((p) => ({
            product: p,
            plasticG: "",
            paperG: "",
            totalG: "",
            sampledBy: "",
            notes: "",
            saved: false,
            saving: false,
            error: null,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  function updateRow(idx: number, field: keyof BatchRow, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  async function saveRow(idx: number) {
    const row = rows[idx];
    if (!row.plasticG && !row.paperG && !row.totalG) return;

    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, saving: true, error: null } : r))
    );

    try {
      const res = await fetch("/api/sampling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: row.product.id,
          sampledBy: row.sampledBy || globalSampledBy || null,
          measuredPlasticG: row.plasticG || null,
          measuredPaperG: row.paperG || null,
          measuredTotalPackagingG: row.totalG || null,
          notes: row.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, saving: false, saved: true, error: null } : r
        )
      );
      setSavedCount((c) => c + 1);
    } catch (err) {
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                saving: false,
                error: err instanceof Error ? err.message : "Fehler",
              }
            : r
        )
      );
    }
  }

  async function saveAll() {
    setSavingAll(true);
    const toSave = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !r.saved && (r.plasticG || r.paperG || r.totalG));

    for (const { i } of toSave) {
      await saveRow(i);
    }
    setSavingAll(false);
  }

  const filledRows = rows.filter(
    (r) => !r.saved && (r.plasticG || r.paperG || r.totalG)
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/sampling" className="hover:text-gray-700">← Prioritätsliste</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Batch-Stichprobe</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mehrere Produkte auf einmal wiegen und erfassen
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedCount > 0 && (
            <span className="text-sm text-green-600 font-medium">
              ✓ {savedCount} gespeichert
            </span>
          )}
          {filledRows > 0 && (
            <button
              onClick={saveAll}
              disabled={savingAll}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {savingAll ? "Speichert…" : `Alle ${filledRows} speichern`}
            </button>
          )}
        </div>
      </div>

      {/* Global sampledBy */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
          Erfasst von (global):
        </label>
        <input
          type="text"
          value={globalSampledBy}
          onChange={(e) => setGlobalSampledBy(e.target.value)}
          placeholder="Name des Mitarbeiters"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400 w-64"
        />
        <span className="text-xs text-gray-400">
          Wird für alle Zeilen übernommen, sofern kein individueller Name eingetragen ist.
        </span>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Lädt Produkte…</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left sticky top-0">
                  <th className="px-3 py-2.5 font-medium text-gray-600">SKU / Produkt</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600">Kategorie</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 text-center w-28">
                    Kunststoff (g)
                  </th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 text-center w-28">
                    Papier (g)
                  </th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 text-center w-28">
                    Gesamt (g)
                  </th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-32">Von</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-36">Notiz</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-24">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <tr
                    key={row.product.id}
                    className={
                      row.saved
                        ? "bg-green-50 opacity-60"
                        : "hover:bg-gray-50"
                    }
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-blue-600">
                        {row.product.sku}
                      </div>
                      {row.product.internalArticleNumber && (
                        <div className="text-xs text-gray-400">
                          {row.product.internalArticleNumber}
                        </div>
                      )}
                      <div className="text-sm font-medium text-gray-800 truncate max-w-[200px]" title={row.product.productName}>
                        {row.product.productName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {row.product.category}
                      {row.product.brand && (
                        <div className="text-gray-400">{row.product.brand}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={row.plasticG}
                        onChange={(e) => updateRow(idx, "plasticG", e.target.value)}
                        disabled={row.saved}
                        placeholder="0.0"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center outline-none focus:border-blue-400 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={row.paperG}
                        onChange={(e) => updateRow(idx, "paperG", e.target.value)}
                        disabled={row.saved}
                        placeholder="0.0"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center outline-none focus:border-green-400 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={row.totalG}
                        onChange={(e) => updateRow(idx, "totalG", e.target.value)}
                        disabled={row.saved}
                        placeholder="0.0"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center outline-none focus:border-gray-400 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.sampledBy}
                        onChange={(e) => updateRow(idx, "sampledBy", e.target.value)}
                        disabled={row.saved}
                        placeholder={globalSampledBy || "Name"}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-400 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => updateRow(idx, "notes", e.target.value)}
                        disabled={row.saved}
                        placeholder="optional"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:border-gray-400 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {row.saved ? (
                        <span className="text-green-600 text-xs font-medium">✓ Gespeichert</span>
                      ) : row.error ? (
                        <span className="text-red-500 text-xs">{row.error}</span>
                      ) : (
                        <button
                          onClick={() => saveRow(idx)}
                          disabled={
                            row.saving ||
                            (!row.plasticG && !row.paperG && !row.totalG)
                          }
                          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-40"
                        >
                          {row.saving ? "…" : "Speichern"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Keine Produkte ohne Stichprobe gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
