// ============================================================
// Ladder Markets — Math Utilities
// ============================================================
// PAVA monotone curve fitting + interval probability calculation
// ============================================================

/**
 * Pool Adjacent Violators Algorithm (PAVA)
 *
 * Given an array of raw cumulative YES values, returns a monotone
 * non-decreasing sequence by merging adjacent violators with a
 * weighted average.
 *
 * Input/output are in percentage points (0–100).
 */
export function fitMonotoneNonDecreasing(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [...values];

  interface Block {
    start: number;
    end: number;
    weight: number;
    value: number;
  }

  const blocks: Block[] = values.map((v, i) => ({
    start: i,
    end: i,
    weight: 1,
    value: v,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].value <= blocks[i + 1].value) {
      i++;
      continue;
    }

    // Merge violating pair
    const left = blocks[i];
    const right = blocks[i + 1];
    const mergedWeight = left.weight + right.weight;
    const mergedValue =
      (left.value * left.weight + right.value * right.weight) / mergedWeight;

    blocks.splice(i, 2, {
      start: left.start,
      end: right.end,
      weight: mergedWeight,
      value: mergedValue,
    });

    // Step back to check previous block
    if (i > 0) i--;
  }

  // Expand blocks back to per-element array
  const result: number[] = new Array(values.length);
  for (const block of blocks) {
    for (let j = block.start; j <= block.end; j++) {
      result[j] = block.value;
    }
  }
  return result;
}

/**
 * Compute interval probabilities from fitted cumulative values.
 *
 * I[0] = C[0]
 * I[i] = C[i] - C[i-1]  for i > 0
 *
 * Results are clamped to be >= 0 (shouldn't happen after PAVA but just in case).
 */
export function computeIntervalProbabilities(fittedCumulative: number[]): number[] {
  if (fittedCumulative.length === 0) return [];
  const intervals: number[] = [fittedCumulative[0]];
  for (let i = 1; i < fittedCumulative.length; i++) {
    intervals.push(Math.max(0, fittedCumulative[i] - fittedCumulative[i - 1]));
  }
  return intervals;
}

/**
 * Derive a raw YES probability from orderbook data.
 *
 * Priority:
 *   1. Mid of best bid & ask
 *   2. Last trade price
 *   3. Best bid only
 *   4. Best ask only
 *   5. null (no data)
 *
 * All inputs/output in integer price-scale units (PRICE_SCALE = 10_000_000).
 * Callers convert to percentage by dividing by 100_000.
 */
export function deriveRawYesPts(
  bestBidYesPts: number | null,
  bestAskYesPts: number | null,
  lastTradeYesPts: number | null,
): number | null {
  if (bestBidYesPts != null && bestAskYesPts != null) {
    return Math.round((bestBidYesPts + bestAskYesPts) / 2);
  }
  if (lastTradeYesPts != null) return lastTradeYesPts;
  if (bestBidYesPts != null) return bestBidYesPts;
  if (bestAskYesPts != null) return bestAskYesPts;
  return null;
}

/**
 * Convert price_scale pts (0 – 10_000_000) to percentage (0 – 100).
 */
export function ptsToPercent(pts: number): number {
  return pts / 100_000;
}

/**
 * Convert percentage (0-100) to price_scale pts.
 */
export function percentToPts(pct: number): number {
  return Math.round(pct * 100_000);
}

/**
 * Format a maturity date into a short label like "23 Mar".
 */
export function formatMaturityLabel(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/**
 * Build interval label from two maturities.
 */
export function buildIntervalLabel(
  startMaturity: string | null,
  endMaturity: string,
): string {
  if (!startMaturity) {
    return `Up to ${formatMaturityLabel(endMaturity)}`;
  }
  return `${formatMaturityLabel(startMaturity)} → ${formatMaturityLabel(endMaturity)}`;
}
