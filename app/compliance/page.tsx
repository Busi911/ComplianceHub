"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CategoryRow {
  category: string;
  productCount: number;
  avgPlasticG: number | null;
  avgPaperG: number | null;
  annualPlasticKg: number;
  annualPaperKg: number;
  readyCount: number;
}

interface MissingRow {
  id: string;
  sku: string;
  productName: string;
  category: string | null;
  missingSales: boolean;
  missingPackaging: boolean;
}

interface ComplianceData {
  reportYear: number;
  totalProducts: number;
  productsWithSales: number;
  productsWithPackaging: number;
  productsFullyReady: number;
  readinessPct: number;
  totalPlasticKg: number;
  totalPaperKg: number;
  byCategory: CategoryRow[];
  topMissingData: MissingRow[];
}

function fmt(n: number | null, dec = 1): string {
  if (n === null) return "—";
  return n.toFixed(dec);
}

export default function CompliancePage() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/compliance")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function downloadCSV() {
    if (!data) return;
    const bom = "\uFEFF";
    const headers = [
      "Kategorie",
      "Anzahl Produkte",
      "Ø Kunststoff/Stk (g)",
      "Ø Papier/Stk (g)",
      "Kunststoff/Jahr (kg)",
      "Papier/Jahr (kg)",
      "Vollständig (mit Absatz)",
    ];
    const rows = data.byCategory.map((r) =>
      [
        r.category,
        r.productCount,
        r.avgPlasticG ?? "",
        r.avgPaperG ?? "",
        r.annualPlasticKg,
        r.annualPaperKg,
        r.readyCount,
      ].join(";")
    );
    const csv = bom + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_${data.reportYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-56" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>Fehler:</strong> {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const readinessColor =
    data.readinessPct >= 80
      ? "text-green-600"
      : data.readinessPct >= 40
        ? "text-yellow-600"
        : "text-red-600";

  const readinessBarColor =
    data.readinessPct >= 80
      ? "bg-green-500"
      : data.readinessPct >= 40
        ? "bg-yellow-400"
        : "bg-red-400";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            Compliance-Übersicht {data.reportYear}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verpackungsdaten für die Jahresmeldung (Kunststoff &amp; Papier/Karton)
          </p>
        </div>
        <button
          onClick={downloadCSV}
          className="flex-shrink-0 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
        >
          ↓ CSV-Export
        </button>
      </div>

      {/* Readiness banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Meldebereitschaft</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Produkte mit Verpackungsgewichten <em>und</em> Jahresabsatz
            </p>
          </div>
          <div className={`text-3xl font-bold ${readinessColor}`}>
            {data.readinessPct}%
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full ${readinessBarColor} transition-all`}
            style={{ width: `${data.readinessPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-gray-600">
            <strong className="text-gray-900">{data.productsFullyReady}</strong>{" "}
            von {data.totalProducts} vollständig
          </span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">
            <strong className="text-gray-900">{data.productsWithPackaging}</strong>{" "}
            mit Verpackungsgewichten
          </span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">
            <strong className="text-gray-900">{data.productsWithSales}</strong>{" "}
            mit Jahresabsatz
          </span>
        </div>
        {data.productsWithSales === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <strong>Jahresabsatz noch nicht erfasst.</strong> Öffne ein Produkt zum
            Bearbeiten und trage den Jahresabsatz (Stk.) ein — dann kann das System
            die jährlichen Gesamtmengen berechnen.
          </div>
        )}
      </div>

      {/* Annual totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="text-sm font-medium text-blue-700 mb-1">
            Kunststoff gesamt / Jahr
          </div>
          <div className="text-3xl font-bold text-blue-900">
            {data.totalPlasticKg.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
          </div>
          <div className="text-xs text-blue-500 mt-1">
            {data.productsWithSales > 0
              ? `Basierend auf ${data.productsWithSales} Produkten mit Absatzmengen`
              : "Kein Jahresabsatz erfasst"}
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="text-sm font-medium text-green-700 mb-1">
            Papier / Karton gesamt / Jahr
          </div>
          <div className="text-3xl font-bold text-green-900">
            {data.totalPaperKg.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
          </div>
          <div className="text-xs text-green-500 mt-1">
            {data.productsWithSales > 0
              ? `Basierend auf ${data.productsWithSales} Produkten mit Absatzmengen`
              : "Kein Jahresabsatz erfasst"}
          </div>
        </div>
      </div>

      {/* Per-category table */}
      {data.byCategory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Nach Kategorie</h2>
            <span className="text-xs text-gray-400">
              Sortiert nach jährlichem Gesamtgewicht
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-600">Kategorie</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden sm:table-cell">Produkte</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden md:table-cell">Ø Kunststoff/Stk (g)</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden md:table-cell">Ø Papier/Stk (g)</th>
                  <th className="px-4 py-2.5 font-medium text-blue-700 text-right">Kunststoff/Jahr (kg)</th>
                  <th className="px-4 py-2.5 font-medium text-green-700 text-right">Papier/Jahr (kg)</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-right hidden lg:table-cell">Vollständig</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byCategory.map((row) => (
                  <tr key={row.category} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.category}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                      {row.productCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600 hidden md:table-cell">
                      {row.avgPlasticG != null ? fmt(row.avgPlasticG) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-600 hidden md:table-cell">
                      {row.avgPaperG != null ? fmt(row.avgPaperG) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-blue-700">
                      {row.annualPlasticKg > 0 ? fmt(row.annualPlasticKg, 2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-green-700">
                      {row.annualPaperKg > 0 ? fmt(row.annualPaperKg, 2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className={`text-xs font-medium ${
                        row.readyCount === row.productCount
                          ? "text-green-600"
                          : row.readyCount > 0
                            ? "text-yellow-600"
                            : "text-gray-400"
                      }`}>
                        {row.readyCount}/{row.productCount}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-900">Gesamt</td>
                  <td className="px-4 py-3 text-right text-gray-700 hidden sm:table-cell">
                    {data.totalProducts}
                  </td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="px-4 py-3 text-right font-mono text-sm text-blue-800">
                    {data.totalPlasticKg.toFixed(2)} kg
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-green-800">
                    {data.totalPaperKg.toFixed(2)} kg
                  </td>
                  <td className="hidden lg:table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Missing data */}
      {data.topMissingData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Unvollständige Produkte</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Produkte mit fehlendem Jahresabsatz oder Verpackungsgewichten
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {data.topMissingData.map((p) => (
              <div
                key={p.id}
                className="px-5 py-3 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {p.productName}
                  </Link>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{p.sku}</span>
                    {p.category && <span>· {p.category}</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {p.missingSales && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Kein Absatz
                    </span>
                  )}
                  {p.missingPackaging && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Kein Gewicht
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data.totalProducts - data.productsFullyReady > data.topMissingData.length && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              … und {data.totalProducts - data.productsFullyReady - data.topMissingData.length} weitere.{" "}
              <Link href="/sampling/session" className="text-blue-500 hover:underline">
                Wiegesession starten →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-600 space-y-2">
        <p className="font-medium text-gray-800">So verbessert ihr die Meldebereitschaft:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            <strong>Verpackungsgewichte:</strong> Produkte wiegen via{" "}
            <Link href="/sampling/session" className="text-blue-600 hover:underline">
              Wiegesession
            </Link>{" "}
            oder{" "}
            <Link href="/sampling/batch" className="text-blue-600 hover:underline">
              Batch-Stichprobe
            </Link>
            . Das System schätzt auch automatisch ähnliche Produkte.
          </li>
          <li>
            <strong>Jahresabsatz:</strong> Pro Produkt in der Detailansicht das
            Feld "Jahresabsatz (Stk.)" ausfüllen — oder per CSV-Import mit der
            Spalte "Jahresabsatz (Stk.)" für alle Produkte auf einmal.
          </li>
        </ol>
      </div>
    </div>
  );
}
