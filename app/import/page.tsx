"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface ImportRow {
  row: number;
  sku: string | null;
  status: "success" | "updated" | "error" | "warning";
  errors: string[];
  warnings: string[];
  data: Record<string, unknown>;
}

interface ImportResult {
  batchId: string | null;
  dryRun: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: ImportRow[];
}

const STATUS_LABEL: Record<ImportRow["status"], string> = {
  success: "Neu",
  updated: "Aktualisiert",
  warning: "Warnung",
  error: "Fehler",
};

const STATUS_COLOR: Record<ImportRow["status"], string> = {
  success: "text-green-700 bg-green-50",
  updated: "text-blue-700 bg-blue-50",
  warning: "text-yellow-700 bg-yellow-50",
  error: "text-red-700 bg-red-50",
};

const SAMPLE_CSV = `SKU;Produktname;Hersteller;Marke;Kategorie;Unterkategorie;EK-Preis;Netto-Gewicht;Brutto-Gewicht;Netto-Länge;Netto-Breite;Netto-Höhe;Brutto-Länge;Brutto-Breite;Brutto-Höhe
WD-HDD-001;WD Blue 1TB HDD;Western Digital;WD;Festplatte;2.5 Zoll;38.90;400;520;146;101;20;165;118;32
SAM-SSD-002;Samsung 870 EVO 500GB;Samsung;Samsung;Festplatte;SSD 2.5;55.00;58;90;100;70;7;120;88;15
LG-MON-003;LG 27UK850 Monitor;LG;LG;Monitor;27 Zoll;320.00;5400;6200;625;368;56;680;400;120
LOG-MOU-004;Logitech MX Master 3;Logitech;Logitech;Zubehör;Maus;65.00;141;182;128;85;44;152;102;65
TPL-CAB-005;TP-Link CAT6 Patchkabel;TP-Link;TP-Link;Zubehör;Kabel;3.50;45;80;200;10;5;210;120;30`;

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
    if (!batchName) {
      setBatchName(f.name.replace(/\.[^/.]+$/, ""));
    }
    setResult(null);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.type === "text/csv")) {
      handleFile(f);
    }
  }

  async function runImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("batchName", batchName || file.name);
      formData.append("dryRun", dryRun ? "true" : "false");

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beispiel_import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CSV-Import</h1>
          <p className="text-sm text-gray-500 mt-1">
            Produkte aus einer CSV-Datei importieren
          </p>
        </div>
        <button
          onClick={downloadSample}
          className="text-sm text-blue-600 hover:underline"
        >
          Beispiel-CSV herunterladen
        </button>
      </div>

      {/* Upload area */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : file
                ? "border-green-400 bg-green-50"
                : "border-gray-300 hover:border-gray-400"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: "pointer" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {file ? (
            <div className="text-green-700">
              <div className="text-2xl mb-1">✓</div>
              <div className="font-medium">{file.name}</div>
              <div className="text-sm text-green-600">
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
          ) : (
            <div className="text-gray-400">
              <div className="text-3xl mb-2">📄</div>
              <div className="font-medium text-gray-600">
                CSV-Datei hier ablegen
              </div>
              <div className="text-sm mt-1">
                oder klicken zum Auswählen (.csv)
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Import-Batch-Name
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              placeholder="z. B. Lieferung 2026-03"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium text-gray-700">
                  Vorschau (Dry-Run)
                </div>
                <div className="text-xs text-gray-500">
                  Keine Daten werden gespeichert
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Field mapping info */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          <strong className="text-gray-700">Unterstützte Spalten:</strong>{" "}
          SKU / Art.-Nr., Produktname / Bezeichnung, Hersteller, Marke /
          Brand, Kategorie, Unterkategorie, EK-Preis / EK Preis, Netto-Gewicht
          (g), Brutto-Gewicht (g), Netto/Brutto L/B/H (mm).
          Trennzeichen: Komma oder Semikolon.
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runImport}
            disabled={!file || loading}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading
              ? "Importiert…"
              : dryRun
                ? "Vorschau starten"
                : "Jetzt importieren"}
          </button>
          {file && (
            <button
              onClick={() => {
                setFile(null);
                setResult(null);
                setBatchName("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Datei entfernen
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>Fehler:</strong> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div
            className={`rounded-lg p-5 border ${
              result.dryRun
                ? "bg-yellow-50 border-yellow-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {result.dryRun
                    ? "Vorschau-Ergebnis (Dry-Run)"
                    : "Import abgeschlossen"}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {result.totalRows} Zeilen verarbeitet
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {result.successCount}
                  </div>
                  <div className="text-xs text-gray-500">Erfolgreich</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {result.errorCount}
                  </div>
                  <div className="text-xs text-gray-500">Fehler</div>
                </div>
              </div>
            </div>
            {result.dryRun && result.errorCount === 0 && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  Alles sieht gut aus.
                </span>
                <button
                  onClick={() => {
                    setDryRun(false);
                    setTimeout(runImport, 100);
                  }}
                  className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700"
                >
                  Jetzt wirklich importieren
                </button>
              </div>
            )}
            {!result.dryRun && result.batchId && (
              <div className="mt-3">
                <Link
                  href="/products"
                  className="text-sm text-blue-600 hover:underline"
                >
                  → Zu den importierten Produkten
                </Link>
              </div>
            )}
          </div>

          {/* Row details */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
              Zeilen-Detail
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-12">
                      #
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      SKU
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      Produktname
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">
                      Meldungen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.results.map((row) => (
                    <tr key={row.row} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-400">
                        {row.row}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {row.sku ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {(row.data.productName as string) ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[row.status]}`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.map((e, i) => (
                          <div key={i} className="text-red-600">
                            ✗ {e}
                          </div>
                        ))}
                        {row.warnings.map((w, i) => (
                          <div key={i} className="text-yellow-600">
                            ⚠ {w}
                          </div>
                        ))}
                        {row.errors.length === 0 &&
                          row.warnings.length === 0 && (
                            <span className="text-green-600">✓ OK</span>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-3">
          Hinweise zum CSV-Format
        </h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <strong>Pflichtfelder:</strong> SKU, Produktname — alle anderen
            Felder sind optional, werden aber empfohlen.
          </p>
          <p>
            <strong>Gewichte:</strong> Bitte in Gramm (g) angeben. Dezimalwerte
            mit Komma oder Punkt.
          </p>
          <p>
            <strong>Maße:</strong> Bitte in Millimeter (mm) angeben.
          </p>
          <p>
            <strong>EK-Preis:</strong> In Euro, z. B. 29.90 oder 29,90.
          </p>
          <p>
            <strong>Trennzeichen:</strong> Komma (,) oder Semikolon (;) werden
            automatisch erkannt.
          </p>
          <p>
            <strong>Encoding:</strong> UTF-8 oder UTF-8 mit BOM wird empfohlen.
          </p>
          <p>
            <strong>Upsert:</strong> Bestehende Produkte werden anhand der SKU
            aktualisiert.
          </p>
        </div>
      </div>
    </div>
  );
}
