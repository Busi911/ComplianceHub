import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CorrectionExample } from "@/lib/compliance/corrections";
import { formatExamplesForPrompt } from "@/lib/compliance/corrections";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string | null> {
  try {
    const client = getClient();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = msg.content[0];
    if (block.type === "text") return block.text;
    return null;
  } catch {
    return null;
  }
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ─── Battery classification ──────────────────────────────────────────────────

const BatteryResultSchema = z.object({
  containsBattery: z.boolean(),
  batteryType: z.enum(["LI_ION", "NIMH", "ALKALINE", "NICD", "LEAD_ACID", "OTHER"]).optional(),
  isRemovable: z.boolean().optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type BatteryAiResult = z.infer<typeof BatteryResultSchema>;

export async function classifyBattery(
  productName: string,
  category: string | null,
  subcategory: string | null,
  examples: CorrectionExample[] = [],
): Promise<BatteryAiResult | null> {
  const system = `Du bist BattDG-Spezialist für die Klassifizierung von Produkten nach dem Batteriegesetz.
Antworte ausschließlich als JSON-Objekt ohne weitere Erklärungen:
{
  "containsBattery": boolean,
  "batteryType": "LI_ION"|"NIMH"|"ALKALINE"|"NICD"|"LEAD_ACID"|"OTHER" (nur wenn containsBattery=true),
  "isRemovable": boolean (nur wenn containsBattery=true),
  "confidence": 0.0-1.0,
  "reasoning": "kurze Begründung auf Deutsch"
}${formatExamplesForPrompt(examples)}`;

  const user = `Produkt: ${productName}
Kategorie: ${category ?? "unbekannt"}
Unterkategorie: ${subcategory ?? "unbekannt"}`;

  const raw = await callClaude(system, user);
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const result = BatteryResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ─── WEEE / ElektroG classification ─────────────────────────────────────────

const WeeeResultSchema = z.object({
  isElectronic: z.boolean(),
  weeeCategory: z.enum([
    "HAUSHALTSGROSSE_GERATE", "HAUSHALTSKLEINGERATE", "IT_TELEKOMMUNIKATION",
    "UNTERHALTUNGSELEKTRONIK", "BELEUCHTUNG", "WERKZEUGE",
    "SPIELZEUG_FREIZEIT_SPORT", "MEDIZINPRODUKTE", "UEBERWACHUNGS_INSTRUMENTE", "AUTOMATEN",
  ]).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type WeeeAiResult = z.infer<typeof WeeeResultSchema>;

export async function classifyWeee(
  productName: string,
  category: string | null,
  subcategory: string | null,
  examples: CorrectionExample[] = [],
): Promise<WeeeAiResult | null> {
  const system = `Du bist ElektroG-Spezialist. Bestimme, ob ein Produkt unter das Elektro- und Elektronikgerätegesetz (ElektroG) fällt.
Antworte ausschließlich als JSON-Objekt:
{
  "isElectronic": boolean,
  "weeeCategory": "HAUSHALTSGROSSE_GERATE"|"HAUSHALTSKLEINGERATE"|"IT_TELEKOMMUNIKATION"|"UNTERHALTUNGSELEKTRONIK"|"BELEUCHTUNG"|"WERKZEUGE"|"SPIELZEUG_FREIZEIT_SPORT"|"MEDIZINPRODUKTE"|"UEBERWACHUNGS_INSTRUMENTE"|"AUTOMATEN" (nur wenn isElectronic=true),
  "confidence": 0.0-1.0,
  "reasoning": "kurze Begründung auf Deutsch"
}${formatExamplesForPrompt(examples)}`;

  const user = `Produkt: ${productName}
Kategorie: ${category ?? "unbekannt"}
Unterkategorie: ${subcategory ?? "unbekannt"}`;

  const raw = await callClaude(system, user);
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const result = WeeeResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ─── Levy §54 UrhG classification ────────────────────────────────────────────

const LevyResultSchema = z.object({
  levyApplicable: z.boolean(),
  levyCategory: z.enum([
    "PRINTER_SCANNER_COPIER", "USB_STICK", "SSD_HDD", "MEMORY_CARD",
    "OPTICAL_MEDIA", "TABLET_SMARTPHONE", "PC_LAPTOP", "NOT_APPLICABLE",
  ]).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type LevyAiResult = z.infer<typeof LevyResultSchema>;

export async function classifyLevy(
  productName: string,
  category: string | null,
  subcategory: string | null,
  examples: CorrectionExample[] = [],
): Promise<LevyAiResult | null> {
  const system = `Du bist Spezialist für die Urheberrechtsabgabe §54 UrhG (Geräteabgabe ZPÜ).
Bestimme, ob das Produkt abgabepflichtig ist (Drucker/Scanner, USB-Sticks, SSDs, Speicherkarten, optische Medien, Tablets, Smartphones, PCs, Laptops).
Antworte ausschließlich als JSON-Objekt:
{
  "levyApplicable": boolean,
  "levyCategory": "PRINTER_SCANNER_COPIER"|"USB_STICK"|"SSD_HDD"|"MEMORY_CARD"|"OPTICAL_MEDIA"|"TABLET_SMARTPHONE"|"PC_LAPTOP"|"NOT_APPLICABLE",
  "confidence": 0.0-1.0,
  "reasoning": "kurze Begründung auf Deutsch"
}${formatExamplesForPrompt(examples)}`;

  const user = `Produkt: ${productName}
Kategorie: ${category ?? "unbekannt"}
Unterkategorie: ${subcategory ?? "unbekannt"}`;

  const raw = await callClaude(system, user);
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const result = LevyResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ─── REACH classification ────────────────────────────────────────────────────

const ReachResultSchema = z.object({
  svhcRisk: z.enum(["low", "medium", "high"]),
  possibleSvhcCategories: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type ReachAiResult = z.infer<typeof ReachResultSchema>;

export async function classifyReach(
  productName: string,
  category: string | null,
  subcategory: string | null,
  examples: CorrectionExample[] = [],
): Promise<ReachAiResult | null> {
  const system = `Du bist REACH-Spezialist. Bewerte das SVHC-Risiko eines Produkts (besonders besorgniserregende Stoffe).
Hinweis: KI kann keine exakten Konzentrationen bestimmen. Maximale Confidence: 0.40.
Antworte ausschließlich als JSON-Objekt:
{
  "svhcRisk": "low"|"medium"|"high",
  "possibleSvhcCategories": ["z.B. Weichmacher", "Flammschutzmittel"],
  "confidence": 0.0-0.40,
  "reasoning": "kurze Begründung auf Deutsch"
}${formatExamplesForPrompt(examples)}`;

  const user = `Produkt: ${productName}
Kategorie: ${category ?? "unbekannt"}
Unterkategorie: ${subcategory ?? "unbekannt"}`;

  const raw = await callClaude(system, user);
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const result = ReachResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ─── RoHS classification ─────────────────────────────────────────────────────

const RohsResultSchema = z.object({
  rohsApplicable: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type RohsAiResult = z.infer<typeof RohsResultSchema>;

export async function classifyRohs(
  productName: string,
  category: string | null,
  subcategory: string | null,
  isElectronic: boolean | null,
  examples: CorrectionExample[] = [],
): Promise<RohsAiResult | null> {
  const system = `Du bist RoHS-Spezialist. Bestimme, ob das Produkt unter die RoHS-Richtlinie fällt (Beschränkung gefährlicher Stoffe in Elektro- und Elektronikgeräten).
Antworte ausschließlich als JSON-Objekt:
{
  "rohsApplicable": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "kurze Begründung auf Deutsch"
}${formatExamplesForPrompt(examples)}`;

  const user = `Produkt: ${productName}
Kategorie: ${category ?? "unbekannt"}
Unterkategorie: ${subcategory ?? "unbekannt"}
Ist Elektronik (aus ElektroG-Analyse): ${isElectronic === null ? "unbekannt" : isElectronic}`;

  const raw = await callClaude(system, user);
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const result = RohsResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ─── EUDR classification ─────────────────────────────────────────────────────

const EudrResultSchema = z.object({
  containsRegulatedCommodity: z.boolean(),
  commodities: z.array(z.string()),
  dueDiligenceRequired: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type EudrAiResult = z.infer<typeof EudrResultSchema>;

export async function classifyEudr(
  productName: string,
  category: string | null,
  subcategory: string | null,
  examples: CorrectionExample[] = [],
): Promise<EudrAiResult | null> {
  const system = `Du bist EUDR-Spezialist (EU-Entwaldungsverordnung). Bestimme, ob das Produkt regulierte Rohstoffe enthält:
Holz, Kautschuk, Soja, Palmöl, Rind (Leder/Fleisch), Kaffee, Kakao und daraus hergestellte Produkte.
Antworte ausschließlich als JSON-Objekt:
{
  "containsRegulatedCommodity": boolean,
  "commodities": ["z.B. Holz", "Kautschuk"],
  "dueDiligenceRequired": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "kurze Begründung auf Deutsch"
}${formatExamplesForPrompt(examples)}`;

  const user = `Produkt: ${productName}
Kategorie: ${category ?? "unbekannt"}
Unterkategorie: ${subcategory ?? "unbekannt"}`;

  const raw = await callClaude(system, user);
  const parsed = parseJson(raw);
  if (!parsed) return null;
  const result = EudrResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
