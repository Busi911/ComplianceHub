"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ModuleStats {
  NOT_APPLICABLE?: number;
  UNKNOWN?: number;
  ESTIMATED?: number;
  DECLARED?: number;
  VERIFIED?: number;
}

interface StatsResponse {
  total: number;
  highCompliance: number;
  modules: {
    battery: ModuleStats;
    weee: ModuleStats;
    levy: ModuleStats;
    reach: ModuleStats;
    rohs: ModuleStats;
    eudr: ModuleStats;
    pop: ModuleStats;
  };
}

const MODULE_META = [
  { key: "battery", label: "BattDG",        href: "/compliance-hub/battery", desc: "Batteriegesetz" },
  { key: "weee",    label: "ElektroG/WEEE",  href: "/compliance-hub/weee",    desc: "Elektrogeräte" },
  { key: "levy",    label: "Abgaben §54",    href: "/compliance-hub/levy",    desc: "UrhG Geräteabgabe" },
  { key: "reach",   label: "REACH",          href: "/compliance-hub/reach",   desc: "SVHC-Stoffe" },
  { key: "rohs",    label: "RoHS",           href: "/compliance-hub/rohs",    desc: "Gefährl. Stoffe Elektronik" },
  { key: "eudr",    label: "EUDR",           href: "/compliance-hub/eudr",    desc: "Entwaldungsverordnung" },
  { key: "pop",     label: "POP",            href: "/compliance-hub/pop",     desc: "Persistente org. Schadstoffe" },
] as const;

function StatusPill({ status, count }: { status: string; count: number }) {
  const colors: Record<string, string> = {
    VERIFIED:       "bg-green-100 text-green-800",
    DECLARED:       "bg-blue-100 text-blue-800",
    ESTIMATED:      "bg-yellow-100 text-yellow-800",
    UNKNOWN:        "bg-gray-100 text-gray-600",
    NOT_APPLICABLE: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {count}×&nbsp;{status.replace("_", " ")}
    </span>
  );
}

export default function ComplianceHubPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/compliance/score")
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm">Lade Compliance-Daten…</p>
      </div>
    );
  }

  const compliantPct =
    stats && stats.total > 0
      ? Math.round((stats.highCompliance / stats.total) * 100)
      : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ComplianceHub</h1>
        <p className="text-sm text-gray-500 mt-1">
          Zentrale Übersicht aller produktrechtlichen Anforderungen
        </p>
      </div>

      {/* Overall score */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Produkte gesamt</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.total ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Score ≥ 80 %</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{stats?.highCompliance ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Compliance-Rate</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{compliantPct}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Aktive Module</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{MODULE_META.length}</p>
        </div>
      </div>

      {/* Module table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Modul</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Statusverteilung</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MODULE_META.map((mod) => {
              const modStats = stats?.modules[mod.key] ?? {};
              return (
                <tr key={mod.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{mod.label}</p>
                    <p className="text-xs text-gray-500">{mod.desc}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(modStats).map(([status, count]) =>
                        count > 0 ? (
                          <StatusPill key={status} status={status} count={count} />
                        ) : null
                      )}
                      {Object.keys(modStats).length === 0 && (
                        <span className="text-xs text-gray-400">Noch keine Daten</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={mod.href}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Öffnen →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
