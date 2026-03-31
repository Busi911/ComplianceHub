"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";

interface PriorityProduct {
  id: string;
  ean: string;
  internalArticleNumber: string | null;
  productName: string;
  manufacturer: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  grossWeightG: number | null;
  samplingSkipReason: string | null;
  samplingSkippedAt: string | null;
  packagingProfile: {
    status: string;
    confidenceScore: number | null;
    estimationMethod: string | null;
  } | null;
  _count: { samplingRecords: number };
  leverageScore: number;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  out_of_stock: "Nicht auf Lager",
  discontinued: "Nicht mehr im Sortiment",
  other: "Anderer Grund",
};

function SkipDropdown({
  productId,
  onSkip,
  onCancel,
}: {
  productId: string;
  onSkip: (productId: string, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("out_of_stock");
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      await onSkip(productId, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="border border-amber-400 rounded px-2 py-1 text-xs outline-none focus:border-amber-500 bg-white"
        autoFocus
      >
        <option value="out_of_stock">Nicht auf Lager</option>
        <option value="discontinued">Nicht mehr im Sortiment</option>
        <option value="other">Anderer Grund</option>
      </select>
      <button
        onClick={handleConfirm}
        disabled={saving}
        className="text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600 disabled:opacity-50"
      >
        {saving ? "…" : "OK"}
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-gray-400 hover:text-gray-700 px-1 py-1"
      >
        ✕
      </button>
    </div>
  );
}

function SamplingPriorityInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const category = searchParams.get("category") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "confidence";
  const showSkipped = searchParams.get("showSkipped") === "1";

  const [products, setProducts] = useState<PriorityProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [skippingId, setSkippingId] = useState<string | null>(null); // product currently showing skip dropdown
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [presetSaved, setPresetSaved] = useState(false);
  // Wiegeliste: Produkte die per "Wiegen"-Knopf zur Vorlage hinzugefügt werden
  const [wiegeliste, setWiegeliste] = useState<PriorityProduct[]>([]);
  const [showWiegelistePreset, setShowWiegelistePreset] = useState(false);
  const [wiegelisteName, setWiegelisteName] = useState("");
  const [savingWiegeliste, setSavingWiegeliste] = useState(false);
  const [wiegelisteSaved, setWiegelisteSaved] = useState(false);

  function fetchList() {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    params.set("sortBy", sortBy);
    params.set("limit", "100");
    if (showSkipped) params.set("includeSkipped", "1");

    Promise.all([
      fetch(`/api/sampling/priority?${params}`).then((r) => r.json()),
      fetch("/api/products?pageSize=1").then((r) => r.json()),
    ])
      .then(([priority, productsData]) => {
        setProducts(priority.products ?? []);
        setSkippedCount(priority.skippedCount ?? 0);
        setCategories(productsData.filterOptions?.categories ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sortBy, showSkipped]);

  function updateParams(updates: Record<string, string>) {
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (sortBy !== "confidence") p.set("sortBy", sortBy);
    if (showSkipped) p.set("showSkipped", "1");
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`/sampling?${p.toString()}`);
  }

  async function skipProduct(productId: string, reason: string) {
    await fetch("/api/sampling/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, reason }),
    });
    setSkippingId(null);
    fetchList();
  }

  async function unskipProduct(productId: string) {
    await fetch(`/api/sampling/skip?productId=${productId}`, { method: "DELETE" });
    fetchList();
  }

  async function saveAsPreset() {
    if (!presetName.trim() || products.length === 0) return;
    setSavingPreset(true);
    try {
      const res = await fetch("/api/sampling/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presetName.trim(), productIds: products.map((p) => p.id) }),
      });
      if (res.ok) {
        setPresetSaved(true);
        setShowPresetInput(false);
        setPresetName("");
        setTimeout(() => setPresetSaved(false), 3000);
      }
    } finally {
      setSavingPreset(false);
    }
  }

  function toggleWiegeliste(product: PriorityProduct) {
    setWiegeliste((prev) =>
      prev.some((p) => p.id === product.id)
        ? prev.filter((p) => p.id !== product.id)
        : [...prev, product]
    );
  }

  async function saveWiegeliste() {
    if (!wiegelisteName.trim() || wiegeliste.length === 0) return;
    setSavingWiegeliste(true);
    try {
      const res = await fetch("/api/sampling/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wiegelisteName.trim(), productIds: wiegeliste.map((p) => p.id) }),
      });
      if (res.ok) {
        setWiegelisteSaved(true);
        setShowWiegelistePreset(false);
        setWiegelisteName("");
        setWiegeliste([]);
        setTimeout(() => setWiegelisteSaved(false), 3000);
      }
    } finally {
      setSavingWiegeliste(false);
    }
  }

  const colCount = (sortBy === "leverage" ? 9 : 8) + (showSkipped ? 1 : 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stichproben-Priorität</h1>
          <p className="text-sm text-gray-500 mt-1">
            Produkte ohne eigene Messung — sortiert nach{" "}
            {sortBy === "leverage" ? "Hebelwirkung (wie viele andere profitieren)" : "niedrigstem Konfidenzwert"}
          </p>
        </div>
        <Link
          href="/sampling/session"
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Wiegesession →
        </Link>
      </div>

      {/* Filters + sort toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={category}
          onChange={(e) => updateParams({ category: e.target.value, sortBy })}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Sort toggle */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            onClick={() => updateParams({ category, sortBy: "confidence" })}
            className={`px-3 py-1.5 transition-colors ${
              sortBy !== "leverage"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Konfidenz ↑
          </button>
          <button
            onClick={() => updateParams({ category, sortBy: "leverage" })}
            className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
              sortBy === "leverage"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Hebelwirkung ↓
          </button>
        </div>

        {/* Skipped toggle */}
        <button
          onClick={() =>
            updateParams({ showSkipped: showSkipped ? "" : "1" })
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            showSkipped
              ? "bg-amber-100 border-amber-400 text-amber-800"
              : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Übersprungene
          {skippedCount > 0 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              showSkipped ? "bg-amber-400 text-white" : "bg-gray-200 text-gray-700"
            }`}>
              {skippedCount}
            </span>
          )}
        </button>

        <span className="text-sm text-gray-500">
          {loading ? "Lädt…" : `${products.length} Produkte${showSkipped ? " (inkl. übersprungener)" : " ohne eigene Stichprobe"}`}
        </span>

        {/* Save as preset */}
        {!showPresetInput && products.length > 0 && !loading && (
          <button
            onClick={() => setShowPresetInput(true)}
            className="ml-auto text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            Als Vorlage speichern
          </button>
        )}
        {presetSaved && (
          <span className="ml-auto text-sm text-green-600 font-medium">Vorlage gespeichert</span>
        )}
        {showPresetInput && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveAsPreset(); }}
            className="ml-auto flex items-center gap-2"
          >
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Vorlagenname …"
              autoFocus
              className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={savingPreset || !presetName.trim()}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {savingPreset ? "…" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={() => { setShowPresetInput(false); setPresetName(""); }}
              className="text-sm text-gray-400 hover:text-gray-700 px-1"
            >
              ✕
            </button>
          </form>
        )}
      </div>

      {sortBy === "leverage" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-800">
          <strong>Hebelwirkung:</strong> Produkte ganz oben haben die meisten Gleichartigen ohne Messung.
          Eine Wiegung verbessert sofort die Schätzung aller ähnlichen Produkte.
        </div>
      )}

      {showSkipped && skippedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
          Übersprungene Produkte werden in der normalen Prioritätsliste ausgeblendet.
          Klicke <strong>Wiederherstellen</strong>, um ein Produkt wieder in die Liste aufzunehmen.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 font-medium text-gray-600 w-6">#</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">SKU / Int. Nr.</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Produkt</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Kategorie</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Marke</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Status</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 min-w-[120px]">Konfidenz</th>
              {sortBy === "leverage" && (
                <th className="px-4 py-2.5 font-medium text-blue-700 text-right">Hebel</th>
              )}
              <th className="px-4 py-2.5 font-medium text-gray-600">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading &&
              [...Array(8)].map((_, i) => (
                <tr key={i}>
                  {[...Array(colCount)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && products.map((p, idx) => {
              const isSkipped = !!p.samplingSkipReason;
              const isShowingSkipDropdown = skippingId === p.id;

              return (
                <tr
                  key={p.id}
                  className={`${
                    isSkipped
                      ? "bg-amber-50/60 opacity-70"
                      : sortBy === "leverage" && p.leverageScore > 5
                      ? "bg-blue-50/30 hover:bg-blue-50/60"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className={`font-mono text-xs text-blue-600 ${isSkipped ? "line-through" : ""}`}>
                      {p.ean}
                    </div>
                    {p.internalArticleNumber && (
                      <div className="text-xs text-gray-400">{p.internalArticleNumber}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="hover:text-blue-600 font-medium">
                      {p.productName}
                    </Link>
                    {isSkipped && (
                      <div className="text-xs text-amber-600 mt-0.5">
                        ⏭ {SKIP_REASON_LABELS[p.samplingSkipReason!] ?? p.samplingSkipReason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {p.category}{p.subcategory ? ` / ${p.subcategory}` : ""}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {p.brand ?? p.manufacturer ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.packagingProfile?.status ?? "IMPORTED"} size="sm" />
                  </td>
                  <td className="px-4 py-3 min-w-[120px]">
                    <ConfidenceBar score={p.packagingProfile?.confidenceScore ?? null} showLabel={false} />
                    <div className="text-xs text-gray-400 mt-0.5">
                      {p.packagingProfile?.confidenceScore != null
                        ? `${Math.round(p.packagingProfile.confidenceScore * 100)}%`
                        : "Kein Profil"}
                    </div>
                  </td>
                  {sortBy === "leverage" && (
                    <td className="px-4 py-3 text-right">
                      {p.leverageScore > 0 ? (
                        <span className={`text-xs font-bold ${p.leverageScore > 5 ? "text-blue-700" : "text-gray-500"}`}>
                          {`+${p.leverageScore}`}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {isSkipped ? (
                      <button
                        onClick={() => unskipProduct(p.id)}
                        className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200 whitespace-nowrap"
                      >
                        ↩ Wiederherstellen
                      </button>
                    ) : isShowingSkipDropdown ? (
                      <SkipDropdown
                        productId={p.id}
                        onSkip={skipProduct}
                        onCancel={() => setSkippingId(null)}
                      />
                    ) : (
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => toggleWiegeliste(p)}
                          className={`text-xs px-2 py-1 rounded whitespace-nowrap transition-colors ${
                            wiegeliste.some((w) => w.id === p.id)
                              ? "bg-green-600 text-white hover:bg-green-700"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                          title={wiegeliste.some((w) => w.id === p.id) ? "Aus Wiegeliste entfernen" : "Zur Wiegeliste hinzufügen"}
                        >
                          {wiegeliste.some((w) => w.id === p.id) ? "✓ Liste" : "+ Liste"}
                        </button>
                        <Link
                          href={`/products/${p.id}#sampling`}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 whitespace-nowrap"
                        >
                          Wiegen →
                        </Link>
                        <button
                          onClick={() => setSkippingId(p.id)}
                          className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded hover:bg-amber-100 hover:text-amber-700 whitespace-nowrap"
                          title="Produkt in Prioritätsliste überspringen"
                        >
                          ⏭
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-gray-400">
                  {showSkipped
                    ? "Keine übersprungenen Produkte vorhanden."
                    : "Alle Produkte haben bereits eigene Stichproben."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky Wiegeliste-Bar */}
      {wiegeliste.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
          <div className="bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-sm">
                  {wiegeliste.length} Produkt{wiegeliste.length !== 1 ? "e" : ""} in der Wiegeliste
                </span>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {wiegeliste.map((p) => p.productName).join(", ")}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowWiegelistePreset((v) => !v)}
                  className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-400 font-medium"
                >
                  Als Vorlage speichern
                </button>
                <button
                  onClick={() => setWiegeliste([])}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1.5"
                >
                  ✕
                </button>
              </div>
            </div>
            {showWiegelistePreset && (
              <form
                onSubmit={(e) => { e.preventDefault(); saveWiegeliste(); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={wiegelisteName}
                  onChange={(e) => setWiegelisteName(e.target.value)}
                  placeholder="Name der Vorlage …"
                  autoFocus
                  className="flex-1 bg-gray-800 text-white border border-gray-600 rounded px-3 py-1.5 text-sm outline-none focus:border-green-400 placeholder-gray-500"
                />
                <button
                  type="submit"
                  disabled={savingWiegeliste || !wiegelisteName.trim()}
                  className="text-sm bg-green-500 text-white px-4 py-1.5 rounded hover:bg-green-400 disabled:opacity-50 font-medium"
                >
                  {savingWiegeliste ? "…" : "Speichern"}
                </button>
              </form>
            )}
            {wiegelisteSaved && (
              <p className="text-xs text-green-400">Vorlage gespeichert — ladbar über Wiegesession → Tab "Vorlage laden"</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SamplingPriorityPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-8 text-gray-400">Lädt…</div>}>
      <SamplingPriorityInner />
    </Suspense>
  );
}
