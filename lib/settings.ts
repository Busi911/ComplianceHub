import { prisma } from "@/lib/prisma";

export interface SettingMeta {
  value: string;
  label: string;
  description?: string;
  group: string;
  type: "number" | "string" | "boolean";
  unit?: string;
}

/** Canonical default values. DB entries override these at runtime. */
export const SETTING_DEFAULTS: Record<string, SettingMeta> = {
  // ── ZPÜ-Tarife §54 UrhG ──────────────────────────────────────────────────
  levy_rate_PRINTER_SCANNER_COPIER: {
    value: "15.77", label: "Drucker / Scanner / Kopierer",
    description: "ZPÜ-Gerätepauschale für Drucker, Scanner und Kopiergeräte",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },
  levy_rate_USB_STICK: {
    value: "0.39", label: "USB-Stick",
    description: "ZPÜ-Gerätepauschale für USB-Massenspeicher",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },
  levy_rate_SSD_HDD: {
    value: "1.10", label: "SSD / HDD",
    description: "ZPÜ-Gerätepauschale für interne und externe Festplatten",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },
  levy_rate_MEMORY_CARD: {
    value: "0.10", label: "Speicherkarte",
    description: "ZPÜ-Gerätepauschale für SD-/microSD-Karten",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },
  levy_rate_OPTICAL_MEDIA: {
    value: "0.06", label: "Optische Medien (CD / DVD / Blu-ray)",
    description: "ZPÜ-Trägerpauschale für optische Speichermedien",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },
  levy_rate_TABLET_SMARTPHONE: {
    value: "8.23", label: "Tablet / Smartphone",
    description: "ZPÜ-Gerätepauschale für Tablets und Mobiltelefone",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },
  levy_rate_PC_LAPTOP: {
    value: "13.65", label: "PC / Laptop",
    description: "ZPÜ-Gerätepauschale für Desktop-PCs und Laptops",
    group: "levy_rates", type: "number", unit: "€/Stück",
  },

  // ── KI-Klassifizierung ────────────────────────────────────────────────────
  ai_confidence_threshold_estimated: {
    value: "0.40",
    label: "Mindest-Confidence für Status ESTIMATED",
    description: "KI-Ergebnisse mit Confidence unterhalb dieses Schwellenwerts werden als UNKNOWN eingestuft",
    group: "ai", type: "number",
  },
  ai_correction_examples_limit: {
    value: "5",
    label: "Anzahl Lernbeispiele pro KI-Aufruf",
    description: "Wie viele manuelle Korrekturen als Few-Shot-Beispiele in den KI-Prompt eingebettet werden",
    group: "ai", type: "number",
  },

  // ── Allgemein ─────────────────────────────────────────────────────────────
  cron_classify_batch_size: {
    value: "100",
    label: "Cron-Batch-Größe (Compliance-Klassifizierung)",
    description: "Maximale Anzahl Produkte pro Cron-Lauf",
    group: "general", type: "number",
  },
};

/** Read a single setting. Falls back to default if not in DB. */
export async function getSetting(key: string): Promise<string> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (row) return row.value;
  } catch {
    // DB unavailable — return default
  }
  return SETTING_DEFAULTS[key]?.value ?? "";
}

/** Read a setting as a number. */
export async function getSettingNumber(key: string): Promise<number> {
  const val = await getSetting(key);
  return parseFloat(val) || 0;
}

/** Read all settings in a group, merging DB overrides on top of defaults. */
export async function getSettingGroup(
  group: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // Start with defaults for this group
  for (const [key, meta] of Object.entries(SETTING_DEFAULTS)) {
    if (meta.group === group) result[key] = meta.value;
  }

  // Override with persisted DB values
  try {
    const rows = await prisma.systemSetting.findMany({ where: { group } });
    for (const row of rows) result[row.key] = row.value;
  } catch {
    // DB unavailable — defaults only
  }

  return result;
}

/** Persist a setting value to DB. */
export async function setSetting(key: string, value: string): Promise<void> {
  const meta = SETTING_DEFAULTS[key];
  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key, value,
      label: meta?.label ?? key,
      description: meta?.description ?? null,
      group: meta?.group ?? "general",
    },
    update: { value },
  });
}

/** Return all settings with current DB values merged over defaults. */
export async function getAllSettings(): Promise<
  Array<SettingMeta & { key: string; currentValue: string }>
> {
  const dbRows = await prisma.systemSetting.findMany();
  const dbMap = Object.fromEntries(dbRows.map((r) => [r.key, r.value]));

  return Object.entries(SETTING_DEFAULTS).map(([key, meta]) => ({
    key,
    ...meta,
    currentValue: dbMap[key] ?? meta.value,
  }));
}
