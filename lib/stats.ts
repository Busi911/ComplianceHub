/**
 * Statistical utility functions for packaging estimation and outlier detection.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[], m?: number): number {
  if (values.length < 2) return 0;
  const avg = m ?? mean(values);
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Pearson correlation coefficient.
 * Returns null when n < 3 or variance is zero.
 */
export function pearsonR(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const xm = mean(xs);
  const ym = mean(ys);
  let num = 0, xss = 0, yss = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xm) * (ys[i] - ym);
    xss += (xs[i] - xm) ** 2;
    yss += (ys[i] - ym) ** 2;
  }
  const denom = Math.sqrt(xss * yss);
  if (denom === 0) return null;
  return Math.round((num / denom) * 1000) / 1000;
}

/**
 * Ordinary Least Squares linear regression: y = a + b·x
 * Returns null when n < 3 or x has zero variance.
 */
export function linearRegression(
  xs: number[],
  ys: number[]
): { a: number; b: number; r2: number } | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const xm = mean(xs);
  const ym = mean(ys);
  let num = 0, xss = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xm) * (ys[i] - ym);
    xss += (xs[i] - xm) ** 2;
  }
  if (xss === 0) return null;
  const b = num / xss;
  const a = ym - b * xm;
  const r = pearsonR(xs, ys);
  if (r === null) return null;
  return {
    a: Math.round(a * 100) / 100,
    b: Math.round(b * 10000) / 10000,
    r2: Math.round(r * r * 1000) / 1000,
  };
}

export interface OutlierResult {
  isOutlier: boolean;
  reason: string | null;
}

/**
 * Detects outliers using the Tukey IQR fence (primary) and Z-Score (secondary).
 * - IQR fence: flags values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR]
 * - Z-Score: additionally flags values with |z| > 2.5
 *
 * Requires at least 3 values; fewer values always return non-outlier.
 */
export function detectOutliers(values: number[]): OutlierResult[] {
  if (values.length < 3) {
    return values.map(() => ({ isOutlier: false, reason: null }));
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  const m = mean(values);
  const sd = stdDev(values, m);

  return values.map((v) => {
    const iqrFlag = v < lower || v > upper;
    const zScore = sd > 0 ? Math.abs((v - m) / sd) : 0;
    const zFlag = zScore > 2.5;

    if (!iqrFlag && !zFlag) return { isOutlier: false, reason: null };

    const reasons: string[] = [];
    if (iqrFlag)
      reasons.push(
        `IQR-Ausreißer [Grenze: ${lower.toFixed(1)}–${upper.toFixed(1)} g]`
      );
    if (zFlag) reasons.push(`Z-Score: ${zScore.toFixed(1)}`);
    return { isOutlier: true, reason: reasons.join("; ") };
  });
}
