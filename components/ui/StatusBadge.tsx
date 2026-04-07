"use client";

type PackagingStatus = "IMPORTED" | "ESTIMATED" | "SAMPLED" | "REVIEWED";

const STATUS_CONFIG: Record<
  PackagingStatus,
  { label: string; color: string; title: string }
> = {
  IMPORTED: {
    label: "Importiert",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    title: "Wert aus Import — noch keine Schätzung oder Messung",
  },
  ESTIMATED: {
    label: "Geschätzt",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    title: "Wert wurde regelbasiert aus ähnlichen Produkten geschätzt",
  },
  SAMPLED: {
    label: "Gemessen",
    color: "bg-green-100 text-green-800 border-green-200",
    title: "Wert basiert auf tatsächlicher Wiegung (Stichprobe)",
  },
  REVIEWED: {
    label: "Geprüft",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    title: "Wert wurde manuell geprüft und bestätigt",
  },
};

const MFR_DATA_CONFIG = {
  label: "Gemeldet",
  color: "bg-purple-100 text-purple-800 border-purple-200",
  title: "Werte direkt vom Hersteller gemeldet",
};

interface StatusBadgeProps {
  status: string;
  estimationMethod?: string | null;
  size?: "sm" | "md";
}

export function StatusBadge({ status, estimationMethod, size = "md" }: StatusBadgeProps) {
  const config =
    status === "ESTIMATED" && estimationMethod === "manufacturer_data"
      ? MFR_DATA_CONFIG
      : (STATUS_CONFIG[status as PackagingStatus] ?? STATUS_CONFIG.IMPORTED);
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded border font-medium ${sizeClass} ${config.color}`}
      title={config.title}
    >
      {config.label}
    </span>
  );
}
