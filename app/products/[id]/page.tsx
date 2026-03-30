"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataQualityBar } from "@/components/ui/DataQualityBar";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { computeDataQuality } from "@/lib/validation";

interface SamplingRecord {
  id: string;
  sampledAt: string;
  sampledBy: string | null;
  measuredPlasticG: number | null;
  measuredPaperG: number | null;
  measuredTotalPackagingG: number | null;
  netWeightAtSamplingG: number | null;
  grossWeightAtSamplingG: number | null;
  notes: string | null;
}

interface EstimateHistory {
  id: string;
  oldPlasticG: number | null;
  oldPaperG: number | null;
  newPlasticG: number | null;
  newPaperG: number | null;
  reason: string | null;
  method: string | null;
  createdAt: string;
}

interface Product {
  id: string;
  sku: string;
  productName: string;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  ekPrice: number | null;
  netWeightG: number | null;
  grossWeightG: number | null;
  netLengthMm: number | null;
  netWidthMm: number | null;
  netHeightMm: number | null;
  grossLengthMm: number | null;
  grossWidthMm: number | null;
  grossHeightMm: number | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  importBatch: { name: string; importedAt: string } | null;
  packagingProfile: {
    status: string;
    currentPlasticG: number | null;
    currentPaperG: number | null;
    estimatedPlasticG: number | null;
    estimatedPaperG: number | null;
    measuredPlasticG: number | null;
    measuredPaperG: number | null;
    confidenceScore: number | null;
    estimationMethod: string | null;
    notes: string | null;
  } | null;
  samplingRecords: SamplingRecord[];
  estimateHistory: EstimateHistory[];
}

function fmt(val: number | null, decimals = 1, unit = "g"): string {
  if (val === null) return "—";
  return `${val.toFixed(decimals)} ${unit}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("de-DE");
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500 font-medium">{label}</dt>
      <dd className={`mt-0.5 text-sm text-gray-900 ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-gray-300">—</span>}
      </dd>
    </div>
  );
}

interface SamplingFormData {
  sampledBy: string;
  measuredPlasticG: string;
  measuredPaperG: string;
  measuredTotalPackagingG: string;
  netWeightAtSamplingG: string;
  grossWeightAtSamplingG: string;
  notes: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSamplingForm, setShowSamplingForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [samplingForm, setSamplingForm] = useState<SamplingFormData>({
    sampledBy: "",
    measuredPlasticG: "",
    measuredPaperG: "",
    measuredTotalPackagingG: "",
    netWeightAtSamplingG: "",
    grossWeightAtSamplingG: "",
    notes: "",
  });

  function loadProduct() {
    setLoading(true);
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setProduct(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProduct();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitSampling(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/sampling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: id,
          sampledBy: samplingForm.sampledBy || null,
          measuredPlasticG: samplingForm.measuredPlasticG || null,
          measuredPaperG: samplingForm.measuredPaperG || null,
          measuredTotalPackagingG:
            samplingForm.measuredTotalPackagingG || null,
          netWeightAtSamplingG: samplingForm.netWeightAtSamplingG || null,
          grossWeightAtSamplingG: samplingForm.grossWeightAtSamplingG || null,
          notes: samplingForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowSamplingForm(false);
      setSamplingForm({
        sampledBy: "",
        measuredPlasticG: "",
        measuredPaperG: "",
        measuredTotalPackagingG: "",
        netWeightAtSamplingG: "",
        grossWeightAtSamplingG: "",
        notes: "",
      });
      loadProduct();
    } catch (err) {
      alert(
        "Fehler beim Speichern: " +
          (err instanceof Error ? err.message : "Unbekannt")
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-48 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          {error ?? "Produkt nicht gefunden"}
        </div>
        <button
          onClick={() => router.push("/products")}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← Zurück zur Liste
        </button>
      </div>
    );
  }

  const quality = computeDataQuality({
    sku: product.sku,
    productName: product.productName,
    manufacturer: product.manufacturer ?? undefined,
    brand: product.brand ?? undefined,
    category: product.category ?? undefined,
    ekPrice: product.ekPrice,
    netWeightG: product.netWeightG,
    grossWeightG: product.grossWeightG,
    netLengthMm: product.netLengthMm,
    netWidthMm: product.netWidthMm,
    netHeightMm: product.netHeightMm,
    grossLengthMm: product.grossLengthMm,
    grossWidthMm: product.grossWidthMm,
    grossHeightMm: product.grossHeightMm,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/products"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Produkte
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">
            {product.productName}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-sm text-gray-500">{product.sku}</span>
            {product.packagingProfile && (
              <StatusBadge status={product.packagingProfile.status} />
            )}
          </div>
        </div>
        <button
          onClick={() => setShowSamplingForm(!showSamplingForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          + Stichprobe erfassen
        </button>
      </div>

      {/* Data quality */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Datenqualität</h2>
        <DataQualityBar score={quality.score} />
        {quality.missingRequired.length > 0 && (
          <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
            <strong>Pflichtfelder fehlen:</strong>{" "}
            {quality.missingRequired.join(", ")}
          </div>
        )}
        {quality.missingRecommended.length > 0 && (
          <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-yellow-700">
            <strong>Empfohlene Felder fehlen:</strong>{" "}
            {quality.missingRecommended.join(", ")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stammdaten */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Stammdaten</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Field label="SKU" value={product.sku} mono />
            <Field label="Produktname" value={product.productName} />
            <Field label="Hersteller" value={product.manufacturer} />
            <Field label="Marke" value={product.brand} />
            <Field label="Kategorie" value={product.category} />
            <Field label="Unterkategorie" value={product.subcategory} />
            <Field
              label="EK-Preis"
              value={
                product.ekPrice !== null
                  ? `${product.ekPrice.toFixed(2)} €`
                  : null
              }
              mono
            />
            <Field label="Quelle" value={product.source} />
          </dl>
        </div>

        {/* Gewichte & Maße */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            Gewichte & Maße
          </h2>
          <dl className="grid grid-cols-2 gap-3">
            <Field
              label="Nettogewicht"
              value={fmt(product.netWeightG)}
              mono
            />
            <Field
              label="Bruttogewicht"
              value={fmt(product.grossWeightG)}
              mono
            />
            <Field
              label="Netto L×B×H (mm)"
              value={
                product.netLengthMm
                  ? `${product.netLengthMm}×${product.netWidthMm}×${product.netHeightMm}`
                  : null
              }
              mono
            />
            <Field
              label="Brutto L×B×H (mm)"
              value={
                product.grossLengthMm
                  ? `${product.grossLengthMm}×${product.grossWidthMm}×${product.grossHeightMm}`
                  : null
              }
              mono
            />
          </dl>
        </div>
      </div>

      {/* Verpackungsprofil */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">
          Verpackungsprofil
        </h2>
        {product.packagingProfile ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xs text-blue-600 font-medium mb-1">
                  Kunststoff (aktuell)
                </div>
                <div className="text-xl font-bold text-blue-900">
                  {fmt(product.packagingProfile.currentPlasticG)}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xs text-green-600 font-medium mb-1">
                  Papier (aktuell)
                </div>
                <div className="text-xl font-bold text-green-900">
                  {fmt(product.packagingProfile.currentPaperG)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 font-medium mb-1">
                  Konfidenz
                </div>
                <ConfidenceBar
                  score={product.packagingProfile.confidenceScore}
                  showLabel={true}
                />
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 font-medium mb-1">
                  Methode
                </div>
                <div className="text-xs font-mono text-gray-700 break-all">
                  {product.packagingProfile.estimationMethod ?? "—"}
                </div>
              </div>
            </div>

            {(product.packagingProfile.estimatedPlasticG !== null ||
              product.packagingProfile.measuredPlasticG !== null) && (
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100 text-sm">
                <Field
                  label="Geschätzt Kunststoff"
                  value={fmt(product.packagingProfile.estimatedPlasticG)}
                  mono
                />
                <Field
                  label="Geschätzt Papier"
                  value={fmt(product.packagingProfile.estimatedPaperG)}
                  mono
                />
                <Field
                  label="Gemessen Kunststoff"
                  value={fmt(product.packagingProfile.measuredPlasticG)}
                  mono
                />
                <Field
                  label="Gemessen Papier"
                  value={fmt(product.packagingProfile.measuredPaperG)}
                  mono
                />
              </dl>
            )}

            {product.packagingProfile.notes && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                {product.packagingProfile.notes}
              </p>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-400 py-4 text-center">
            Kein Verpackungsprofil vorhanden.
            <br />
            <button
              onClick={async () => {
                await fetch("/api/estimate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ productId: id }),
                });
                loadProduct();
              }}
              className="mt-2 text-blue-600 hover:underline"
            >
              Schätzung starten
            </button>
          </div>
        )}
      </div>

      {/* Sampling form */}
      {showSamplingForm && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            Neue Stichprobe erfassen
          </h2>
          <form onSubmit={submitSampling} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Erfasst von
                </label>
                <input
                  type="text"
                  value={samplingForm.sampledBy}
                  onChange={(e) =>
                    setSamplingForm((f) => ({ ...f, sampledBy: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Kunststoff gemessen (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={samplingForm.measuredPlasticG}
                  onChange={(e) =>
                    setSamplingForm((f) => ({
                      ...f,
                      measuredPlasticG: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                  placeholder="z. B. 45.5"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Papier/Pappe gemessen (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={samplingForm.measuredPaperG}
                  onChange={(e) =>
                    setSamplingForm((f) => ({
                      ...f,
                      measuredPaperG: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                  placeholder="z. B. 120.0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Verpackung gesamt (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={samplingForm.measuredTotalPackagingG}
                  onChange={(e) =>
                    setSamplingForm((f) => ({
                      ...f,
                      measuredTotalPackagingG: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                  placeholder="optional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Nettogewicht bei Wiegung (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={samplingForm.netWeightAtSamplingG}
                  onChange={(e) =>
                    setSamplingForm((f) => ({
                      ...f,
                      netWeightAtSamplingG: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                  placeholder="optional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Bruttogewicht bei Wiegung (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={samplingForm.grossWeightAtSamplingG}
                  onChange={(e) =>
                    setSamplingForm((f) => ({
                      ...f,
                      grossWeightAtSamplingG: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                  placeholder="optional"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Notizen
              </label>
              <textarea
                value={samplingForm.notes}
                onChange={(e) =>
                  setSamplingForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400"
                placeholder="Optionale Notizen"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? "Speichert…" : "Stichprobe speichern"}
              </button>
              <button
                type="button"
                onClick={() => setShowSamplingForm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 border rounded"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sampling records */}
      {product.samplingRecords.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              Stichproben ({product.samplingRecords.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 font-medium text-gray-600">Datum</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Von</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">
                    Kunststoff
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">
                    Papier
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">
                    Gesamt
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">
                    Bruttogewicht
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Notizen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {product.samplingRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-xs font-mono">
                      {fmtDate(r.sampledAt)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {r.sampledBy ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {fmt(r.measuredPlasticG)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {fmt(r.measuredPaperG)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {fmt(r.measuredTotalPackagingG)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {fmt(r.grossWeightAtSamplingG)}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {r.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Estimate history */}
      {product.estimateHistory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Änderungshistorie</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {product.estimateHistory.map((h) => (
              <div key={h.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-mono">
                    {fmtDate(h.createdAt)}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">
                    {h.method ?? "—"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs">
                  <span className="text-gray-500">
                    Kunststoff:{" "}
                    <span className="text-red-500 line-through">
                      {fmt(h.oldPlasticG)}
                    </span>{" "}
                    →{" "}
                    <span className="text-green-600 font-medium">
                      {fmt(h.newPlasticG)}
                    </span>
                  </span>
                  <span className="text-gray-500">
                    Papier:{" "}
                    <span className="text-red-500 line-through">
                      {fmt(h.oldPaperG)}
                    </span>{" "}
                    →{" "}
                    <span className="text-green-600 font-medium">
                      {fmt(h.newPaperG)}
                    </span>
                  </span>
                </div>
                {h.reason && (
                  <div className="text-xs text-gray-400 mt-0.5">{h.reason}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import info */}
      {product.importBatch && (
        <div className="text-xs text-gray-400 text-right">
          Importiert via „{product.importBatch.name}" am{" "}
          {fmtDate(product.importBatch.importedAt)} • Erstellt:{" "}
          {fmtDate(product.createdAt)} • Aktualisiert:{" "}
          {fmtDate(product.updatedAt)}
        </div>
      )}
    </div>
  );
}
