"use client";

interface DataQualityBarProps {
  score: number; // 0-100
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function DataQualityBar({
  score,
  showLabel = true,
  size = "md",
}: DataQualityBarProps) {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 60
        ? "bg-yellow-400"
        : score >= 40
          ? "bg-orange-400"
          : "bg-red-400";

  const label =
    score >= 80
      ? "Gut"
      : score >= 60
        ? "Mittel"
        : score >= 40
          ? "Gering"
          : "Unvollständig";

  const height = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-gray-200 rounded-full ${height} min-w-[60px]`}>
        <div
          className={`${height} rounded-full ${color} transition-all duration-300`}
          style={{ width: `${Math.max(score, 2)}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {score}% – {label}
        </span>
      )}
    </div>
  );
}

export function DataQualityBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-100 text-green-800"
      : score >= 60
        ? "bg-yellow-100 text-yellow-800"
        : score >= 40
          ? "bg-orange-100 text-orange-800"
          : "bg-red-100 text-red-800";

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {score}%
    </span>
  );
}
