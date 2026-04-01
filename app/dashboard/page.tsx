"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GamificationData } from "@/app/api/gamification/route";

interface CronRunSummary {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number | null;
  changedCount: number;
}

interface EstimateChange {
  id: string;
  productId: string;
  productName: string;
  ean: string;
  category: string | null;
  oldPlasticG: number | null;
  oldPaperG: number | null;
  newPlasticG: number | null;
  newPaperG: number | null;
  reason: string | null;
  method: string | null;
  createdAt: string;
  isCron: boolean;
}

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
  statusDistribution: {
    IMPORTED: number;
    ESTIMATED: number;
    SAMPLED: number;
    REVIEWED: number;
  };
  avgConfidence: number;
  confidenceDistribution: { low: number; medium: number; high: number };
  lastCronRun: CronRunSummary | null;
  recentEstimateChanges: EstimateChange[];
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
    <div className={`bg-white rounded-lg border border-gray-200 p-5 ${href ? "hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer" : ""}`}>
      <div className="text-sm text-gray-500 font-medium">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color ?? "text-gray-900"}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

const STATUS_CONFIG = [
  { key: "IMPORTED" as const, label: "Importiert", color: "bg-gray-400", textColor: "text-gray-600" },
  { key: "ESTIMATED" as const, label: "Geschätzt", color: "bg-yellow-400", textColor: "text-yellow-700" },
  { key: "SAMPLED" as const, label: "Gemessen", color: "bg-green-500", textColor: "text-green-700" },
  { key: "REVIEWED" as const, label: "Geprüft", color: "bg-blue-500", textColor: "text-blue-700" },
];

function methodBadge(method: string | null): string {
  if (!method) return "—";
  if (method.startsWith("own_sampling")) return "Eigene Wiegung";
  if (method.startsWith("manufacturer_data")) return "Hersteller-Angabe";
  if (method.startsWith("similar_products")) return "Ähnliche Produkte";
  if (method.startsWith("regression")) return "Regression";
  if (method.startsWith("category_avg")) return "Kategorie-Ø";
  return method;
}

function methodColor(method: string | null): string {
  if (!method) return "bg-gray-100 text-gray-500";
  if (method.startsWith("own_sampling")) return "bg-green-100 text-green-800";
  if (method.startsWith("manufacturer_data")) return "bg-blue-100 text-blue-800";
  if (method.startsWith("similar_products")) return "bg-yellow-100 text-yellow-800";
  if (method.startsWith("regression")) return "bg-purple-100 text-purple-800";
  if (method.startsWith("category_avg")) return "bg-orange-100 text-orange-800";
  return "bg-gray-100 text-gray-600";
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffMin < 1440) return `vor ${Math.round(diffMin / 60)} Std.`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtG(val: number | null) {
  if (val === null) return "—";
  return `${val.toFixed(1)} g`;
}

function DeltaArrow({ old: oldVal, next: newVal }: { old: number | null; next: number | null }) {
  if (oldVal === null || newVal === null) return null;
  const diff = newVal - oldVal;
  if (Math.abs(diff) < 0.05) return null;
  const pct = oldVal > 0 ? Math.round((diff / oldVal) * 100) : null;
  const better = diff < 0; // lower plastic = generally better estimate (less packaging)
  return (
    <span className={`text-xs font-medium ml-1 ${better ? "text-green-600" : "text-orange-600"}`}>
      {diff > 0 ? "+" : ""}{diff.toFixed(1)} g{pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gamification, setGamification] = useState<GamificationData | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then((r) => r.json()),
      fetch("/api/gamification").then((r) => r.json()),
    ])
      .then(([d, g]) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        if (!g.error) setGamification(g);
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
            {[...Array(5)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-lg" />)}
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
        </div>
      </div>
    );
  }

  if (!data) return null;

  const samplingPct = data.totalProducts > 0
    ? Math.round((data.productsWithSampling / data.totalProducts) * 100)
    : 0;

  const statusTotal =
    data.statusDistribution.IMPORTED + data.statusDistribution.ESTIMATED +
    data.statusDistribution.SAMPLED + data.statusDistribution.REVIEWED;

  const confTotal =
    data.confidenceDistribution.low + data.confidenceDistribution.medium + data.confidenceDistribution.high;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">Übersicht aller Verpackungsdaten</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Produkte gesamt" value={data.totalProducts} href="/products" />
        <StatCard label="Importiert" value={data.productsImported} subtext="mit Import-Batch" color="text-blue-600" href="/products" />
        <StatCard label="Mit Stichprobe" value={data.productsWithSampling} subtext={`${samplingPct}% aller Produkte`} color="text-green-600" href="/products?status=sampled" />
        <StatCard label="Nur Schätzung" value={data.productsWithEstimateOnly} subtext="regelbasiert" color="text-yellow-600" href="/products?status=estimated" />
        <StatCard
          label="Fehlende Mindestdaten"
          value={data.productsMissingMinData}
          subtext="Kategorie od. Gewicht fehlt"
          color={data.productsMissingMinData > 0 ? "text-red-600" : "text-gray-400"}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Status-Verteilung</h2>
          {statusTotal === 0 ? (
            <p className="text-sm text-gray-400">Keine Daten vorhanden.</p>
          ) : (
            <>
              <div className="flex h-6 rounded-full overflow-hidden">
                {STATUS_CONFIG.map(({ key, color }) => {
                  const pct = statusTotal > 0 ? (data.statusDistribution[key] / statusTotal) * 100 : 0;
                  return pct > 0 ? (
                    <div key={key} className={`${color} transition-all`} style={{ width: `${pct}%` }} title={`${key}: ${data.statusDistribution[key]}`} />
                  ) : null;
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_CONFIG.map(({ key, label, color, textColor }) => {
                  const count = data.statusDistribution[key];
                  const pct = statusTotal > 0 ? Math.round((count / statusTotal) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${color}`} />
                      <div className="text-xs">
                        <span className={`font-medium ${textColor}`}>{count}</span>
                        <span className="text-gray-400 ml-1">{label} ({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Confidence distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Datenqualität (Konfidenz)</h2>
            <span className="text-sm font-bold text-gray-700">Ø {Math.round(data.avgConfidence * 100)}%</span>
          </div>
          {confTotal === 0 ? (
            <p className="text-sm text-gray-400">Keine Daten vorhanden.</p>
          ) : (
            <div className="space-y-2">
              {[
                { label: "Hoch (70–100%)", count: data.confidenceDistribution.high, color: "bg-green-500", textColor: "text-green-700" },
                { label: "Mittel (40–69%)", count: data.confidenceDistribution.medium, color: "bg-yellow-400", textColor: "text-yellow-700" },
                { label: "Niedrig (0–39%)", count: data.confidenceDistribution.low, color: "bg-red-400", textColor: "text-red-700" },
              ].map(({ label, count, color, textColor }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="text-xs text-gray-500 w-32 flex-shrink-0">{label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div className={`h-4 rounded-full ${color} transition-all`} style={{ width: `${confTotal > 0 ? (count / confTotal) * 100 : 0}%` }} />
                  </div>
                  <div className={`text-xs font-medium w-8 text-right ${textColor}`}>{count}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">
            Mehr Wiegungen verbessern den Konfidenzwert.{" "}
            <Link href="/sampling" className="text-blue-500 hover:underline">Prioritätsliste →</Link>
          </p>
        </div>
      </div>

      {/* Sampling coverage */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Stichproben-Abdeckung</h2>
          <span className="text-sm text-gray-500">{data.productsWithSampling} von {data.totalProducts} Produkten gemessen</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${samplingPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0%</span>
          <span>{samplingPct}% gemessen</span>
          <span>100%</span>
        </div>
      </div>

      {/* System activity — cron summary + estimate feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Last cron run card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Letzter Cron-Lauf</h2>
            <Link href="/estimation-rules" className="text-xs text-blue-500 hover:underline">Schätzlogik →</Link>
          </div>
          {!data.lastCronRun ? (
            <p className="text-sm text-gray-400">Noch kein Cron-Lauf aufgezeichnet.</p>
          ) : (
            <>
              <div className="text-xs text-gray-400">
                {fmtTime(data.lastCronRun.startedAt)}
                {data.lastCronRun.durationMs && (
                  <span className="ml-2 text-gray-300">· {(data.lastCronRun.durationMs / 1000).toFixed(1)} s</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Geprüft", value: data.lastCronRun.total, color: "text-gray-700" },
                  { label: "Aktualisiert", value: data.lastCronRun.updated, color: "text-green-700" },
                  { label: "Geändert", value: data.lastCronRun.changedCount, color: "text-blue-700" },
                  { label: "Fehler", value: data.lastCronRun.errors, color: data.lastCronRun.errors > 0 ? "text-red-600" : "text-gray-300" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-50 rounded p-2 text-center">
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-gray-400">{label}</div>
                  </div>
                ))}
              </div>
              {data.lastCronRun.errors > 0 && (
                <div className="text-xs text-red-500 bg-red-50 rounded p-2">
                  {data.lastCronRun.errors} Produkt(e) konnten nicht verarbeitet werden.
                </div>
              )}
            </>
          )}
        </div>

        {/* Estimation activity feed */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Schätzungsaktivität</h2>
            <span className="text-xs text-gray-400">Letzte 25 Änderungen</span>
          </div>
          {data.recentEstimateChanges.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine Schätzungsänderungen vorhanden.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.recentEstimateChanges.map((change) => (
                <div key={change.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/products/${change.productId}`} className="text-sm font-medium text-gray-800 hover:text-blue-600 truncate max-w-xs">
                        {change.productName}
                      </Link>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${methodColor(change.method)}`}>
                        {methodBadge(change.method)}
                      </span>
                      {change.isCron && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500 flex-shrink-0">Cron</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        Plastik: {fmtG(change.oldPlasticG)} → <span className="font-medium text-gray-700">{fmtG(change.newPlasticG)}</span>
                        <DeltaArrow old={change.oldPlasticG} next={change.newPlasticG} />
                      </span>
                      {(change.oldPaperG !== null || change.newPaperG !== null) && (
                        <span>
                          Papier: {fmtG(change.oldPaperG)} → <span className="font-medium text-gray-700">{fmtG(change.newPaperG)}</span>
                          <DeltaArrow old={change.oldPaperG} next={change.newPaperG} />
                        </span>
                      )}
                    </div>
                    {change.category && (
                      <div className="text-xs text-gray-400 mt-0.5">{change.category}</div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{fmtTime(change.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Gamification */}
      {gamification && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-orange-600">
                {gamification.streak > 0 ? `🔥 ${gamification.streak}` : "—"}
              </div>
              <div className="text-xs text-orange-700 mt-1 font-medium">Tage in Folge</div>
              <div className="text-xs text-orange-400 mt-0.5">Aktuelle Serie</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-700">{gamification.todayCount}</div>
              <div className="text-xs text-green-700 mt-1 font-medium">Heute gewogen</div>
              <div className="text-xs text-green-400 mt-0.5">{gamification.totalSamplingRecords} gesamt</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-700">{gamification.totalSampledProducts}</div>
              <div className="text-xs text-blue-700 mt-1 font-medium">Produkte gemessen</div>
              <div className="text-xs text-blue-400 mt-0.5">mit eigener Stichprobe</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-purple-700">
                {gamification.avgEstimationErrorAbs !== null ? `${gamification.avgEstimationErrorAbs}%` : "—"}
              </div>
              <div className="text-xs text-purple-700 mt-1 font-medium">Ø Schätzfehler</div>
              <div className="text-xs text-purple-400 mt-0.5">bei Erstmessung</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Aktivität letzte 7 Tage</h2>
              <div className="flex items-end gap-1.5 h-20">
                {gamification.weeklyActivity.map(({ date, count }) => {
                  const maxCount = Math.max(...gamification.weeklyActivity.map((d) => d.count), 1);
                  const pct = Math.round((count / maxCount) * 100);
                  const isToday = date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1" title={`${date}: ${count} Wiegungen`}>
                      <div className="w-full flex items-end" style={{ height: 64 }}>
                        <div
                          className={`w-full rounded-t transition-all ${isToday ? "bg-green-500" : count > 0 ? "bg-blue-400" : "bg-gray-100"}`}
                          style={{ height: `${Math.max(pct, count > 0 ? 8 : 4)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(date).toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}
                      </div>
                      {count > 0 && <div className="text-xs font-medium text-gray-600">{count}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Abzeichen</h2>
              <div className="grid grid-cols-4 gap-2">
                {gamification.badges.map((badge) => (
                  <div
                    key={badge.id}
                    title={badge.description}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg text-center transition-all ${
                      badge.earned ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50 border border-gray-100 opacity-40 grayscale"
                    }`}
                  >
                    <span className="text-2xl">{badge.icon}</span>
                    <span className="text-xs text-gray-600 leading-tight">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {gamification.categoryProgress.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Fortschritt nach Kategorie</h2>
              <div className="space-y-2">
                {gamification.categoryProgress.map(({ category, total, sampled, pct }) => (
                  <div key={category} className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 w-32 flex-shrink-0 truncate" title={category}>{category}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct > 0 ? "bg-blue-400" : "bg-gray-200"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                      {sampled}/{total} ({pct}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/import" className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl">↑</div>
          <div>
            <div className="font-medium text-blue-900">CSV importieren</div>
            <div className="text-xs text-blue-600">Produkte hochladen</div>
          </div>
        </Link>
        <Link href="/sampling/session" className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4 hover:bg-green-100 transition-colors">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white text-xl">⚖</div>
          <div>
            <div className="font-medium text-green-900">Wiegesession</div>
            <div className="text-xs text-green-600">{data.productsWithoutSampling} Produkte ohne Messung</div>
          </div>
        </Link>
        <Link href="/products" className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
          <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-white text-xl">☰</div>
          <div>
            <div className="font-medium text-gray-900">Produkte anzeigen</div>
            <div className="text-xs text-gray-500">Liste durchsuchen</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
