import { Form } from '@remix-run/react';
import { formatPence, formatProbability } from '~/lib/format';
import { useState, useEffect, useCallback } from 'react';
import type { Position } from './PositionPanel';
import { getWSClient } from '~/lib/ws.client';

// Get API URL from window.ENV or default to localhost
const getApiUrl = () => {
  const normalizeApiUrl = (rawUrl: string) => {
    const candidate = (rawUrl || '').trim();
    if (!candidate) return 'http://localhost:3000';
    try {
      const url = new URL(candidate);
      const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
      if (!isLocalHost && url.protocol === 'http:') {
        url.protocol = 'https:';
      }
      return url.toString().replace(/\/$/, '');
    } catch {
      return candidate.replace(/\/$/, '');
    }
  };

  if (typeof window !== 'undefined') {
    // First try window.ENV
    if ((window as any).ENV?.API_URL) {
      return normalizeApiUrl((window as any).ENV.API_URL);
    }
    // Fall back to production API origin for gamefix domains.
    if (window.location.hostname.includes('gamefix.fun')) {
      return 'https://api.gamefix.fun';
    }
  }
  return 'http://localhost:3000';
};

interface PositionsModalProps {
  position: Position;
  isOpen: boolean;
  onClose: () => void;
  onCashoutSuccess?: () => void;
  marketId: string;
  orderBook?: any;
}

interface CashoutQuote {
  success: boolean;
  error?: string;
  netValuePence: number; // New: net value after fees
  avgYesPts: number;
  filledContractsMicros: string; // New: how much can be filled from book
  unfilledContractsMicros: string; // New: remainder that won't fill
  costPence: number; // New: total cost before fees
  estimatedFeePence: number;
  quoteTimestamp: number;
}

interface CashoutExecuteRequest {
  marketId: string;
  netContractsMicros: string;
  maxSlippagePts: number;
  lotIds?: string[];
  closeMode?: 'ioc' | 'limit';
  limitYesPts?: number;
}

interface InlineNotice {
  type: 'success' | 'error' | 'info';
  message: string;
}

export function PositionsModal({ position, isOpen, onClose, onCashoutSuccess, marketId, orderBook }: PositionsModalProps) {
  const [closeMode, setCloseMode] = useState<'ioc' | 'limit'>('ioc');
  const [limitPrice, setLimitPrice] = useState('');
  const [sizeMode, setSizeMode] = useState<'all' | 'partial'>('all');
  const [partialPercent, setPartialPercent] = useState(100);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [cashoutQuote, setCashoutQuote] = useState<CashoutQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [executingCashout, setExecutingCashout] = useState(false);
  const [cashoutSubmitted, setCashoutSubmitted] = useState(false);
  const [groupQuotes, setGroupQuotes] = useState<Map<string, CashoutQuote>>(new Map());
  const [loadingGroupQuotes, setLoadingGroupQuotes] = useState<Set<string>>(new Set());
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);
  const [sideFilter, setSideFilter] = useState<'all' | 'buy_yes' | 'sell_yes'>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'individual'>('grouped');
  
  // Live orderbook prices via WebSocket (initialize from orderBook prop)
  const [liveBestBid, setLiveBestBid] = useState<number>(() => {
    const bids = orderBook?.bids || [];
    return bids[0]?.yesPts || 0;
  });
  const [liveBestAsk, setLiveBestAsk] = useState<number>(() => {
    const asks = orderBook?.asks || [];
    return asks[0]?.yesPts || 0;
  });

  // Extract position data (use fallback values if position is null)
  const { netYesPence, avgEntryYesPts, markYesPts, unrealizedPnlPence, totalFeesPence, buyPositions, sellPositions, netContractsMicros: netContractsMicrosStr } = position || {
    netYesPence: 0,
    avgEntryYesPts: 0,
    markYesPts: 0,
    unrealizedPnlPence: 0,
    totalFeesPence: 0,
    buyPositions: [],
    sellPositions: [],
    netContractsMicros: '0'
  };
  
  // Convert string to BigInt
  const netContractsMicros = typeof netContractsMicrosStr === 'string' 
    ? BigInt(netContractsMicrosStr) 
    : netContractsMicrosStr;

  useEffect(() => {
    setCashoutSubmitted(false);
  }, [netContractsMicrosStr, marketId, isOpen]);

  // Position direction is based on contracts, not cashflow!
  const isLong = netContractsMicros > 0n;
  const positionSize = Math.abs(netYesPence);
  const avgEntryPercent = avgEntryYesPts / 100_000;
  const markPercent = markYesPts / 100_000;

  // Position state should be driven by net contracts, not lot array presence.
  const absNetContractsMicros = netContractsMicros < 0n ? -netContractsMicros : netContractsMicros;
  const hasOpenPositions = netContractsMicros !== 0n;
  const syntheticPricePts = avgEntryYesPts > 0 ? avgEntryYesPts : markYesPts;
  const syntheticSizePence = Number(
    (BigInt(syntheticPricePts) * absNetContractsMicros * 100n) / (10_000_000n * 1_000_000n)
  );
  const netSign = netContractsMicros > 0n ? 1n : (netContractsMicros < 0n ? -1n : 0n);

  const toAbs = (value: bigint) => (value < 0n ? -value : value);
  const toAbsContracts = (pos: any) => {
    const raw = BigInt(pos?.contractsMicros ?? '0');
    return toAbs(raw);
  };

  const toIso = (value: any) => {
    const candidate = value ?? new Date().toISOString();
    const date = new Date(candidate);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  };

  const canonicalizePositions = (positions: any[], sign: bigint) => {
    return positions.map((pos) => {
      const absContracts = toAbsContracts(pos);
      const signedContracts = sign >= 0n ? absContracts : -absContracts;
      const executedAt = toIso(pos?.executedAt ?? pos?.timestamp);
      return {
        ...pos,
        yesPricePts: Number(pos?.yesPricePts ?? syntheticPricePts),
        sizePence: Number(pos?.sizePence ?? 0),
        feePence: Number(pos?.feePence ?? 0),
        executedAt,
        contractsMicros: signedContracts.toString(),
      };
    });
  };

  // Reconcile row-level lots to authoritative net contracts while preserving individual entries.
  const reconcileLotsToNet = (positions: any[], sign: bigint, targetAbsContracts: bigint) => {
    let remaining = targetAbsContracts;
    const reconciled: any[] = [];

    for (const pos of positions) {
      if (remaining <= 0n) break;
      const absContracts = toAbsContracts(pos);
      if (absContracts <= 0n) continue;

      const keepContracts = absContracts < remaining ? absContracts : remaining;
      const scaledSizePence = absContracts > 0n
        ? Number((BigInt(Math.max(0, Number(pos.sizePence || 0))) * keepContracts) / absContracts)
        : 0;

      reconciled.push({
        ...pos,
        sizePence: scaledSizePence,
        contractsMicros: (sign * keepContracts).toString(),
      });
      remaining -= keepContracts;
    }

    // If we still have missing quantity, append one residual row instead of replacing all rows.
    if (remaining > 0n && sign !== 0n) {
      const residualSizePence = Number(
        (BigInt(syntheticPricePts) * remaining * 100n) / (10_000_000n * 1_000_000n)
      );
      reconciled.push({
        sizePence: residualSizePence,
        yesPricePts: syntheticPricePts,
        feePence: 0,
        executedAt: new Date().toISOString(),
        contractsMicros: (sign * remaining).toString(),
      });
    }

    return reconciled;
  };

  // Treat BUY YES and SELL YES as completely independent buckets — never subtract one from the other
  const canonicalBuyRows = canonicalizePositions(buyPositions || [], 1n);
  const canonicalSellRows = canonicalizePositions(sellPositions || [], -1n);

  // Fetch cashout quote
  const fetchCashoutQuote = useCallback(async () => {
    if (!hasOpenPositions) {
      setCashoutQuote(null);
      return;
    }

    if (!marketId || netContractsMicros === undefined || netContractsMicros === null) {
      setCashoutQuote(null);
      return;
    }

    setLoadingQuote(true);
    try {
      const requestedContracts = applyPartial(netContractsMicros);
      if (requestedContracts === 0n) {
        setCashoutQuote(null);
        return;
      }

      const body = {
        marketId,
        netContractsMicros: requestedContracts.toString(),
      };
      
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/cashout/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quote: ${response.statusText}`);
      }

      const quote = await response.json();
      setCashoutQuote(quote);
    } catch {
      setCashoutQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }, [marketId, hasOpenPositions, netContractsMicros, sizeMode, partialPercent]);

  // Fetch quote on mount and refresh every 5 seconds
  useEffect(() => {
    if (isOpen && !executingCashout && !cashoutSubmitted) {
      fetchCashoutQuote();
      const interval = setInterval(fetchCashoutQuote, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, executingCashout, cashoutSubmitted, fetchCashoutQuote]);

  // Auto-dismiss inline notices.
  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => setInlineNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  useEffect(() => {
    setCashoutQuote(null);
    setGroupQuotes(new Map());
    setInlineNotice(null);
  }, [marketId, sizeMode, partialPercent, viewMode]);

  // WebSocket subscription for live orderbook prices
  useEffect(() => {
    if (!isOpen || !marketId) return;

    const ws = getWSClient();
    ws.connect();
    
    const bookTopic = `book:${marketId}`;
    ws.subscribe(bookTopic);

    const handleBookUpdate = (data: any) => {
      // Extract best bid and ask from orderbook
      const bids = data?.bids || data?.orderBook?.bids || [];
      const asks = data?.asks || data?.orderBook?.asks || [];
      
      const bestBid = bids[0]?.yesPts || 0;
      const bestAsk = asks[0]?.yesPts || 0;
      
      setLiveBestBid(bestBid);
      setLiveBestAsk(bestAsk);
    };

    ws.on('book_update', handleBookUpdate);

    return () => {
      ws.off('book_update', handleBookUpdate);
      ws.unsubscribe(bookTopic);
    };
  }, [isOpen, marketId]);

  // Fetch cashout quote for a specific group
  // groupKey = `${side}-${yesPricePts}` — unique per side+price bucket
  const fetchGroupQuote = useCallback(async (groupKey: string, side: 'BUY_YES' | 'SELL_YES', totalContractsMicros: bigint) => {
    setLoadingGroupQuotes(prev => new Set(prev).add(groupKey));
    try {
      // For BUY_YES lots: closing them means placing SELL_YES → send positive contracts
      // For SELL_YES lots: closing them means placing BUY_YES → send negative contracts
      const signed = applyPartial(toSignedContracts(side, totalContractsMicros));
      if (signed === 0n) {
        setInlineNotice({ type: 'error', message: 'No contracts available to close in this group.' });
        return;
      }
      
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/cashout/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          netContractsMicros: signed.toString(),
        }),
      });

      if (!response.ok) throw new Error(`Failed to fetch quote: ${response.statusText}`);

      const quote = await response.json();
      setGroupQuotes(prev => new Map(prev).set(groupKey, quote));
    } catch {
      setInlineNotice({ type: 'error', message: 'Unable to fetch a quote for this position group.' });
    } finally {
      setLoadingGroupQuotes(prev => {
        const next = new Set(prev);
        next.delete(groupKey);
        return next;
      });
    }
  }, [marketId, sizeMode, partialPercent]);

  // Group positions by yesPricePts
  const groupPositions = (positions: any[]) => {
    const groups = new Map<number, { positions: any[], totalSizePence: number, totalContractsMicros: bigint }>();
    
    for (const pos of positions) {
      const key = pos.yesPricePts;
      if (!groups.has(key)) {
        groups.set(key, { positions: [], totalSizePence: 0, totalContractsMicros: 0n });
      }
      const group = groups.get(key)!;
      group.positions.push(pos);
      group.totalSizePence += pos.sizePence;
      
      // Use actual contracts from backend (already in micros)
      const contractsMicros = BigInt(pos.contractsMicros || '0');
      group.totalContractsMicros += contractsMicros;
    }
    
    // Sort by yesPricePts descending
    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([yesPricePts, data]) => ({ yesPricePts, ...data }));
  };

  const groupedBuyPositions = groupPositions(canonicalBuyRows);
  const groupedSellPositions = groupPositions(canonicalSellRows);

  const executeCashoutRequest = useCallback(async (requestBody: CashoutExecuteRequest) => {
    setExecutingCashout(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/cashout/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`Failed to execute cashout: ${response.statusText}`);

      const result = await response.json();
      if (result.success) {
        setCashoutSubmitted(true);
        setInlineNotice({
          type: 'success',
          message: `Close order submitted (${result.orderId?.slice(0, 8) || 'ok'}). Position is refreshing...`,
        });
        onCashoutSuccess?.();
      } else {
        setInlineNotice({
          type: 'error',
          message: `Close failed: ${result.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setInlineNotice({
        type: 'error',
        message: `Close failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setExecutingCashout(false);
    }
  }, [onCashoutSuccess]);

  // Apply partial percent to a bigint quantity, rounding to nearest tick (1000 micros = 0.001 ctr).
  const applyPartial = (qty: bigint): bigint => {
    if (sizeMode !== 'partial' || partialPercent >= 100) return qty;
    const pct = Math.max(1, Math.min(100, partialPercent));
    const abs = qty < 0n ? -qty : qty;
    const sign = qty < 0n ? -1n : 1n;
    let scaled = (abs * BigInt(pct)) / 100n;
    // Round to nearest 1000 micros (0.001 contracts) to avoid dust
    const TICK = 1000n;
    scaled = ((scaled + TICK / 2n) / TICK) * TICK;
    if (scaled < TICK) scaled = TICK; // minimum 0.001 contracts
    return sign * scaled;
  };

  const toSignedContracts = (side: 'BUY_YES' | 'SELL_YES', totalContractsMicros: bigint) => {
    const abs = totalContractsMicros < 0n ? -totalContractsMicros : totalContractsMicros;
    return side === 'BUY_YES' ? abs : -abs;
  };

  const formatContracts = (contractsMicros: bigint) => {
    return (Number(contractsMicros) / 1_000_000).toFixed(2);
  };

  // Build common limit fields when in limit mode.
  const buildLimitFields = (): Pick<CashoutExecuteRequest, 'closeMode' | 'limitYesPts'> => {
    if (closeMode !== 'limit' || !limitPrice) return {};
    const pricePct = parseFloat(limitPrice);
    if (Number.isNaN(pricePct) || pricePct <= 0 || pricePct >= 100) return {};
    return { closeMode: 'limit', limitYesPts: Math.round(pricePct * 100_000) };
  };

  // Submit full-position close immediately (no browser popup/confirm).
  const handleCashout = async () => {
    if (closeMode === 'limit') {
      const pricePct = parseFloat(limitPrice);
      if (Number.isNaN(pricePct) || pricePct <= 0 || pricePct >= 100) {
        setInlineNotice({ type: 'error', message: 'Enter a valid limit price between 0 and 100%.' });
        return;
      }
    } else if (!cashoutQuote || !cashoutQuote.success) {
      setInlineNotice({ type: 'error', message: 'No valid quote available yet.' });
      return;
    }
    const qty = applyPartial(netContractsMicros);
    if (qty === 0n) {
      setInlineNotice({ type: 'error', message: 'No contracts available to close.' });
      return;
    }
    await executeCashoutRequest({
      marketId,
      netContractsMicros: qty.toString(),
      maxSlippagePts: 100000,
      ...buildLimitFields(),
    });
  };

  // Submit grouped close immediately (closes this group only).
  const handleGroupCashout = async (
    groupKey: string,
    side: 'BUY_YES' | 'SELL_YES',
    totalContractsMicros: bigint,
    positions: any[]
  ) => {
    if (closeMode === 'limit') {
      const pricePct = parseFloat(limitPrice);
      if (Number.isNaN(pricePct) || pricePct <= 0 || pricePct >= 100) {
        setInlineNotice({ type: 'error', message: 'Enter a valid limit price between 0 and 100%.' });
        return;
      }
    } else {
      const quote = groupQuotes.get(groupKey);
      if (!quote || !quote.success) {
        setInlineNotice({ type: 'error', message: 'No valid quote for this group. Get quote first.' });
        return;
      }
    }
    const abs = totalContractsMicros < 0n ? -totalContractsMicros : totalContractsMicros;
    // BUY_YES lots are closed by selling → positive micros (SELL_YES order)
    // SELL_YES lots are closed by buying → negative micros (BUY_YES order)
    const fullSigned = toSignedContracts(side, totalContractsMicros);
    const signed = applyPartial(fullSigned);
    if (signed === 0n) {
      setInlineNotice({ type: 'error', message: 'No contracts available to close in this group.' });
      return;
    }
    // Collect lot IDs so the server targets these specific lots instead of FIFO
    const lotIds = positions
      .map((p: any) => p.lotId)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
    await executeCashoutRequest({
      marketId,
      netContractsMicros: signed.toString(),
      maxSlippagePts: 100000,
      ...(lotIds.length > 0 ? { lotIds } : {}),
      ...buildLimitFields(),
    });
  };

  // Early return AFTER all hooks have been called
  if (!isOpen) return null;

  // Combine all positions for grouped view — each group has a unique key = `${side}-${yesPricePts}`
  const allGroups = [
    ...groupedBuyPositions.map(g => ({ ...g, side: 'BUY_YES' as const, key: `BUY_YES-${g.yesPricePts}` })),
    ...groupedSellPositions.map(g => ({ ...g, side: 'SELL_YES' as const, key: `SELL_YES-${g.yesPricePts}` })),
  ].filter(g => {
    // Drop dust groups that would display as 0.00
    const absContracts = g.totalContractsMicros < 0n ? -g.totalContractsMicros : g.totalContractsMicros;
    if (absContracts < 5000n) return false;
    if (sideFilter === 'buy_yes') return g.side === 'BUY_YES';
    if (sideFilter === 'sell_yes') return g.side === 'SELL_YES';
    return true;
  }).sort((a, b) => {
    if (a.side !== b.side) return a.side === 'BUY_YES' ? -1 : 1;
    return b.yesPricePts - a.yesPricePts;
  });

  // Grouped view: one aggregated row per side (total all lots into one position per side)
  type SideAgg = { side: 'BUY_YES' | 'SELL_YES'; key: string; totalContractsMicros: bigint; totalSizePence: number; yesPricePts: number; positions: any[]; count: number; };

  const buildSideAggregate = (rows: any[], side: 'BUY_YES' | 'SELL_YES'): SideAgg | null => {
    // Filter out dust lots before aggregating
    const meaningful = rows.filter((p: any) => Math.abs(Number(p.contractsMicros || '0')) >= 5000);
    if (meaningful.length === 0) return null;
    const totalContractsNum = meaningful.reduce((s: number, p: any) => s + Math.abs(Number(p.contractsMicros || '0')), 0);
    const totalContractsMicros = BigInt(Math.round(totalContractsNum));
    // Drop if total rounds to 0.00 at 2dp (< 0.005 contracts = 5000 micros)
    if (totalContractsMicros < 5000n) return null;
    const totalSizePence = meaningful.reduce((s: number, p: any) => s + (p.sizePence || 0), 0);
    const weightedPriceSum = meaningful.reduce((s: number, p: any) => {
      const c = Math.abs(Number(p.contractsMicros || '0'));
      return s + (p.yesPricePts || 0) * c;
    }, 0);
    const yesPricePts = totalContractsNum > 0 ? Math.round(weightedPriceSum / totalContractsNum) : 0;
    return { side, key: side, totalContractsMicros, totalSizePence, yesPricePts, positions: meaningful, count: meaningful.length };
  };

  const buyAgg = buildSideAggregate(canonicalBuyRows, 'BUY_YES');
  const sellAgg = buildSideAggregate(canonicalSellRows, 'SELL_YES');

  // Compute PnL for a single position group.
  // BUY YES: you paid `cost`, close value is what you receive when selling.
  // SELL YES: you received `cost`, close value is what you pay to buy back.
  // Uses the cashout quote for the group if one has been fetched; otherwise
  // falls back to theoretical mark-to-market (contracts × markPercent pence).
  const calcSidePnl = (
    side: 'BUY_YES' | 'SELL_YES',
    contracts: number,
    cost: number,
    quoteKey: string
  ): number => {
    const q = groupQuotes.get(quoteKey);
    const closeVal =
      q && q.success
        ? Math.abs(Number(q.netValuePence))
        : contracts * markPercent; // pence at mark price
    return side === 'BUY_YES' ? closeVal - cost : cost - closeVal;
  };

  // Total unrealized PnL = BUY_YES PnL + SELL_YES PnL (computed independently).
  // This is correct regardless of whether the net position is long, short, or mixed.
  const computedUnrealizedPnlPence = Math.round(
    (buyAgg
      ? calcSidePnl(
          'BUY_YES',
          Number(buyAgg.totalContractsMicros) / 1_000_000,
          buyAgg.totalSizePence,
          buyAgg.key
        )
      : 0) +
    (sellAgg
      ? calcSidePnl(
          'SELL_YES',
          Number(sellAgg.totalContractsMicros) / 1_000_000,
          sellAgg.totalSizePence,
          sellAgg.key
        )
      : 0)
  );

  const aggregatedRows: SideAgg[] = ([buyAgg, sellAgg] as (SideAgg | null)[]).filter((agg): agg is SideAgg => {
    if (!agg) return false;
    if (sideFilter === 'buy_yes') return agg.side === 'BUY_YES';
    if (sideFilter === 'sell_yes') return agg.side === 'SELL_YES';
    return true;
  });

  // Individual view uses allGroups (per-price-bucket rows); grouped uses aggregatedRows (one row per side)
  const activeGroup = selectedGroup !== null
    ? (viewMode === 'grouped'
        ? aggregatedRows.find(g => g.key === selectedGroup)
        : allGroups.find(g => g.key === selectedGroup))
    : null;

  const requestedNetContracts = applyPartial(netContractsMicros);
  const activeGroupContracts = activeGroup
    ? applyPartial(toSignedContracts(activeGroup.side, activeGroup.totalContractsMicros))
    : null;
  const activeQuote = activeGroup ? groupQuotes.get(activeGroup.key) ?? null : cashoutQuote;
  const activeQuoteLoading = activeGroup ? loadingGroupQuotes.has(activeGroup.key) : loadingQuote;
  const limitPriceValue = parseFloat(limitPrice);
  const hasValidLimitPrice = !Number.isNaN(limitPriceValue) && limitPriceValue > 0 && limitPriceValue < 100;
  const canSubmitMarketClose = activeGroup
    ? !!activeQuote?.success && activeGroupContracts !== null && activeGroupContracts !== 0n
    : !!cashoutQuote?.success && requestedNetContracts !== 0n;
  const canSubmitLimitClose = activeGroup
    ? hasValidLimitPrice && activeGroupContracts !== null && activeGroupContracts !== 0n
    : hasValidLimitPrice && requestedNetContracts !== 0n;
  const canSubmitClose = !executingCashout && (closeMode === 'limit' ? canSubmitLimitClose : canSubmitMarketClose);

  const toggleRowExpand = (key: string) => {
    const next = new Set(expandedRows);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedRows(next);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          zIndex: 999,
          backdropFilter: 'blur(4px)'
        }}
      />

      {/* Modal - Terminal Style */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#0d1117',
        borderRadius: '8px',
        border: '1px solid #30363d',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        zIndex: 1000,
        width: '85vw',
        maxWidth: '1400px',
        height: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Terminal Header */}
        <div style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#161b22',
          flexShrink: 0
        }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c9d1d9', fontFamily: 'monospace' }}>
            POSITIONS — {position ? 'Market Position' : 'No Position'}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '0 0.5rem',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Status Strip */}
        <div style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          gap: '1.5rem',
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          background: '#0d1117',
          flexShrink: 0
        }}>
          {canonicalBuyRows.length > 0 && (
            <div>
              <span style={{ color: '#8b949e' }}>BUY YES:</span>{' '}
              <span style={{ color: '#3fb950', fontWeight: 600 }}>
                {canonicalBuyRows.reduce((s: number, p: any) => s + Math.abs(Number(p.contractsMicros)) / 1_000_000, 0).toFixed(2)} ctr
              </span>
            </div>
          )}
          {canonicalSellRows.length > 0 && (
            <div>
              <span style={{ color: '#8b949e' }}>SELL YES:</span>{' '}
              <span style={{ color: '#f85149', fontWeight: 600 }}>
                {canonicalSellRows.reduce((s: number, p: any) => s + Math.abs(Number(p.contractsMicros)) / 1_000_000, 0).toFixed(2)} ctr
              </span>
            </div>
          )}
          <div>
            <span style={{ color: '#8b949e' }}>Net:</span>{' '}
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>
              {(Number(netContractsMicros) / 1_000_000).toFixed(2)}
            </span>
          </div>
          <div>
            <span style={{ color: '#8b949e' }}>Avg Entry:</span>{' '}
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>
              {avgEntryPercent.toFixed(2)}%
            </span>
          </div>
          <div>
            <span style={{ color: '#8b949e' }}>Mark:</span>{' '}
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>
              {markPercent.toFixed(2)}%
            </span>
          </div>
          <div>
            <span style={{ color: '#8b949e' }}>Unrealized P&L:</span>{' '}
            <span style={{ 
              color: computedUnrealizedPnlPence >= 0 ? '#3fb950' : '#f85149',
              fontWeight: 700
            }}>
              {computedUnrealizedPnlPence >= 0 ? '+' : ''}{formatPence(computedUnrealizedPnlPence)}
            </span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{ color: '#8b949e' }}>Fees:</span>{' '}
            <span style={{ color: '#6e7681' }}>
              {formatPence(totalFeesPence)}
            </span>
          </div>
        </div>

        {/* 2-Pane Split */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(650px, 1fr) 420px',
          overflow: 'hidden'
        }}>
          {/* LEFT PANE - Positions Blotter */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #30363d',
            overflow: 'hidden'
          }}>
            {/* Filter Controls */}
            <div style={{
              padding: '0.5rem 1rem',
              borderBottom: '1px solid #30363d',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              background: '#161b22',
              flexShrink: 0
            }}>
              <div style={{ fontSize: '0.75rem', color: '#8b949e', marginRight: '0.25rem' }}>Filter:</div>
              <button
                onClick={() => setSideFilter('all')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: sideFilter === 'all' ? '#238636' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: sideFilter === 'all' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                All
              </button>
              <button
                onClick={() => setSideFilter('buy_yes')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: sideFilter === 'buy_yes' ? '#1f6feb' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: sideFilter === 'buy_yes' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                BUY YES
              </button>
              <button
                onClick={() => setSideFilter('sell_yes')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: sideFilter === 'sell_yes' ? '#da3633' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: sideFilter === 'sell_yes' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                SELL YES
              </button>
              <div style={{ width: '1px', height: '1rem', background: '#30363d', margin: '0 0.25rem' }} />
              <button
                onClick={() => setViewMode('grouped')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: viewMode === 'grouped' ? '#238636' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: viewMode === 'grouped' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                Grouped
              </button>
              <button
                onClick={() => setViewMode('individual')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: viewMode === 'individual' ? '#238636' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: viewMode === 'individual' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                Individual
              </button>
            </div>

            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '60px 80px 90px 80px 80px 90px 60px 80px',
              padding: '0.5rem 1rem',
              borderBottom: '1px solid #30363d',
              fontSize: '0.7rem',
              color: '#8b949e',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: '#161b22',
              fontFamily: 'monospace',
              flexShrink: 0
            }}>
              <div>Side</div>
              <div>Entry</div>
              <div>Contracts</div>
              <div>Cost</div>
              <div>Mark</div>
              <div style={{ textAlign: 'right' }}>P&L</div>
              <div style={{ textAlign: 'center' }}>Fills</div>
              <div style={{ textAlign: 'center' }}>Actions</div>
            </div>

            {/* Table Body - Scrollable */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: '#30363d #0d1117'
            }}
            className="positions-scroll">
              {viewMode === 'grouped' ? aggregatedRows.map((agg) => {
                const isSelected = selectedGroup === agg.key;
                const avgEntry = agg.yesPricePts / 100_000;
                const contracts = Number(agg.totalContractsMicros) / 1_000_000;
                const cost = agg.totalSizePence;
                const pnl = calcSidePnl(agg.side, contracts, cost, agg.key);
                return (
                  <div
                    key={agg.key}
                    onClick={() => setSelectedGroup(isSelected ? null : agg.key)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 80px 90px 80px 80px 90px 60px 80px',
                      padding: '0.6rem 1rem',
                      borderBottom: '1px solid #21262d',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      background: isSelected ? '#1c2128' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#161b22'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ color: agg.side === 'BUY_YES' ? '#3fb950' : '#f85149', fontWeight: 700 }}>
                      {agg.side === 'BUY_YES' ? 'BUY YES' : 'SELL YES'}
                    </div>
                    <div style={{ color: '#c9d1d9' }}>{avgEntry.toFixed(2)}%</div>
                    <div style={{ color: '#c9d1d9', fontWeight: 700, fontSize: '0.8rem' }}>{contracts.toFixed(2)}</div>
                    <div style={{ color: '#8b949e' }}>{formatPence(cost)}</div>
                    <div style={{ color: '#c9d1d9' }}>{markPercent.toFixed(2)}%</div>
                    <div style={{ textAlign: 'right', color: pnl >= 0 ? '#3fb950' : '#f85149', fontWeight: 700 }}>
                      {pnl >= 0 ? '+' : ''}{formatPence(pnl)}
                    </div>
                    <div style={{ textAlign: 'center', color: '#6e7681' }}>{agg.count}</div>
                    <div style={{ textAlign: 'center', color: isSelected ? '#3fb950' : '#6e7681', fontSize: '0.65rem', fontWeight: isSelected ? 700 : 400 }}>
                      {isSelected ? '✓ SEL' : 'SELECT'}
                    </div>
                  </div>
                );
              }) : allGroups.map((group) => {
                const isSelected = selectedGroup === group.key;
                const isExpanded = expandedRows.has(group.key);
                const avgEntry = group.yesPricePts / 100_000;
                const contracts = Math.abs(Number(group.totalContractsMicros) / 1_000_000);
                const cost = group.totalSizePence;
                const pnl = calcSidePnl(group.side, contracts, cost, group.key);

                return (
                  <div key={group.key}>
                    {/* Main Row */}
                    <div
                      onClick={() => setSelectedGroup(isSelected ? null : group.key)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 80px 90px 80px 80px 90px 60px 80px',
                        padding: '0.4rem 1rem',
                        borderBottom: '1px solid #21262d',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        background: isSelected ? '#1c2128' : 'transparent',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = '#161b22';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{
                        color: group.side === 'BUY_YES' ? '#3fb950' : '#f85149',
                        fontWeight: 600
                      }}>
                        {group.side === 'BUY_YES' ? 'BUY YES' : 'SELL YES'}
                      </div>
                      <div style={{ color: '#c9d1d9' }}>
                        {avgEntry.toFixed(2)}%
                      </div>
                      <div style={{ color: '#c9d1d9', fontWeight: 600 }}>
                        {contracts.toFixed(2)}
                      </div>
                      <div style={{ color: '#8b949e' }}>
                        {formatPence(cost)}
                      </div>
                      <div style={{ color: '#c9d1d9' }}>
                        {markPercent.toFixed(2)}%
                      </div>
                      <div style={{
                        textAlign: 'right',
                        color: pnl >= 0 ? '#3fb950' : '#f85149',
                        fontWeight: 700
                      }}>
                        {pnl >= 0 ? '+' : ''}{formatPence(pnl)}
                      </div>
                      <div style={{ textAlign: 'center', color: '#6e7681' }}>
                        {group.positions.length}
                      </div>
                      <div style={{ textAlign: 'center', display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpand(group.key);
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.7rem',
                            padding: '0.125rem 0.375rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace'
                          }}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Fills */}
                    {isExpanded && (
                      <div style={{
                        background: '#0d1117',
                        borderBottom: '1px solid #21262d',
                        padding: '0.5rem 1rem 0.5rem 3rem',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        color: '#8b949e'
                      }}>
                        {group.positions.map((pos, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            gap: '1rem',
                            padding: '0.25rem 0',
                            borderBottom: idx < group.positions.length - 1 ? '1px solid #21262d' : 'none'
                          }}>
                            <div>Fill #{idx + 1}</div>
                            <div>Contracts: {(Number(pos.contractsMicros) / 1_000_000).toFixed(2)}</div>
                            <div>Cost: {formatPence(pos.sizePence)}</div>
                            <div style={{ color: '#6e7681', fontSize: '0.65rem' }}>
                              {new Date(pos.executedAt ?? pos.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT PANE - Close Ticket */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#0d1117',
            overflow: 'hidden'
          }}>
            {/* Ticket Header */}
            <div style={{
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid #30363d',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#c9d1d9',
              fontFamily: 'monospace',
              background: '#161b22',
              flexShrink: 0
            }}>
              CLOSE TICKET
            </div>

            {/* Live Market Prices - Fixed at top */}
            <div style={{
              padding: '0.5rem',
              borderBottom: '1px solid #30363d',
              background: '#0d1117',
              flexShrink: 0
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '3px',
                fontFamily: 'monospace',
                fontSize: '0.75rem'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#8b949e', fontSize: '0.5625rem', marginBottom: '0.125rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Live Buy
                  </div>
                  <div style={{ 
                    color: liveBestBid > 0 ? '#3fb950' : '#6e7681', 
                    fontWeight: 700,
                    fontSize: '0.875rem'
                  }}>
                    {liveBestBid > 0 ? formatProbability(liveBestBid) : '—'}
                  </div>
                </div>
                <div style={{ 
                  width: '1px', 
                  height: '1.75rem', 
                  background: '#30363d',
                  margin: '0 0.5rem'
                }} />
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ color: '#8b949e', fontSize: '0.5625rem', marginBottom: '0.125rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Live Sell
                  </div>
                  <div style={{ 
                    color: liveBestAsk > 0 ? '#f85149' : '#6e7681', 
                    fontWeight: 700,
                    fontSize: '0.875rem'
                  }}>
                    {liveBestAsk > 0 ? formatProbability(liveBestAsk) : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Ticket Body - Scrollable */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.625rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.625rem',
              fontSize: '0.7rem'
            }}>
              {/* Selection Info */}
              <div style={{
                padding: '0.375rem 0.5rem',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '3px',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}>
                <div style={{ color: '#8b949e', fontSize: '0.5625rem', textTransform: 'uppercase' }}>
                  Selected:
                </div>
                <div style={{ color: '#c9d1d9', fontWeight: 600, fontSize: '0.6875rem', flex: 1 }}>
                  {activeGroup 
                    ? `${activeGroup.side === 'BUY_YES' ? 'BUY YES' : 'SELL YES'} @ ${(activeGroup.yesPricePts / 100_000).toFixed(2)}% · ${Math.abs(Number(activeGroup.totalContractsMicros) / 1_000_000).toFixed(2)} ctr`
                    : 'All Positions'
                  }
                </div>
              </div>

              {/* Close Mode */}
              <div>
                <div style={{ color: '#8b949e', marginBottom: '0.375rem', fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 600 }}>
                  Close Mode
                </div>
                <div style={{
                  display: 'flex',
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <button
                    onClick={() => setCloseMode('ioc')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: 'none',
                      background: closeMode === 'ioc' ? '#238636' : 'transparent',
                      color: closeMode === 'ioc' ? '#c9d1d9' : '#8b949e',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                  >
                    Market (IOC)
                  </button>
                  <button
                    onClick={() => setCloseMode('limit')}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: 'none',
                      background: closeMode === 'limit' ? '#238636' : 'transparent',
                      color: closeMode === 'limit' ? '#c9d1d9' : '#8b949e',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                  >
                    Limit
                  </button>
                </div>
                {closeMode === 'ioc' && (
                  <div style={{ color: '#6e7681', fontSize: '0.5625rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                    Fills at best available price. Unfilled portion is cancelled.
                  </div>
                )}
                {closeMode === 'limit' && (
                  <div style={{ color: '#6e7681', fontSize: '0.5625rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                    Fills at limit price or better. Unfilled portion is cancelled.
                  </div>
                )}
              </div>

              {/* Limit Price Input */}
              {closeMode === 'limit' && (
                <div>
                  <div style={{ color: '#8b949e', marginBottom: '0.375rem', fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    YES Limit Price (%)
                  </div>
                  <input
                    type="number"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder={markPercent.toFixed(2)}
                    step="0.01"
                    min="0.01"
                    max="99.99"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: '#161b22',
                      border: '1px solid #30363d',
                      borderRadius: '4px',
                      color: '#c9d1d9',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}
                  />
                  <div style={{
                    display: 'flex',
                    gap: '0.25rem',
                    marginTop: '0.375rem'
                  }}>
                    {isLong ? (
                      /* Closing long = selling → want highest price */
                      <>
                        <button
                          onClick={() => setLimitPrice(liveBestBid > 0 ? (liveBestBid / 100_000).toFixed(2) : markPercent.toFixed(2))}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          Best Bid
                        </button>
                        <button
                          onClick={() => setLimitPrice(markPercent.toFixed(2))}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          Mid
                        </button>
                        <button
                          onClick={() => setLimitPrice((avgEntryPercent).toFixed(2))}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          Entry
                        </button>
                      </>
                    ) : (
                      /* Closing short = buying back → want lowest price */
                      <>
                        <button
                          onClick={() => setLimitPrice(liveBestAsk > 0 ? (liveBestAsk / 100_000).toFixed(2) : markPercent.toFixed(2))}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          Best Ask
                        </button>
                        <button
                          onClick={() => setLimitPrice(markPercent.toFixed(2))}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          Mid
                        </button>
                        <button
                          onClick={() => setLimitPrice((avgEntryPercent).toFixed(2))}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          Entry
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Size Control */}
              <div>
                <div style={{ color: '#8b949e', marginBottom: '0.375rem', fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 600 }}>
                  Size
                </div>
                <div style={{
                  display: 'flex',
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <button
                    onClick={() => setSizeMode('all')}
                    style={{
                      flex: 1,
                      padding: '0.375rem',
                      border: 'none',
                      background: sizeMode === 'all' ? '#238636' : 'transparent',
                      color: sizeMode === 'all' ? '#c9d1d9' : '#8b949e',
                      fontWeight: 600,
                      fontSize: '0.6875rem',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSizeMode('partial')}
                    style={{
                      flex: 1,
                      padding: '0.375rem',
                      border: 'none',
                      background: sizeMode === 'partial' ? '#238636' : 'transparent',
                      color: sizeMode === 'partial' ? '#c9d1d9' : '#8b949e',
                      fontWeight: 600,
                      fontSize: '0.6875rem',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                  >
                    Partial
                  </button>
                </div>
                {/* Partial Size Controls - Always visible to preallocate space */}
                <div style={{ 
                  marginTop: '0.375rem',
                  visibility: sizeMode === 'partial' ? 'visible' : 'hidden',
                  height: '4rem'
                }}>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <input
                      type="number"
                      value={partialPercent}
                      onChange={(e) => setPartialPercent(parseInt(e.target.value) || 1)}
                      min="1"
                      max="100"
                      disabled={sizeMode !== 'partial'}
                      style={{
                        width: '4rem',
                        padding: '0.375rem',
                        background: '#161b22',
                        border: '1px solid #30363d',
                        borderRadius: '3px',
                        color: '#c9d1d9',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace'
                      }}
                    />
                    {[25, 50, 75, 100].map(val => (
                      <button
                        key={val}
                        onClick={() => setPartialPercent(val)}
                        disabled={sizeMode !== 'partial'}
                        style={{
                          padding: '0.375rem 0.5rem',
                          background: partialPercent === val ? '#238636' : '#161b22',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: partialPercent === val ? '#c9d1d9' : '#8b949e',
                          fontSize: '0.625rem',
                          cursor: sizeMode === 'partial' ? 'pointer' : 'default',
                          fontFamily: 'monospace',
                          flex: 1
                        }}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={partialPercent}
                    onChange={(e) => setPartialPercent(parseInt(e.target.value))}
                    disabled={sizeMode !== 'partial'}
                    style={{
                      width: '100%'
                    }}
                  />
                </div>
              </div>

              {/* Quote Button */}
              <button
                onClick={() => {
                  if (activeGroup) {
                    fetchGroupQuote(activeGroup.key, activeGroup.side, activeGroup.totalContractsMicros);
                  } else {
                    fetchCashoutQuote();
                  }
                }}
                disabled={activeQuoteLoading || executingCashout}
                style={{
                  padding: '0.5rem',
                  background: activeQuoteLoading || executingCashout ? '#30363d' : '#1f6feb',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#c9d1d9',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: activeQuoteLoading || executingCashout ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {loadingQuote ? '⟳ Loading...' : '↻ Get Quote'}
              </button>

              {/* Preview Box */}
              {activeQuote && (
                <div style={{
                  padding: '0.5rem',
                  background: '#161b22',
                  border: '1px solid #238636',
                  borderRadius: '3px',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ color: '#8b949e', marginBottom: '0.375rem', fontSize: '0.625rem', textTransform: 'uppercase' }}>
                    Quote Preview
                  </div>
                  {(() => {
                    const quote = activeQuote;
                    
                    if (!quote || !quote.success) {
                      return <div style={{ color: '#f85149' }}>Failed to get quote</div>;
                    }

                    const filledAbs = BigInt(quote.filledContractsMicros || '0');
                    const unfilledAbs = BigInt(quote.unfilledContractsMicros || '0');
                    const totalAbs = filledAbs + unfilledAbs;
                    const fillPercent = totalAbs > 0n
                      ? ((Number(filledAbs) / Number(totalAbs)) * 100).toFixed(1)
                      : '0.0';

                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <div style={{ color: '#c9d1d9', fontWeight: 700, fontSize: '0.875rem' }}>
                            {formatPence(Math.abs(Number(quote.netValuePence)))}
                          </div>
                          <div style={{ color: '#6e7681', fontSize: '0.5625rem' }}>
                            Fill: {fillPercent}%
                          </div>
                        </div>
                        <div style={{ color: '#6e7681', fontSize: '0.5625rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Filled: {formatContracts(filledAbs)}</span>
                          <span>Fee: {formatPence(Number(quote.estimatedFeePence))}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Ticket Footer */}
            <div style={{
              padding: '0.625rem',
              borderTop: '1px solid #30363d',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              background: '#0d1117',
              flexShrink: 0
            }}>
              {inlineNotice && (
                <div style={{
                  padding: '0.45rem 0.5rem',
                  borderRadius: '3px',
                  border: `1px solid ${inlineNotice.type === 'success' ? '#238636' : inlineNotice.type === 'error' ? '#f85149' : '#30363d'}`,
                  background: inlineNotice.type === 'success' ? '#102116' : inlineNotice.type === 'error' ? '#2d1215' : '#161b22',
                  color: inlineNotice.type === 'success' ? '#3fb950' : inlineNotice.type === 'error' ? '#ff7b72' : '#8b949e',
                  fontSize: '0.6875rem',
                  fontFamily: 'monospace'
                }}>
                  {inlineNotice.message}
                </div>
              )}
              <button
                onClick={() => {
                  if (activeGroup) {
                    handleGroupCashout(activeGroup.key, activeGroup.side, activeGroup.totalContractsMicros, activeGroup.positions);
                  } else {
                    handleCashout();
                  }
                }}
                disabled={!canSubmitClose}
                style={{
                  padding: '0.5rem',
                  background: canSubmitClose ? '#238636' : '#30363d',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#c9d1d9',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: canSubmitClose ? 'pointer' : 'not-allowed',
                  fontFamily: 'monospace'
                }}
              >
                {executingCashout ? '⟳ Executing...' : closeMode === 'limit' ? '→ Submit Limit Close' : '→ Submit Market Close'}
              </button>
              <button
                onClick={onClose}
                disabled={executingCashout}
                style={{
                  padding: '0.375rem',
                  background: 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '3px',
                  color: '#8b949e',
                  fontWeight: 600,
                  fontSize: '0.6875rem',
                  cursor: executingCashout ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Fixed Footer - Close All */}
        <div style={{
          borderTop: '1px solid #30363d',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#161b22',
          flexShrink: 0,
          fontSize: '0.75rem',
          fontFamily: 'monospace'
        }}>
          <div style={{ color: '#8b949e' }}>
            {cashoutQuote && cashoutQuote.success && (
              <span>
                Close All Estimate: <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{formatPence(Number(cashoutQuote.netValuePence))}</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleCashout}
              disabled={!canSubmitClose || !!activeGroup}
              style={{
                padding: '0.5rem 1rem',
                background: !canSubmitClose || !!activeGroup ? '#30363d' : '#8957e5',
                border: 'none',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: !canSubmitClose || !!activeGroup ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                opacity: !canSubmitClose || !!activeGroup ? 0.5 : 1
              }}
            >
              ✕ Close All Positions
            </button>
          </div>
        </div>

        {/* Inject scrollbar styles */}
        <style>{`
          .positions-scroll::-webkit-scrollbar {
            width: 8px;
          }
          .positions-scroll::-webkit-scrollbar-track {
            background: #0d1117;
          }
          .positions-scroll::-webkit-scrollbar-thumb {
            background: #30363d;
            border-radius: 4px;
          }
          .positions-scroll::-webkit-scrollbar-thumb:hover {
            background: #484f58;
          }
        `}</style>
      </div>
    </>
  );
}


