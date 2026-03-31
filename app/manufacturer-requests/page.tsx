"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ProductRef {
  id: string;
  ean: string;
  productName: string;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  mfrNetWeightG: number | null;
  mfrGrossWeightG: number | null;
  mfrPlasticG: number | null;
  mfrPaperG: number | null;
}

interface RequestItem {
  id: string;
  productId: string;
  notes: string | null;
  product: ProductRef;
}

interface ManufacturerRequest {
  id: string;
  manufacturerName: string;
  contactEmail: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: RequestItem[];
}

interface ProductSearch {
  id: string;
  ean: string;
  productName: string;
  manufacturer: string | null;
  category: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  OFFEN: "Offen",
  GESENDET: "Gesendet",
  BEANTWORTET: "Beantwortet",
  GESCHLOSSEN: "Geschlossen",
};

const STATUS_COLORS: Record<string, string> = {
  OFFEN: "bg-amber-100 text-amber-800 border-amber-300",
  GESENDET: "bg-blue-100 text-blue-800 border-blue-300",
  BEANTWORTET: "bg-green-100 text-green-800 border-green-300",
  GESCHLOSSEN: "bg-gray-100 text-gray-600 border-gray-300",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 border-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function missingCount(p: ProductRef): number {
  return [p.mfrNetWeightG, p.mfrGrossWeightG, p.mfrPlasticG, p.mfrPaperG].filter((v) => v == null).length;
}

export default function ManufacturerRequestsPage() {
  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New request form state
  const [newMfrName, setNewMfrName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearch[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductSearch[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch("/api/manufacturer-requests").then((r) => r.json());
      setRequests(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(searchQuery)}&pageSize=10`).then((r) => r.json());
        setSearchResults((res.products ?? []).map((p: ProductSearch) => p));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function addProduct(p: ProductSearch) {
    if (!selectedProducts.find((s) => s.id === p.id)) {
      setSelectedProducts((prev) => [...prev, p]);
    }
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeProduct(id: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  }

  async function createRequest() {
    if (!newMfrName.trim() || selectedProducts.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/manufacturer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturerName: newMfrName.trim(),
          contactEmail: newEmail.trim() || undefined,
          notes: newNotes.trim() || undefined,
          productIds: selectedProducts.map((p) => p.id),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveError(err.error ?? "Fehler beim Erstellen");
        return;
      }
      // Reset form
      setNewMfrName("");
      setNewEmail("");
      setNewNotes("");
      setSelectedProducts([]);
      setShowNewForm(false);
      await loadRequests();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/manufacturer-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadRequests();
  }

  async function deleteRequest(id: string) {
    if (!confirm("Anfrage wirklich löschen?")) return;
    await fetch(`/api/manufacturer-requests/${id}`, { method: "DELETE" });
    setExpandedId(null);
    await loadRequests();
  }

  function downloadCSV(id: string) {
    window.location.href = `/api/manufacturer-requests/${id}/export`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard" className="hover:text-gray-700">← Dashboard</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Herstelleranfragen</h1>
          <p className="text-sm text-gray-500 mt-1">
            Anfragen an Hersteller für fehlende Verpackungsdaten (Nettogewicht, Bruttogewicht,
            Kunststoff- und Papieranteil)
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Neue Anfrage
        </button>
      </div>

      {/* New request form */}
      {showNewForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Neue Herstelleranfrage erstellen</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Herstellername <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newMfrName}
                onChange={(e) => setNewMfrName(e.target.value)}
                placeholder="z. B. Samsung Electronics"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">E-Mail (optional)</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="kontakt@hersteller.de"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Notizen (optional)</label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              placeholder="Freitext, z. B. Anfrage für LUCID-Registrierung 2026"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </div>

          {/* Product search */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Artikel hinzufügen <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="EAN, Produktname oder Hersteller suchen…"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              {(searchResults.length > 0 || searching) && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {searching && <div className="px-3 py-2 text-xs text-gray-400">Suche…</div>}
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    >
                      <span className="font-mono text-xs text-blue-600 mr-2">{p.ean}</span>
                      <span className="text-gray-800">{p.productName}</span>
                      {p.manufacturer && <span className="text-xs text-gray-400 ml-2">· {p.manufacturer}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected products */}
          {selectedProducts.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                {selectedProducts.length} Artikel ausgewählt
              </div>
              <ul className="divide-y divide-gray-100">
                {selectedProducts.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="font-mono text-xs text-blue-600 w-36 shrink-0">{p.ean}</span>
                    <span className="text-sm text-gray-800 flex-1 truncate">{p.productName}</span>
                    <button
                      type="button"
                      onClick={() => removeProduct(p.id)}
                      className="text-gray-400 hover:text-red-500 text-xs px-1"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {saveError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {saveError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={createRequest}
              disabled={saving || !newMfrName.trim() || selectedProducts.length === 0}
              className="bg-blue-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Wird erstellt…" : "Anfrage erstellen"}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewForm(false); setSaveError(null); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 border rounded"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Lade Anfragen…</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📬</div>
          <div className="text-sm">Noch keine Herstelleranfragen vorhanden.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Row header */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{req.manufacturerName}</span>
                    <StatusBadge status={req.status} />
                    <span className="text-xs text-gray-400">{req.items.length} Artikel</span>
                  </div>
                  {req.contactEmail && (
                    <div className="text-xs text-gray-500 mt-0.5">{req.contactEmail}</div>
                  )}
                  {req.notes && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{req.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadCSV(req.id); }}
                    className="text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50"
                    title="CSV herunterladen"
                  >
                    ↓ CSV
                  </button>
                  <span className="text-xs text-gray-400">
                    {new Date(req.createdAt).toLocaleDateString("de-DE")}
                  </span>
                  <span className="text-gray-400 text-sm">{expandedId === req.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === req.id && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  {/* Status update */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-medium text-gray-600">Status:</span>
                    {Object.keys(STATUS_LABELS).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(req.id, s)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                          req.status === s
                            ? STATUS_COLORS[s]
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  {/* Article table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">EAN</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Produktname</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Kategorie</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600" title="Fehlende Hersteller-Angaben">🏭 Fehlend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {req.items.map((item) => {
                          const mc = missingCount(item.product);
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono text-blue-600">
                                <Link href={`/products/${item.product.id}`} className="hover:underline">
                                  {item.product.ean}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{item.product.productName}</td>
                              <td className="px-3 py-2 text-gray-500">{item.product.category ?? "—"}</td>
                              <td className="px-3 py-2 text-center">
                                {mc > 0 ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
                                    {mc} fehlen
                                  </span>
                                ) : (
                                  <span className="text-green-600">✓</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Download + delete */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={() => downloadCSV(req.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      ↓ CSV für Hersteller exportieren
                    </button>
                    <button
                      onClick={() => deleteRequest(req.id)}
                      className="text-sm text-red-500 hover:text-red-700 px-3 py-2 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
