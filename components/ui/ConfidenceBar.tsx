"use client";

interface ConfidenceBarProps {
  score: number | null; // 0.0 - 1.0
  showLabel?: boolean;
}

export function ConfidenceBar({ score, showLabel = true }: ConfidenceBarProps) {
  if (score === null) {
    return <span className="text-xs text-gray-400">Keine Schätzung</span>;
  }

  const pct = Math.round(score * 100);

  const color =
    pct >= 70
      ? "bg-green-500"
      : pct >= 40
        ? "bg-yellow-400"
        : "bg-orange-400";

  const label =
    pct >= 70 ? "Hoch" : pct >= 40 ? "Mittel" : "Niedrig";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[50px]">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {pct}% ({label})
        </span>
      )}
    </div>
  );
}
