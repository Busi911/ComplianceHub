"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface MigrateAnalysis {
  skuOnlyCount: number;
  duplicateExactCount: number;
  preview: Array<{ id: string; sku: string; internalArticleNumber: string | null; productName: string }>;
}

export default function DatepflegePage() {
  const [analysis, setAnalysis] = useState<MigrateAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ ok: boolean; affected: number } | null>(null);
  const [action, setAction] = useState<"copy_to_internal" | "copy_and_clear" | "clear_duplicate">("copy_to_internal");

  useEffect(() => {
    fetch("/api/tools/migrate-sku")
      .then((r) => r.json())
      .then((d) => setAnalysis(d))
      .finally(() => setLoadingAnalysis(false));
  }, []);

  async function runMigration() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await fetch("/api/tools/migrate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setMigrateResult(data);
      // Refresh analysis
      const updated = await fetch("/api/tools/migrate-sku").then((r) => r.json());
      setAnalysis(updated);
    } finally {
      setMigrating(false);
    }
  }

  const noIssues =
    analysis &&
    analysis.skuOnlyCount === 0 &&
    analysis.duplicateExactCount === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/dashboard" className="hover:text-gray-700">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Datenpflege</h1>
        <p className="text-sm text-gray-500 mt-1">
          Werkzeuge zur Bereinigung und Korrektur von Produktdaten
        </p>
      </div>

      {/* ── SKU-Bereinigung ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <span className="text-lg">🏷</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">SKU-Bereinigung</div>
            <div className="text-xs text-gray-500">
              Wenn die SKU mit internen Artikelnummern befüllt wurde statt mit EAN / Hersteller-Art.-Nr.
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 space-y-1">
            <p>
              <strong>Hintergrund:</strong> Das Feld <em>SKU</em> sollte die herstellerseitige oder
              handelsweit eindeutige Nummer enthalten (EAN, Hersteller-Art.-Nr.) — damit Verpackungsdaten
              später mit anderen Unternehmen verglichen werden können.
            </p>
            <p>
              Das Feld <em>Interne Artikelnummer</em> ist für eure eigene interne Nummer gedacht.
            </p>
            <p>
              Wenn ihr beim Import beide Felder mit derselben internen Nummer gefüllt habt,
              kann dieses Werkzeug die Werte in das richtige Feld übertragen.
            </p>
          </div>

          {/* Analysis */}
          {loadingAnalysis ? (
            <div className="text-sm text-gray-400">Analysiert…</div>
          ) : analysis && (
            <>
              {noIssues ? (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                  ✓ Keine Probleme gefunden — SKU- und interne Nummern sehen korrekt aus.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={`rounded-lg border px-4 py-3 ${analysis.skuOnlyCount > 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                    <div className="text-2xl font-bold text-gray-900">{analysis.skuOnlyCount}</div>
                    <div className="text-sm text-gray-700 mt-0.5">
                      Produkte mit SKU, aber <em>ohne</em> interne Artikelnummer
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Wahrscheinlich interne Nummern im SKU-Feld
                    </div>
                  </div>
                  <div className={`rounded-lg border px-4 py-3 ${analysis.duplicateExactCount > 0 ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
                    <div className="text-2xl font-bold text-gray-900">{analysis.duplicateExactCount}</div>
                    <div className="text-sm text-gray-700 mt-0.5">
                      Produkte wo SKU = Interne Artikelnummer (exakt gleich)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Klarer Duplikat-Befund
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {analysis.preview.length > 0 && !noIssues && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1.5">
                    Vorschau (erste {analysis.preview.length}):
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Produkt</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">SKU (aktuell)</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Interne Nr. (aktuell)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {analysis.preview.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate">
                              {p.productName}
                            </td>
                            <td className="px-3 py-2 font-mono text-amber-700">{p.sku}</td>
                            <td className="px-3 py-2 text-gray-400">
                              {p.internalArticleNumber ?? <em>leer</em>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action selector + run */}
              {!noIssues && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div className="text-sm font-medium text-gray-800">Aktion auswählen:</div>

                  <div className="space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="radio"
                        name="action"
                        value="copy_to_internal"
                        checked={action === "copy_to_internal"}
                        onChange={() => setAction("copy_to_internal")}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                          SKU → Interne Artikelnummer kopieren (SKU bleibt erhalten)
                        </div>
                        <div className="text-xs text-gray-500">
                          Betrifft {analysis.skuOnlyCount} Produkte ohne interne Nummer.
                          Ihr könnt danach manuell die echte EAN in das SKU-Feld eintragen.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="radio"
                        name="action"
                        value="clear_duplicate"
                        checked={action === "clear_duplicate"}
                        onChange={() => setAction("clear_duplicate")}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                          SKU leeren wo SKU = Interne Artikelnummer (exakte Duplikate)
                        </div>
                        <div className="text-xs text-gray-500">
                          Betrifft {analysis.duplicateExactCount} Produkte.
                          Das SKU-Feld wird auf einen Platzhalter gesetzt, die interne Nummer bleibt.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="radio"
                        name="action"
                        value="copy_and_clear"
                        checked={action === "copy_and_clear"}
                        onChange={() => setAction("copy_and_clear")}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-blue-700">
                          SKU → Interne Artikelnummer kopieren und SKU leeren
                        </div>
                        <div className="text-xs text-gray-500">
                          Betrifft {analysis.skuOnlyCount} Produkte ohne interne Nummer.
                          Das SKU-Feld wird danach freigemacht für die echte Lieferanten-Nummer.
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={runMigration}
                      disabled={migrating}
                      className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                    >
                      {migrating ? "Wird ausgeführt…" : "Ausführen"}
                    </button>
                    <span className="text-xs text-gray-400">
                      Diese Aktion kann nicht automatisch rückgängig gemacht werden.
                    </span>
                  </div>

                  {migrateResult && (
                    <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
                      migrateResult.ok
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-red-50 border border-red-200 text-red-800"
                    }`}>
                      {migrateResult.ok
                        ? `✓ Fertig — ${migrateResult.affected} Produkt${migrateResult.affected !== 1 ? "e" : ""} aktualisiert.`
                        : "Fehler bei der Ausführung."}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* More tools placeholder */}
      <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-400 text-sm">
        Weitere Datenpflege-Werkzeuge folgen hier.
      </div>
    </div>
  );
}
