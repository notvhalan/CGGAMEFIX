// ============================================================
// Ladder Markets — Type Definitions
// ============================================================

/** A maturity point inside a ladder (one child market) */
export interface LadderPoint {
  marketId: string;
  maturity: string;            // ISO timestamp
  instrumentSymbol: string | null;
  rawYes: number | null;       // mid-price in %, e.g. 27.0
  fittedYes: number;           // monotone-fitted cumulative %
  intervalProb: number;        // incremental probability for this bucket
  violated: boolean;           // true if raw < previous raw
  bestBidYes: number | null;   // in % (0–100)
  bestAskYes: number | null;
  lastTradeYes: number | null;
  openInterestPence: number;
  volume24hPence: number;
}

/** A tradeable interval between two adjacent maturities */
export interface LadderInterval {
  startMaturity: string | null; // null for "up to first"
  endMaturity: string;
  label: string;               // e.g. "23 Mar → 24 Mar"
  price: number;               // synthetic interval price in %
  buyLegs: IntervalLeg[];
  sellLegs: IntervalLeg[];
}

/** One leg of an interval spread */
export interface IntervalLeg {
  marketId: string;
  side: 'BUY_YES' | 'SELL_YES';
  ratio: number;               // always 1 for simple intervals
}

/** Full ladder response for GET /ladder/:groupSlug */
export interface LadderResponse {
  groupId: string;
  slug: string;
  title: string;
  eventKey: string;
  category: string;
  description: string | null;
  resolutionSource: string | null;
  pointCount: number;
  points: LadderPoint[];
  intervals: LadderInterval[];
}

/** Interval order request body */
export interface IntervalOrderRequest {
  startMaturity: string | null;  // ISO, null means "up to endMaturity"
  endMaturity: string;           // ISO
  direction: 'BUY' | 'SELL';
  contracts: number;             // in whole contracts
  executionMode: 'quote_only' | 'submit';
}

/** Interval order quote response */
export interface IntervalQuoteResponse {
  synthetic: true;
  intervalLabel: string;
  netPricePercent: number;      // interval price in %
  direction: 'BUY' | 'SELL';
  contracts: number;
  netDebitPence: number;
  legs: {
    marketId: string;
    maturity: string;
    side: 'BUY_YES' | 'SELL_YES';
    qtyMicros: number;
    limitPricePts: number;      // in PRICE_SCALE units
    estimatedRiskPence: number;
  }[];
  warning: string;
}

/** Interval order execution response */
export interface IntervalExecutionResponse extends IntervalQuoteResponse {
  syntheticOrderId: string;
  status: 'FILLED' | 'PARTIAL' | 'FAILED';
  legs: (IntervalQuoteResponse['legs'][number] & {
    engineOrderId: string | null;
    fillStatus: 'FILLED' | 'PARTIAL' | 'FAILED' | 'PENDING';
    filledQtyMicros: number;
  })[];
}
