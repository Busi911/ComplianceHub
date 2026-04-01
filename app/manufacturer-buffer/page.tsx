"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface BufferItem {
  id: string;
  ean: string | null;
  internalArticleNr: string | null;
  manufacturerName: string | null;
  productName: string | null;
  mfrNetWeightG: number | null;
  mfrGrossWeightG: number | null;
  mfrPlasticG: number | null;
  mfrPaperG: number | null;
  sourceFileName: string | null;
  matchedProductId: string | null;
  matchedAt: string | null;
  createdAt: string;
  matchedProduct: { id: string; productName: string; ean: string } | null;
}

interface BufferStats {
  total: number;
  unmatchedCount: number;
  matchedCount: number;
  page: number;
  pageSize: number;
  items: BufferItem[];
}

interface Session {
  sourceFileName: string;
  total: number;
  matched: number;
  unmatched: number;
  firstAt: string;
  lastAt: string;
}

export default function ManufacturerBufferPage() {
  const [stats, setStats] = useState<BufferStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unmatched" | "matched">("all");
  const [eanSearch, setEanSearch] = useState("");
  const [page, setPage] = useState(1);

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resettingSession, setResettingSession] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ sourceFileName: string; deleted: number; productsReset: number } | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    total: number; created: number; updated: number; autoMatched: number; skipped: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [manufacturerName, setManufacturerName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Match state
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<{ matched: number; remaining: number } | null>(null);

  function fetchData() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (filter === "unmatched") params.set("matched", "false");
    if (filter === "matched") params.set("matched", "true");
    if (eanSearch.trim()) params.set("ean", eanSearch.trim());

    Promise.all([
      fetch(`/api/manufacturer-buffer?${params}`).then((r) => r.json()),
      fetch("/api/manufacturer-buffer/sessions").then((r) => r.json()),
    ]).then(([bufferData, sessionData]) => {
      setStats(bufferData);
      if (sessionData.sessions) setSessions(sessionData.sessions);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [filter, page, eanSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResetSession(sourceFileName: string) {
    if (!confirm(`Session „${sourceFileName}" wirklich zurücksetzen?\n\nDas löscht alle Puffer-Einträge dieser Session und entfernt die Hersteller-Daten von den gematchten Produkten. Die Produkte werden danach neu geschätzt.`)) return;
    setResettingSession(sourceFileName);
    setResetResult(null);
    try {
      const res = await fetch("/api/manufacturer-buffer/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      setResetResult({ sourceFileName, ...data });
      fetchData();
    } catch (e) {
      alert(`Fehler: ${e instanceof Error ? e.message : "Unbekannt"}`);
    } finally {
      setResettingSession(null);
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    setUploadError(null);

    const fd = new FormData();
    fd.append("file", file);
    if (manufacturerName.trim()) fd.append("manufacturerName", manufacturerName.trim());

    try {
      const res = await fetch("/api/manufacturer-buffer", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload fehlgeschlagen");
      } else {
        setUploadResult(data);
        if (fileRef.current) fileRef.current.value = "";
        setManufacturerName("");
        fetchData();
      }
    } catch {
      setUploadError("Netzwerkfehler beim Upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleMatch() {
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await fetch("/api/manufacturer-buffer/match", { method: "POST" });
      const data = await res.json();
      setMatchResult(data);
      fetchData();
    } finally {
      setMatching(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/manufacturer-buffer/${id}`, { method: "DELETE" });
    fetchData();
  }

  function downloadTemplate() {
    const bom = "\uFEFF";
    const header = "EAN;Interne Art-Nr;Hersteller;Produktname;Netto-Gewicht;Brutto-Gewicht;Kunststoff;Papier";
    const example1 = "4012345678901;;Muster GmbH;Beispiel-Artikel 500ml;320;450;15.5;8";
    const example2 = ";ART-00123;Muster GmbH;Nur-Interne-Nr Artikel;210;300;10;5";
    const csv = bom + [header, example1, example2].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hersteller_vorlage.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = stats ? Math.ceil(stats.total / stats.pageSize) : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hersteller-Datenpuffer</h1>
        <p className="text-sm text-gray-500 mt-1">
          Hersteller laden ihre Artikeldaten (EAN + Verpackungsgewichte) vorab hoch.
          Sobald ein Artikel mit passender EAN ins Sortiment importiert wird, werden die Herstellerdaten automatisch übernommen.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1">Einträge gesamt</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-amber-700">{stats.unmatchedCount}</div>
            <div className="text-xs text-amber-600 mt-1">Noch nicht gematcht</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{stats.matchedCount}</div>
            <div className="text-xs text-green-600 mt-1">Erfolgreich zugeordnet</div>
          </div>
        </div>
      )}

      {/* Sessions */}
      {sessions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-gray-800">Upload-Sessions</h2>
          {resetResult && (
            <div className="text-sm bg-green-50 border border-green-200 rounded px-3 py-2 text-green-800">
              ✓ Session „{resetResult.sourceFileName}" zurückgesetzt — {resetResult.deleted} Einträge gelöscht,
              {" "}{resetResult.productsReset} Produkte werden neu geschätzt.
            </div>
          )}
          <div className="divide-y divide-gray-100">
            {sessions.map((session) => (
              <div key={session.sourceFileName} className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{session.sourceFileName}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(session.lastAt).toLocaleDateString("de-DE", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                    {" · "}
                    {session.total} Einträge
                    {session.matched > 0 && <span className="text-green-600"> · {session.matched} gematcht</span>}
                    {session.unmatched > 0 && <span className="text-amber-600"> · {session.unmatched} offen</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleResetSession(session.sourceFileName)}
                  disabled={resettingSession === session.sourceFileName}
                  className="flex-shrink-0 text-sm border border-red-200 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {resettingSession === session.sourceFileName ? "Wird zurückgesetzt…" : "↺ Zurücksetzen"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">Hersteller-CSV hochladen</h2>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2 text-sm text-gray-500">
            <p>
              Pflichtfeld: <code className="bg-gray-100 px-1 rounded">EAN</code> <strong>oder</strong>{" "}
              <code className="bg-gray-100 px-1 rounded">Interne Art-Nr</code> — mindestens eines muss gefüllt sein.
              EAN wird bevorzugt; ist keine EAN vorhanden, wird die interne Artikelnummer zum Matchen verwendet.
              Alle anderen Felder sind optional — leere Zellen werden ignoriert.
            </p>
            <p>
              Mögliche Spalten:{" "}
              <code className="bg-gray-100 px-1 rounded">EAN</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Interne Art-Nr</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Hersteller</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Produktname</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Netto-Gewicht</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Brutto-Gewicht</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Kunststoff</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">Papier</code> — alle Gewichte in Gramm.
              Semikolon oder Komma als Trennzeichen, UTF-8 oder Windows-1252.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex-shrink-0 text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50 whitespace-nowrap"
          >
            ↓ Vorlage-CSV herunterladen
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Herstellername (optional — überschreibt CSV-Spalte)
              </label>
              <input
                type="text"
                value={manufacturerName}
                onChange={(e) => setManufacturerName(e.target.value)}
                placeholder="z.B. Muster GmbH"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                CSV-Datei *
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.tsv"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? "Wird hochgeladen…" : "Hochladen & abgleichen"}
            </button>
          </div>
        </form>

        {uploadError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {uploadError}
          </div>
        )}
        {uploadResult && (
          <div className="text-sm bg-green-50 border border-green-200 rounded px-3 py-2 text-green-800">
            Upload erfolgreich: {uploadResult.total} Zeilen verarbeitet —
            {uploadResult.autoMatched > 0 && <> <strong>{uploadResult.autoMatched} sofort gematcht</strong>,</>}
            {" "}{uploadResult.created} neu angelegt,
            {" "}{uploadResult.updated} aktualisiert
            {uploadResult.skipped > 0 && <>, {uploadResult.skipped} ohne EAN/Art-Nr übersprungen</>}.
          </div>
        )}
      </div>

      {/* Manual match trigger */}
      {stats && stats.unmatchedCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <span className="text-sm text-amber-800 flex-1">
            <strong>{stats.unmatchedCount}</strong> Puffer-Einträge warten noch auf einen passenden Artikel.
            Abgleich läuft automatisch beim nächsten Import — oder hier manuell anstoßen:
          </span>
          <button
            onClick={handleMatch}
            disabled={matching}
            className="text-sm bg-amber-500 text-white px-3 py-1.5 rounded hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap"
          >
            {matching ? "Gleiche ab…" : "Jetzt abgleichen"}
          </button>
          {matchResult && (
            <span className="text-sm text-amber-700 whitespace-nowrap">
              {matchResult.matched > 0
                ? `✓ ${matchResult.matched} neu gematcht`
                : `Keine neuen Treffer (${matchResult.remaining} noch offen)`}
            </span>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {(["all", "unmatched", "matched"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 transition-colors border-r border-gray-300 last:border-0 ${
                filter === f ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "all" ? "Alle" : f === "unmatched" ? "Nicht gematcht" : "Gematcht"}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={eanSearch}
          onChange={(e) => { setEanSearch(e.target.value); setPage(1); }}
          placeholder="EAN suchen …"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 w-44"
        />
        <span className="text-sm text-gray-400">
          {loading ? "Lädt…" : `${stats?.total ?? 0} Einträge`}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 font-medium text-gray-600">EAN / Art-Nr</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Hersteller / Produkt</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Netto (g)</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Brutto (g)</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Kunststoff (g)</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Papier (g)</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Status</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Quelle</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && [...Array(8)].map((_, i) => (
              <tr key={i}>
                {[...Array(9)].map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && stats?.items.map((item) => (
              <tr key={item.id} className={item.matchedProductId ? "bg-green-50/40" : ""}>
                <td className="px-4 py-3 font-mono text-xs">
                  {item.ean
                    ? <span className="text-blue-600">{item.ean}</span>
                    : item.internalArticleNr
                      ? <span className="text-gray-500" title="Interne Artikelnummer">#{item.internalArticleNr}</span>
                      : <span className="text-gray-300">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 text-xs">{item.manufacturerName ?? <span className="text-gray-400">—</span>}</div>
                  {item.productName && <div className="text-xs text-gray-500">{item.productName}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {item.mfrNetWeightG != null ? item.mfrNetWeightG.toLocaleString("de-DE") : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {item.mfrGrossWeightG != null ? item.mfrGrossWeightG.toLocaleString("de-DE") : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {item.mfrPlasticG != null ? item.mfrPlasticG.toLocaleString("de-DE") : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  {item.mfrPaperG != null ? item.mfrPaperG.toLocaleString("de-DE") : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {item.matchedProduct ? (
                    <div>
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        ✓ Gematcht
                      </span>
                      <div className="mt-0.5">
                        <Link href={`/products/${item.matchedProduct.id}`} className="text-xs text-blue-600 hover:underline">
                          {item.matchedProduct.productName}
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Wartet
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                  {item.sourceFileName ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs text-gray-400 hover:text-red-500 px-1"
                    title="Eintrag löschen"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!loading && stats?.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  Keine Einträge gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            ← Zurück
          </button>
          <span className="text-sm text-gray-600">Seite {page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}
