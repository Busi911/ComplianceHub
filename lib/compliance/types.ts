export type ComplianceStatus =
  | "NOT_APPLICABLE"
  | "UNKNOWN"
  | "ESTIMATED"
  | "DECLARED"
  | "VERIFIED";

export interface ComplianceModuleResult {
  status: ComplianceStatus;
  confidenceScore: number;
  method: string;
  data: Record<string, unknown>;
}

/** Maps ComplianceStatus → numeric score for aggregate computation */
export function statusToScore(status: ComplianceStatus): number | null {
  switch (status) {
    case "NOT_APPLICABLE": return null; // excluded from average
    case "UNKNOWN":        return 0;
    case "ESTIMATED":      return 0.4;
    case "DECLARED":       return 0.8;
    case "VERIFIED":       return 1.0;
  }
}
