"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  totalProducts: number;
  productsWithSampling: number;
  productsWithEstimateOnly: number;
  productsImported: number;
  productsMissingMinData: number;
  productsWithoutSampling: number;
  recentImportBatches: {
    id: string;
    name: string;
    importedAt: string;
    rowCount: number;
    successCount: number;
    errorCount: number;
  }[];
}

function StatCard({
  label,
  value,
  subtext,
  color,
  href,
}: {
  label: string;
  value: number | string;
  subtext?: string;
  color?: string;
  href?: string;
}) {
  const content = (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-5 ${href ? "hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer" : ""}`}
    >
      <div className="text-sm text-gray-500 font-medium">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color ?? "text-gray-900"}`}>
        {value}
      </div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <strong>Fehler:</strong> {error}
          {error.includes("DATABASE_URL") && (
            <p className="mt-2 text-sm">
              Bitte .env Datei mit korrekter DATABASE_URL anlegen und Server
              neu starten.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const samplingPct =
    data.totalProducts > 0
      ? Math.round((data.productsWithSampling / data.totalProducts) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Übersicht aller Verpackungsdaten
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Produkte gesamt"
          value={data.totalProducts}
          href="/products"
        />
        <StatCard
          label="Importiert"
          value={data.productsImported}
          subtext="mit Import-Batch"
          color="text-blue-600"
          href="/products"
        />
        <StatCard
          label="Mit Stichprobe"
          value={data.productsWithSampling}
          subtext={`${samplingPct}% aller Produkte`}
          color="text-green-600"
          href="/products?status=sampled"
        />
        <StatCard
          label="Nur Schätzung"
          value={data.productsWithEstimateOnly}
          subtext="regelbasiert"
          color="text-yellow-600"
          href="/products?status=estimated"
        />
        <StatCard
          label="Fehlende Mindestdaten"
          value={data.productsMissingMinData}
          subtext="Kategorie od. Gewicht fehlt"
          color={data.productsMissingMinData > 0 ? "text-red-600" : "text-gray-400"}
        />
      </div>

      {/* Coverage bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Stichproben-Abdeckung</h2>
          <span className="text-sm text-gray-500">
            {data.productsWithSampling} von {data.totalProducts} Produkten
            gemessen
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="h-3 rounded-full bg-green-500 transition-all"
            style={{ width: `${samplingPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0%</span>
          <span>{samplingPct}% gemessen</span>
          <span>100%</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/import"
          className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl">
            ↑
          </div>
          <div>
            <div className="font-medium text-blue-900">CSV importieren</div>
            <div className="text-xs text-blue-600">Produkte hochladen</div>
          </div>
        </Link>
        <Link
          href="/products"
          className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors"
        >
          <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-white text-xl">
            ☰
          </div>
          <div>
            <div className="font-medium text-gray-900">Produkte anzeigen</div>
            <div className="text-xs text-gray-500">Liste durchsuchen</div>
          </div>
        </Link>
        <Link
          href="/products?status=imported"
          className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4 hover:bg-yellow-100 transition-colors"
        >
          <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center text-white text-xl">
            ⚡
          </div>
          <div>
            <div className="font-medium text-yellow-900">Stichproben erfassen</div>
            <div className="text-xs text-yellow-600">
              {data.productsWithoutSampling} Produkte ohne Messung
            </div>
          </div>
        </Link>
      </div>

      {/* Recent imports */}
      {data.recentImportBatches.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Letzte Importe</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {data.recentImportBatches.map((batch) => (
              <div
                key={batch.id}
                className="px-5 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {batch.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(batch.importedAt).toLocaleString("de-DE")} •{" "}
                    {batch.rowCount} Zeilen
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-600 font-medium">
                    ✓ {batch.successCount}
                  </span>
                  {batch.errorCount > 0 && (
                    <span className="text-red-600 font-medium">
                      ✗ {batch.errorCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
