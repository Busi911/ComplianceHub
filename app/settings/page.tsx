"use client";

import { useEffect, useState, useCallback } from "react";

interface Setting {
  key: string;
  label: string;
  description?: string;
  group: string;
  type: "number" | "string" | "boolean";
  unit?: string;
  currentValue: string;
  value: string; // default
}

interface SettingsResponse {
  settings: Setting[];
  groups: Record<string, Setting[]>;
}

const GROUP_META: Record<string, { label: string; description: string }> = {
  levy_rates: {
    label: "Abgaben §54 UrhG — ZPÜ-Tarife",
    description:
      "Gerätepauschalen der ZPÜ (Zentralstelle für private Überspielungsrechte). " +
      "Tarife werden jährlich neu verhandelt und müssen manuell aktualisiert werden.",
  },
  ai: {
    label: "KI-Klassifizierung",
    description: "Parameter für die automatische Klassifizierung mit Claude Haiku.",
  },
  general: {
    label: "Allgemein",
    description: "Systemweite Einstellungen.",
  },
};

const GROUP_ORDER = ["levy_rates", "ai", "general"];

function SettingRow({ setting, onSave }: {
  setting: Setting;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(setting.currentValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isChanged = draft !== setting.currentValue;
  const isDefault = setting.currentValue === setting.value;

  async function save() {
    setSaving(true);
    await onSave(setting.key, draft);
    setSaving(false);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function reset() {
    setDraft(setting.value);
  }

  return (
    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{setting.label}</p>
          {isDefault && (
            <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Standard</span>
          )}
          {!isDefault && (
            <span className="text-xs text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">Angepasst</span>
          )}
        </div>
        {setting.description && (
          <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {editing ? (
          <>
            <div className="flex items-center gap-1">
              <input
                type={setting.type === "number" ? "number" : "text"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                step={setting.type === "number" ? "0.01" : undefined}
                min={setting.type === "number" ? "0" : undefined}
                className="border border-blue-400 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              {setting.unit && <span className="text-xs text-gray-500">{setting.unit}</span>}
            </div>
            {!isDefault && (
              <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 underline">
                Standard
              </button>
            )}
            <button
              onClick={save}
              disabled={saving || !isChanged}
              className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "…" : "Speichern"}
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(setting.currentValue); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-mono text-gray-700 min-w-16 text-right">
              {setting.currentValue}{setting.unit ? ` ${setting.unit}` : ""}
            </span>
            {saved && <span className="text-xs text-green-600">✓</span>}
            <button
              onClick={() => { setEditing(true); setDraft(setting.currentValue); }}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 border border-gray-200 rounded hover:border-gray-400 transition-colors"
            >
              Bearbeiten
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/settings").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(key: string, value: string) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    load(); // refresh to show updated badge
  }

  const orderedGroups = GROUP_ORDER.filter((g) => data?.groups[g]?.length);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-sm text-gray-500 mt-1">
          Konfigurierbare Parameter — gespeichert in der Datenbank, sofort wirksam ohne Redeploy.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Lade…</p>
      ) : (
        orderedGroups.map((group) => {
          const groupSettings = data?.groups[group] ?? [];
          const meta = GROUP_META[group] ?? { label: group, description: "" };
          const customCount = groupSettings.filter((s) => s.currentValue !== s.value).length;

          return (
            <div key={group} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{meta.label}</h2>
                    {meta.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                    )}
                  </div>
                  {customCount > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5">
                      {customCount} angepasst
                    </span>
                  )}
                </div>
              </div>
              <div className="px-5 divide-y divide-gray-50">
                {groupSettings.map((s) => (
                  <SettingRow key={s.key} setting={s} onSave={handleSave} />
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <p className="text-xs text-amber-800">
          <strong>Hinweis ZPÜ-Tarife:</strong> Die Tarife werden jährlich zwischen den Verwertungsgesellschaften
          (ZPÜ) und Geräteherstellern neu verhandelt. Aktuelle Tarife findest du auf
          {" "}<span className="font-mono">zpue.de</span>. Anpassungen wirken sich sofort auf
          neu berechnete Jahresabgaben aus — bereits gespeicherte Profile werden erst bei
          der nächsten Klassifizierung aktualisiert.
        </p>
      </div>
    </div>
  );
}
