"use client";

import { useEffect, useState } from "react";
import type { CategoryCorrelation } from "@/app/api/stats/correlations/route";

function rColor(r: number | null): string {
  if (r === null) return "text-gray-300";
  const a = Math.abs(r);
  if (a >= 0.7) return "text-green-700 font-bold";
  if (a >= 0.5) return "text-yellow-700 font-semibold";
  if (a >= 0.3) return "text-orange-600";
  return "text-red-400";
}

function rLabel(r: number | null): string {
  if (r === null) return "—";
  const a = Math.abs(r);
  const sign = r >= 0 ? "+" : "−";
  const str = `${sign}${a.toFixed(2)}`;
  if (a >= 0.7) return `${str} ●`;
  if (a >= 0.5) return `${str} ◐`;
  return str;
}

function CorrCell({ r }: { r: number | null }) {
  return (
    <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${rColor(r)}`}>
      {rLabel(r)}
    </td>
  );
}

export default function EstimationRulesPage() {
  const [stats, setStats] = useState<{ categories: CategoryCorrelation[]; computedAt: string } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [corrTab, setCorrTab] = useState<"plastic" | "paper">("plastic");

  useEffect(() => {
    fetch("/api/stats/correlations")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setStats(d); })
      .finally(() => setStatsLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schätzlogik & Regeln</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Wie das System Verpackungsgewichte schätzt — inkl. Live-Statistiken
        </p>
      </div>

      {/* Priority overview */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Priorität der Schätzmethoden</h2>
        <p className="text-sm text-gray-600 mb-4">
          Das System wählt immer die <strong>beste verfügbare Methode</strong> — von der genauesten zur ungenauesten:
        </p>
        <ol className="space-y-4">
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</div>
            <div>
              <div className="font-medium text-gray-900">Eigene Stichproben <span className="ml-2 px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">own_sampling_avg_nX</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Echte Wiegungen dieses Produkts — Durchschnitt aller <strong>nicht-markierten</strong> Messungen (Ausreißer werden automatisch erkannt und ausgeschlossen).
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = min(0.50 + n × 0.15, 0.95)</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold text-sm">2</div>
            <div>
              <div className="font-medium text-gray-900">Ähnliche Produkte <span className="ml-2 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">similar_products_nX</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Produkte mit gleicher Kategorie, Marke, Gewicht oder Preis. Ausreißer-Messungen der Referenzprodukte werden ebenfalls ausgeschlossen.
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = 0.20 + (Punkte / 20) × 0.58</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">3</div>
            <div>
              <div className="font-medium text-gray-900">
                Lineare Regression{" "}
                <span className="ml-2 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">regression_gross_weight_r2=XX_nX</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Wenn Bruttogewicht und Kunststoffgewicht in der Kategorie stark korrelieren (r² ≥ 0,40, n ≥ 5),
                wird eine <strong>lineare Regression</strong> verwendet: <em>Plastik = a + b × Bruttogewicht</em>.
                Besser als der Kategorie-Durchschnitt, weil die Schätzung an das konkrete Produktgewicht angepasst wird.
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = 0.20 + r² × 0.50 (max. 0.70)</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-400 text-white rounded-full flex items-center justify-center font-bold text-sm">4</div>
            <div>
              <div className="font-medium text-gray-900">Kategorie-Durchschnitt <span className="ml-2 px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">category_avg_nX</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Fallback: Durchschnitt aller gemessenen Produkte in der Kategorie (ohne Ausreißer). Ungenaueste Methode.
              </p>
              <div className="mt-1 text-xs text-gray-400 font-mono">Konfidenz = 0.20 (fest)</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-gray-400 text-white rounded-full flex items-center justify-center font-bold text-sm">–</div>
            <div>
              <div className="font-medium text-gray-900">Kein Ergebnis <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">Status: IMPORTED</span></div>
              <p className="text-sm text-gray-600 mt-1">
                Wenn in der Kategorie noch gar keine Messwerte vorhanden sind, bleibt der Status auf <em>Importiert</em>.
              </p>
            </div>
          </li>
        </ol>
      </div>

      {/* Outlier detection explanation */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Automatische Ausreißer-Erkennung</h2>
        <p className="text-sm text-gray-600 mb-4">
          Nach jeder neuen Wiegung werden <strong>alle eigenen Messungen</strong> des Produkts statistisch neu bewertet.
          Ausreißer werden markiert und aus der Durchschnittsberechnung ausgeschlossen — sie bleiben aber sichtbar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-medium text-blue-900 text-sm mb-1">IQR-Methode (Tukey-Fences) — primär</div>
            <p className="text-xs text-blue-700">
              Berechnet Q1 (25%-Quantil) und Q3 (75%-Quantil). Werte außerhalb von
              <strong> [Q1 − 1,5×IQR, Q3 + 1,5×IQR]</strong> werden als Ausreißer markiert.
              Robuster als der Z-Score — funktioniert auch bei schiefen Verteilungen.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="font-medium text-purple-900 text-sm mb-1">Z-Score — sekundär</div>
            <p className="text-xs text-purple-700">
              Berechnet wie viele Standardabweichungen ein Wert vom Mittelwert abweicht.
              Bei <strong>|z| &gt; 2,5</strong> wird der Wert zusätzlich markiert.
              Greift erst ab 3 eigenen Messungen.
            </p>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-400">
          Mindestens 3 Messungen erforderlich — bei weniger Werten werden keine Ausreißer markiert.
        </div>
      </div>

      {/* Live correlation statistics */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Live-Korrelationsanalyse</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Pearson-r zwischen Produktmerkmalen und Verpackungsgewichten — automatisch aus Messdaten berechnet
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {stats?.computedAt && (
              <span className="text-xs text-gray-400">
                Stand: {new Date(stats.computedAt).toLocaleTimeString("de-DE")}
              </span>
            )}
            <div className="flex rounded border border-gray-300 overflow-hidden text-xs">
              <button
                onClick={() => setCorrTab("plastic")}
                className={`px-3 py-1.5 transition-colors ${corrTab === "plastic" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Kunststoff
              </button>
              <button
                onClick={() => setCorrTab("paper")}
                className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${corrTab === "paper" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Papier / Pappe
              </button>
            </div>
          </div>
        </div>

        {statsLoading && (
          <div className="space-y-2 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        )}

        {!statsLoading && (!stats || stats.categories.length === 0) && (
          <p className="text-sm text-gray-400 py-4 text-center">
            Noch keine Messdaten für Korrelationsanalyse vorhanden.
            Mindestens 3 gewogene Produkte pro Kategorie erforderlich.
          </p>
        )}

        {!statsLoading && stats && stats.categories.length > 0 && (
          <>
            <div className="flex flex-wrap gap-4 text-xs mb-4 p-3 bg-gray-50 rounded-lg">
              <span className="text-green-700 font-bold">● stark (|r| ≥ 0,70)</span>
              <span className="text-yellow-700 font-semibold">◐ mittel (|r| ≥ 0,50)</span>
              <span className="text-orange-600">schwach (|r| ≥ 0,30)</span>
              <span className="text-red-400">sehr schwach</span>
              <span className="text-gray-300">— zu wenig Daten</span>
            </div>

            {corrTab === "plastic" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left border-b border-gray-200">
                      <th className="px-3 py-2 font-medium text-gray-600">Kategorie</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">n</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Bruttogew.→Plastik</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right hidden md:table-cell">Nettogew.→Plastik</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right hidden md:table-cell">EK-Preis→Plastik</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right hidden lg:table-cell">Volumen→Plastik</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-center">Regression</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right hidden md:table-cell" title="Variationskoeffizient">CV%</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Ausreißer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.categories.map((cat) => (
                      <tr key={cat.category} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800 text-sm">{cat.category}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">{cat.n}</td>
                        <CorrCell r={cat.correlations.grossWeightVsPlastic} />
                        <CorrCell r={cat.correlations.netWeightVsPlastic} />
                        <CorrCell r={cat.correlations.ekPriceVsPlastic} />
                        <CorrCell r={cat.correlations.volumeVsPlastic} />
                        <td className="px-3 py-2 text-center">
                          {cat.regressionPlastic ? (
                            cat.regressionPlastic.usable ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 font-medium">
                                aktiv · r²={cat.regressionPlastic.r2}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">r²={cat.regressionPlastic.r2}</span>
                            )
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-xs hidden md:table-cell">
                          {cat.cvPlastic !== null ? (
                            <span className={cat.cvPlastic > 50 ? "text-red-600 font-medium" : cat.cvPlastic > 25 ? "text-yellow-600" : "text-green-600"}>
                              {cat.cvPlastic}%
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {cat.outlierCount > 0 ? <span className="text-orange-600 font-medium">{cat.outlierCount}</span> : <span className="text-gray-300">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {corrTab === "paper" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left border-b border-gray-200">
                      <th className="px-3 py-2 font-medium text-gray-600">Kategorie</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">n</th>
                      <th className="px-3 py-2 font-medium text-green-700 text-right">Bruttogew.→Papier</th>
                      <th className="px-3 py-2 font-medium text-green-700 text-right hidden md:table-cell">Nettogew.→Papier</th>
                      <th className="px-3 py-2 font-medium text-green-700 text-right hidden md:table-cell">EK-Preis→Papier</th>
                      <th className="px-3 py-2 font-medium text-green-700 text-right hidden lg:table-cell">Volumen→Papier</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-center">Regression</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right hidden md:table-cell" title="Variationskoeffizient">CV%</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right">Ausreißer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.categories.map((cat) => (
                      <tr key={cat.category} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800 text-sm">{cat.category}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">{cat.n}</td>
                        <CorrCell r={cat.correlations.grossWeightVsPaper} />
                        <CorrCell r={cat.correlations.netWeightVsPaper} />
                        <CorrCell r={cat.correlations.ekPriceVsPaper} />
                        <CorrCell r={cat.correlations.volumeVsPaper} />
                        <td className="px-3 py-2 text-center">
                          {cat.regressionPaper ? (
                            cat.regressionPaper.usable ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-800 font-medium">
                                aktiv · r²={cat.regressionPaper.r2}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">r²={cat.regressionPaper.r2}</span>
                            )
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-xs hidden md:table-cell">
                          {cat.cvPaper !== null ? (
                            <span className={cat.cvPaper > 50 ? "text-red-600 font-medium" : cat.cvPaper > 25 ? "text-yellow-600" : "text-green-600"}>
                              {cat.cvPaper}%
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {cat.outlierCount > 0 ? <span className="text-orange-600 font-medium">{cat.outlierCount}</span> : <span className="text-gray-300">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
              <div><strong className="text-gray-700">Regression aktiv:</strong> Wird für Schätzungen genutzt wenn r² ≥ 0,40 und n ≥ 5.</div>
              <div><strong className="text-gray-700">CV (Variationskoeffizient):</strong> Relative Streuung der Werte. &gt;50% = heterogene Kategorie, Schätzungen unzuverlässiger.</div>
              <div><strong className="text-gray-700">Ausreißer:</strong> Statistisch auffällige Messungen (IQR + Z-Score). Werden aus allen Berechnungen ausgeschlossen.</div>
            </div>
          </>
        )}
      </div>

      {/* Similarity criteria */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Ähnlichkeitsberechnung im Detail</h2>
        <p className="text-sm text-gray-600 mb-4">
          Für die Methode „Ähnliche Produkte" wird jedes Kandidaten-Produkt nach folgenden Kriterien bewertet.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 font-medium text-gray-600">Kriterium</th>
                <th className="px-4 py-2 font-medium text-gray-600">Bedingung</th>
                <th className="px-4 py-2 font-medium text-gray-600 text-center">Punkte</th>
                <th className="px-4 py-2 font-medium text-gray-600">Begründung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {([
                ["Unterkategorie", "Exakt gleich (z. B. SSD 2.5)", "3", "Gleicher Produkttyp, sehr ähnliche Verpackung"],
                ["Kategorie", "Exakt gleich (z. B. Festplatte)", "2", "Gleiche Produktklasse"],
                ["Marke", "Exakt gleich", "2", "Gleiche Marke, oft gleiche Verpackungsstrategie"],
                ["Hersteller", "Exakt gleich", "1", "Ähnliche Produktion"],
                ["EK-Preis", "Abweichung unter 10%", "2", "Ähnlicher Preis, ähnliches Produkt"],
                ["EK-Preis", "Abweichung unter 30%", "1", ""],
                ["Bruttogewicht", "Abweichung unter 10%", "2", "Ähnliches Gewicht, ähnliche Verpackungsmenge"],
                ["Bruttogewicht", "Abweichung unter 25%", "1", ""],
                ["Bruttovolumen (L×B×H)", "Abweichung unter 10%", "3", "Ähnliches Volumen, ähnliche Verpackungsfläche"],
                ["Bruttovolumen", "Abweichung unter 25%", "2", ""],
                ["Bruttovolumen", "Abweichung unter 50%", "1", ""],
                ["Verpackungsquotient", "(Brutto−Netto)/Volumen: Abw. unter 15%", "2", "Gleiche Verpackungsdichte ist starkes Signal"],
                ["Verpackungsquotient", "Abweichung unter 35%", "1", ""],
              ] as [string, string, string, string][]).map(([criterion, condition, points, reason], i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{criterion}</td>
                  <td className="px-4 py-2 text-gray-600">{condition}</td>
                  <td className="px-4 py-2 text-center font-mono font-bold text-blue-700">+{points}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-700">
          <strong>Max. 20 Punkte möglich.</strong> Konfidenz = <code>0.20 + (Punkte / 20) × 0.58</code>
        </div>
      </div>

      {/* Status explanation */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Status-Bedeutung</h2>
        <div className="space-y-3">
          {[
            { label: "Importiert", color: "bg-gray-100 text-gray-700", desc: "Produkt wurde importiert. Noch keine Schätzung vorhanden." },
            { label: "Geschätzt", color: "bg-yellow-100 text-yellow-800", desc: "Das System hat automatisch aus ähnlichen Produkten, Regression oder dem Kategorie-Durchschnitt geschätzt. Kein Mensch war beteiligt." },
            { label: "Gemessen", color: "bg-green-100 text-green-800", desc: "Mindestens eine echte Wiegung vorhanden. Wert = Durchschnitt aller nicht-markierten Stichproben." },
            { label: "Geprüft", color: "bg-blue-100 text-blue-800", desc: "Die Werte wurden manuell geprüft und bestätigt. Höchste Verlässlichkeit." },
          ].map((s) => (
            <div key={s.label} className="flex items-start gap-3">
              <span className={`px-2 py-1 rounded border text-xs font-medium flex-shrink-0 ${s.color}`}>{s.label}</span>
              <p className="text-sm text-gray-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Wie wird das System besser?</h2>
        <div className="space-y-3 text-sm text-gray-600">
          {[
            ["1.", "Mehr Stichproben.", "Jede neue Wiegung verbessert direkt das Produkt und per Kaskade alle ähnlichen in der Kategorie."],
            ["2.", "Bruttogewicht erfassen.", "Wenn Bruttogewicht und Plastik stark korrelieren (r² ≥ 0,40), aktiviert sich automatisch die Regressions-Schätzung."],
            ["3.", "Vollständige Stammdaten.", "Produkte mit Maßen, Gewicht und Preis werden präziser gematcht."],
            ["4.", "Unterkategorien pflegen.", '"SSD 2.5" findet viel bessere Matches als nur "Festplatte".'],
          ].map(([num, strong, text]) => (
            <div key={num as string} className="flex gap-3">
              <span className="text-green-600 font-bold flex-shrink-0">{num}</span>
              <p><strong>{strong}</strong> {text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
