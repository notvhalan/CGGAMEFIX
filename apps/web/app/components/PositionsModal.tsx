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
      const normalized = normalizeApiUrl((window as any).ENV.API_URL);
      console.log('[getApiUrl] Using window.ENV.API_URL:', normalized);
      return normalized;
    }
    // Fall back to production API origin for gamefix domains.
    if (window.location.hostname.includes('gamefix.fun')) {
      const apiUrl = 'https://api.gamefix.fun';
      console.log('[getApiUrl] Using gamefix.fun URL:', apiUrl);
      return apiUrl;
    }
  }
  console.log('[getApiUrl] Using localhost default');
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
}

interface InlineNotice {
  type: 'success' | 'error' | 'info';
  message: string;
}

export function PositionsModal({ position, isOpen, onClose, onCashoutSuccess, marketId, orderBook }: PositionsModalProps) {
  const [closeMode, setCloseMode] = useState<'ioc' | 'limit'>('ioc');
  const [slippage, setSlippage] = useState(0.25);
  const [limitPrice, setLimitPrice] = useState('');
  const [sizeMode, setSizeMode] = useState<'all' | 'partial'>('all');
  const [partialPercent, setPartialPercent] = useState(100);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [cashoutQuote, setCashoutQuote] = useState<CashoutQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [executingCashout, setExecutingCashout] = useState(false);
  const [groupQuotes, setGroupQuotes] = useState<Map<number, CashoutQuote>>(new Map());
  const [loadingGroupQuotes, setLoadingGroupQuotes] = useState<Set<number>>(new Set());
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);
  const [sideFilter, setSideFilter] = useState<'all' | 'for' | 'lay'>('all');
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

  const sameSideRawPositions = netSign > 0n
    ? (buyPositions || [])
    : netSign < 0n
      ? (sellPositions || [])
      : [];
  const oppositeSideRawPositions = netSign > 0n
    ? (sellPositions || [])
    : netSign < 0n
      ? (buyPositions || [])
      : [];

  const hasSameSideRows = sameSideRawPositions.length > 0;
  const hasOppositeSideRows = oppositeSideRawPositions.length > 0;

  // Prefer same-side rows; if missing (legacy drift), borrow opposite-side rows as entry buckets.
  // Keep the displayed side aligned with source rows in fallback mode.
  const sourceRows = hasSameSideRows ? sameSideRawPositions : oppositeSideRawPositions;
  const displaySign = hasSameSideRows
    ? netSign
    : hasOppositeSideRows
      ? -netSign
      : netSign;
  const canonicalRows = canonicalizePositions(sourceRows, displaySign);
  const reconciledRows = reconcileLotsToNet(canonicalRows, displaySign, absNetContractsMicros);

  const displayBuyPositions = displaySign > 0n ? reconciledRows : [];
  const displaySellPositions = displaySign < 0n ? reconciledRows : [];
  const isFallbackBucketView = hasOpenPositions && displaySign !== netSign;

  // Fetch cashout quote
  const fetchCashoutQuote = useCallback(async () => {
    console.log('[fetchCashoutQuote] hasOpenPositions:', hasOpenPositions, 'buyPositions:', buyPositions?.length, 'sellPositions:', sellPositions?.length);
    
    if (!hasOpenPositions) {
      console.log('[fetchCashoutQuote] No open positions, skipping quote fetch');
      return;
    }

    if (!marketId) {
      console.error('[fetchCashoutQuote] marketId is undefined');
      return;
    }

    if (netContractsMicros === undefined || netContractsMicros === null) {
      console.error('[fetchCashoutQuote] netContractsMicros is undefined or null');
      return;
    }

    console.log('[fetchCashoutQuote] Fetching quote for marketId:', marketId, 'netContractsMicros:', netContractsMicros.toString());
    setLoadingQuote(true);
    try {
      const body = {
        marketId,
        netContractsMicros: netContractsMicros.toString(),
      };
      console.log('[fetchCashoutQuote] Request body:', JSON.stringify(body));
      
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/cashout/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      console.log('[fetchCashoutQuote] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[fetchCashoutQuote] Error response:', errorText);
        throw new Error(`Failed to fetch quote: ${response.statusText}`);
      }

      const quote = await response.json();
      console.log('[fetchCashoutQuote] Quote received:', JSON.stringify(quote, null, 2));
      setCashoutQuote(quote);
    } catch (error) {
      console.error('[fetchCashoutQuote] Failed to fetch cashout quote:', error);
      setCashoutQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }, [marketId, hasOpenPositions, netContractsMicros, buyPositions, sellPositions]);

  // Fetch quote on mount and refresh every 5 seconds
  useEffect(() => {
    if (isOpen) {
      fetchCashoutQuote();
      const interval = setInterval(fetchCashoutQuote, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchCashoutQuote]);

  // Auto-dismiss inline notices.
  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => setInlineNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

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
  const fetchGroupQuote = useCallback(async (yesPricePts: number, totalContractsMicros: bigint) => {
    console.log('[fetchGroupQuote] yesPricePts:', yesPricePts, 'totalContractsMicros:', totalContractsMicros.toString());
    setLoadingGroupQuotes(prev => new Set(prev).add(yesPricePts));
    try {
      // Sign group contracts to match overall position direction for close side detection
      const posNet = typeof netContractsMicrosStr === 'string' 
        ? BigInt(netContractsMicrosStr) 
        : netContractsMicrosStr;
      const sign = posNet === 0n ? 0n : (posNet > 0n ? 1n : -1n);
      const groupSigned = sign * (totalContractsMicros < 0n ? -totalContractsMicros : totalContractsMicros);
      
      console.log('[fetchGroupQuote] Sending request with groupSigned:', groupSigned.toString());
      
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/cashout/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          netContractsMicros: groupSigned.toString(),
        }),
      });

      console.log('[fetchGroupQuote] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[fetchGroupQuote] Error response:', errorText);
        throw new Error(`Failed to fetch quote: ${response.statusText}`);
      }

      const quote = await response.json();
      console.log('[fetchGroupQuote] Group quote received:', JSON.stringify(quote, null, 2));
      setGroupQuotes(prev => new Map(prev).set(yesPricePts, quote));
    } catch (error) {
      console.error('[fetchGroupQuote] Failed to fetch group quote:', error);
    } finally {
      setLoadingGroupQuotes(prev => {
        const next = new Set(prev);
        next.delete(yesPricePts);
        return next;
      });
    }
  }, [marketId, netContractsMicrosStr]);

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

  const groupedBuyPositions = groupPositions(displayBuyPositions);
  const groupedSellPositions = groupPositions(displaySellPositions);

  const executeCashoutRequest = useCallback(async (requestBody: CashoutExecuteRequest) => {
    console.log('[Cashout] Executing IOC close with body:', requestBody);
    setExecutingCashout(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/cashout/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Cashout] Error response:', errorText);
        throw new Error(`Failed to execute cashout: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success) {
        setInlineNotice({
          type: 'success',
          message: `Close order submitted (${result.orderId?.slice(0, 8) || 'ok'}). Position is refreshing...`,
        });
        fetchCashoutQuote();
        onCashoutSuccess?.();
      } else {
        setInlineNotice({
          type: 'error',
          message: `Close failed: ${result.error || 'Unknown error'}`,
        });
      }
    } catch (error) {
      console.error('[Cashout] Error:', error);
      setInlineNotice({
        type: 'error',
        message: `Close failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setExecutingCashout(false);
    }
  }, [onCashoutSuccess, fetchCashoutQuote]);

  // Submit full-position close immediately (no browser popup/confirm).
  const handleCashout = async () => {
    console.log('[Cashout] Button clicked, cashoutQuote:', cashoutQuote);

    if (!cashoutQuote || !cashoutQuote.success) {
      console.error('[Cashout] No valid quote available');
      setInlineNotice({ type: 'error', message: 'No valid quote available yet.' });
      return;
    }
    await executeCashoutRequest({
      marketId,
      netContractsMicros: netContractsMicros.toString(),
      maxSlippagePts: 100000,
    });
  };

  // Submit grouped close immediately (closes this group only).
  const handleGroupCashout = async (yesPricePts: number, totalContractsMicros: bigint) => {
    console.log('[GroupCashout] Closing individual group:', { yesPricePts, groupContracts: totalContractsMicros.toString() });

    const quote = groupQuotes.get(yesPricePts);
    console.log('[GroupCashout] Quote for this group:', quote);

    if (!quote || !quote.success) {
      setInlineNotice({
        type: 'error',
        message: 'No valid quote available for this group. Get quote first.',
      });
      return;
    }

    const posNet = typeof netContractsMicrosStr === 'string'
      ? BigInt(netContractsMicrosStr)
      : netContractsMicrosStr;
    const sign = posNet === 0n ? 0n : (posNet > 0n ? 1n : -1n);
    const absGroupContracts = totalContractsMicros < 0n ? -totalContractsMicros : totalContractsMicros;
    const groupSigned = sign * absGroupContracts;

    const requestBody = {
      marketId,
      netContractsMicros: groupSigned.toString(),
      maxSlippagePts: 100000,
    };
    console.log('[GroupCashout] Request body:', requestBody);
    await executeCashoutRequest(requestBody);
  };

  // Early return AFTER all hooks have been called
  if (!isOpen) return null;

  // Combine all positions for table view
  const allGroups = [
    ...groupedBuyPositions.map(g => ({ ...g, side: 'BUY_YES' as const })),
    ...groupedSellPositions.map(g => ({ ...g, side: 'SELL_YES' as const }))
  ].filter(g => {
    if (sideFilter === 'for') return g.side === 'BUY_YES';
    if (sideFilter === 'lay') return g.side === 'SELL_YES';
    return true;
  }).sort((a, b) => b.yesPricePts - a.yesPricePts);

  // Get currently selected group or default to "all"
  const activeGroup = selectedGroup !== null 
    ? allGroups.find(g => g.yesPricePts === selectedGroup)
    : null;

  const toggleRowExpand = (yesPricePts: number) => {
    const next = new Set(expandedRows);
    if (next.has(yesPricePts)) {
      next.delete(yesPricePts);
    } else {
      next.add(yesPricePts);
    }
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
          <div>
            <span style={{ color: '#8b949e' }}>Side:</span>{' '}
            <span style={{ color: isLong ? '#3fb950' : '#f85149', fontWeight: 600 }}>
              {isLong ? '▲ FOR' : '▼ LAY'}
            </span>
          </div>
          <div>
            <span style={{ color: '#8b949e' }}>Contracts:</span>{' '}
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
              color: unrealizedPnlPence >= 0 ? '#3fb950' : '#f85149',
              fontWeight: 700
            }}>
              {unrealizedPnlPence >= 0 ? '+' : ''}{formatPence(unrealizedPnlPence)}
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
                onClick={() => setSideFilter('for')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: sideFilter === 'for' ? '#238636' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: sideFilter === 'for' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                FOR
              </button>
              <button
                onClick={() => setSideFilter('lay')}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: sideFilter === 'lay' ? '#238636' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: '4px',
                  color: sideFilter === 'lay' ? '#c9d1d9' : '#8b949e',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                LAY
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
            {isFallbackBucketView && (
              <div style={{
                padding: '0.4rem 1rem',
                borderBottom: '1px solid #30363d',
                background: '#2d1f0f',
                color: '#f2cc60',
                fontSize: '0.7rem',
                fontFamily: 'monospace'
              }}>
                Bucket rows are legacy entry history. Close actions reduce net position FIFO and may update different rows.
              </div>
            )}

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
              {allGroups.map((group) => {
                const isSelected = selectedGroup === group.yesPricePts;
                const isExpanded = expandedRows.has(group.yesPricePts);
                const avgEntry = group.yesPricePts / 100_000;
                const contracts = Math.abs(Number(group.totalContractsMicros) / 1_000_000);
                const cost = group.totalSizePence;
                const markValue = contracts * (markPercent / 100) * 100; // Value at mark
                const pnl = group.side === 'BUY_YES' 
                  ? (markValue - cost)
                  : (cost - markValue);

                return (
                  <div key={`${group.side}-${group.yesPricePts}`}>
                    {/* Main Row */}
                    <div
                      onClick={() => setSelectedGroup(isSelected ? null : group.yesPricePts)}
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
                        {group.side === 'BUY_YES' ? '▲ FOR' : '▼ LAY'}
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
                            toggleRowExpand(group.yesPricePts);
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
                    ? `${activeGroup.side} @ ${(activeGroup.yesPricePts / 100_000).toFixed(2)}% · ${Math.abs(Number(activeGroup.totalContractsMicros) / 1_000_000).toFixed(2)} contracts`
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
                    IOC
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
              </div>

              {/* IOC Options */}
              {closeMode === 'ioc' && (
                <>
                  <div>
                    <div style={{ color: '#8b949e', marginBottom: '0.375rem', fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 600 }}>
                      Max Slippage (%)
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={slippage}
                        onChange={(e) => setSlippage(parseFloat(e.target.value) || 0)}
                        step="0.1"
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
                      {[0.1, 0.25, 0.5, 1.0].map(val => (
                        <button
                          key={val}
                          onClick={() => setSlippage(val)}
                          style={{
                            padding: '0.375rem 0.5rem',
                            background: slippage === val ? '#238636' : '#161b22',
                            border: '1px solid #30363d',
                            borderRadius: '3px',
                            color: slippage === val ? '#c9d1d9' : '#8b949e',
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            flex: 1
                          }}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Limit Options */}
              {closeMode === 'limit' && (
                <>
                  <div>
                    <div style={{ color: '#8b949e', marginBottom: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 600 }}>
                      YES Limit Price (%)
                    </div>
                    <input
                      type="number"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder={markPercent.toFixed(2)}
                      step="0.01"
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
                      marginTop: '0.5rem'
                    }}>
                      <button
                        onClick={() => setLimitPrice(markPercent.toFixed(2))}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#161b22',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#8b949e',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        MID
                      </button>
                      <button
                        onClick={() => setLimitPrice((markPercent - 0.5).toFixed(2))}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#161b22',
                          border: '1px solid #30363d',
                          borderRadius: '3px',
                          color: '#8b949e',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        BEST
                      </button>
                    </div>
                  </div>
                </>
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
                    fetchGroupQuote(activeGroup.yesPricePts, activeGroup.totalContractsMicros);
                  } else {
                    fetchCashoutQuote();
                  }
                }}
                disabled={loadingQuote}
                style={{
                  padding: '0.5rem',
                  background: loadingQuote ? '#30363d' : '#1f6feb',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#c9d1d9',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: loadingQuote ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {loadingQuote ? '⟳ Loading...' : '↻ Get Quote'}
              </button>

              {/* Preview Box */}
              {((activeGroup && groupQuotes.get(activeGroup.yesPricePts)) || (!activeGroup && cashoutQuote)) && (
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
                    const quote = activeGroup 
                      ? groupQuotes.get(activeGroup.yesPricePts)
                      : cashoutQuote;
                    
                    if (!quote || !quote.success) {
                      return <div style={{ color: '#f85149' }}>Failed to get quote</div>;
                    }

                    const filledAbs = Math.abs(parseInt(quote.filledContractsMicros));
                    const unfilledAbs = Math.abs(parseInt(quote.unfilledContractsMicros));
                    const fillPercent = ((filledAbs / (filledAbs + unfilledAbs)) * 100).toFixed(1);

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
                          <span>Filled: {(filledAbs / 1_000_000).toFixed(2)}</span>
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
                    handleGroupCashout(activeGroup.yesPricePts, activeGroup.totalContractsMicros);
                  } else {
                    handleCashout();
                  }
                }}
                disabled={executingCashout}
                style={{
                  padding: '0.5rem',
                  background: executingCashout ? '#30363d' : '#238636',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#c9d1d9',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: executingCashout ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {executingCashout ? '⟳ Executing...' : '→ Submit Close Order'}
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
              disabled={!cashoutQuote || !cashoutQuote.success || executingCashout}
              style={{
                padding: '0.5rem 1rem',
                background: (!cashoutQuote || !cashoutQuote.success || executingCashout) ? '#30363d' : '#8957e5',
                border: 'none',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: (!cashoutQuote || !cashoutQuote.success || executingCashout) ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                opacity: (!cashoutQuote || !cashoutQuote.success || executingCashout) ? 0.5 : 1
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


