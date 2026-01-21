/**
 * Format money amount with currency symbol
 */
export function formatMoney(amount: number | string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

/**
 * Format pence as money (divide by 100)
 */
export function formatPence(pence: number | string): string {
  return formatMoney(Number(pence) / 100);
}

/**
 * Format decimal odds (e.g., 2.5, 3.0) - DEPRECATED
 */
export function formatOdds(odds: number | string): string {
  return Number(odds).toFixed(2);
}

/**
 * Format probability points (1-9,999,999) as percentage (0-100%)
 * PRICE_SCALE = 10,000,000, so divide by 100,000 to get percentage
 * e.g., 5,000,000 pPts = 50.0000%
 */
export function formatProbability(pPts: number | string): string {
  const probability = Number(pPts) / 100_000;
  return `${probability.toFixed(4)}%`;
}

/**
 * Convert probability percentage (0-100) to probability points (1-9,999,999)
 * PRICE_SCALE = 10,000,000, so multiply by 100,000
 * e.g., 50% = 5,000,000 pPts
 */
export function percentageToPPts(percentage: number): number {
  return Math.round(percentage * 100_000);
}

/**
 * Convert probability points to percentage (0-100)
 * PRICE_SCALE = 10,000,000, so divide by 100,000
 */
export function pPtsToPercentage(pPts: number): number {
  return pPts / 100_000;
}

/**
 * Format percentage
 */
export function formatPercent(value: number | string): string {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

/**
 * Format date/time
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

/**
 * Calculate implied probability from decimal odds
 */
export function oddsToProb(odds: number): number {
  return 1 / odds;
}

/**
 * Calculate decimal odds from probability
 */
export function probToOdds(prob: number): number {
  return 1 / prob;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
