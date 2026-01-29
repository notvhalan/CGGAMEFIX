import { Form } from '@remix-run/react';
import { formatPence, formatProbability } from '~/lib/format';
import { useState, useEffect, useCallback } from 'react';
import type { Position } from './PositionPanel';

interface PositionsModalProps {
  position: Position;
  isOpen: boolean;
  onClose: () => void;
  onCashoutSuccess?: () => void;
  marketId: string;
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

export function PositionsModal({ position, isOpen, onClose, onCashoutSuccess, marketId }: PositionsModalProps) {
  const [liquidationMode, setLiquidationMode] = useState(false); // Default to limit orders
  const [cashoutQuote, setCashoutQuote] = useState<CashoutQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [executingCashout, setExecutingCashout] = useState(false);
  const [groupQuotes, setGroupQuotes] = useState<Map<number, CashoutQuote>>(new Map());
  const [loadingGroupQuotes, setLoadingGroupQuotes] = useState<Set<number>>(new Set());

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

  // Fetch cashout quote
  const fetchCashoutQuote = useCallback(async () => {
    if (!netContractsMicros || netContractsMicros === 0n) {
      return;
    }

    setLoadingQuote(true);
    try {
      const response = await fetch('/v1/cashout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          netContractsMicros: netContractsMicros.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quote: ${response.statusText}`);
      }

      const quote = await response.json();
      setCashoutQuote(quote);
    } catch (error) {
      console.error('Failed to fetch cashout quote:', error);
      setCashoutQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }, [marketId, netContractsMicros]);

  // Fetch quote on mount and refresh every 5 seconds
  useEffect(() => {
    if (isOpen) {
      fetchCashoutQuote();
      const interval = setInterval(fetchCashoutQuote, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchCashoutQuote]);

  // Fetch cashout quote for a specific group
  const fetchGroupQuote = useCallback(async (yesPricePts: number, totalContractsMicros: bigint) => {
    setLoadingGroupQuotes(prev => new Set(prev).add(yesPricePts));
    try {
      // Sign group contracts to match overall position direction for close side detection
      const posNet = typeof netContractsMicrosStr === 'string' 
        ? BigInt(netContractsMicrosStr) 
        : netContractsMicrosStr;
      const sign = posNet === 0n ? 0n : (posNet > 0n ? 1n : -1n);
      const groupSigned = sign * (totalContractsMicros < 0n ? -totalContractsMicros : totalContractsMicros);
      
      const response = await fetch('/v1/cashout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          netContractsMicros: groupSigned.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quote: ${response.statusText}`);
      }

      const quote = await response.json();
      console.log('Group quote response:', JSON.stringify(quote, null, 2));
      setGroupQuotes(prev => new Map(prev).set(yesPricePts, quote));
    } catch (error) {
      console.error('Failed to fetch group quote:', error);
    } finally {
      setLoadingGroupQuotes(prev => {
        const next = new Set(prev);
        next.delete(yesPricePts);
        return next;
      });
    }
  }, [marketId]);

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

  const groupedBuyPositions = groupPositions(buyPositions);
  const groupedSellPositions = groupPositions(sellPositions);

  // Execute cashout for full position
  const handleCashout = async () => {
    console.log('[Cashout] Button clicked, cashoutQuote:', cashoutQuote);
    
    if (!cashoutQuote || !cashoutQuote.success) {
      console.error('[Cashout] No valid quote available');
      alert('No valid quote available');
      return;
    }

    const filledContracts = BigInt(cashoutQuote.filledContractsMicros);
    const unfilledContracts = BigInt(cashoutQuote.unfilledContractsMicros);
    const fillablePercent = Number(filledContracts) > 0 
      ? (Number(filledContracts) * 100 / (Number(filledContracts) + Number(unfilledContracts))).toFixed(1)
      : '0';

    if (!confirm(
      `Cash out position for ${formatPence(Number(cashoutQuote.netValuePence))}?\n\n` +
      `Book fill: ${fillablePercent}% (${(Number(filledContracts) / 1_000_000).toFixed(2)} contracts)\n` +
      `Unfilled: ${(Number(unfilledContracts) / 1_000_000).toFixed(2)} contracts will not close`
    )) {
      console.log('[Cashout] User cancelled confirmation');
      return;
    }

    console.log('[Cashout] Executing cashout (IOC order) with params:', {
      marketId,
      netContractsMicros: netContractsMicros.toString(),
    });

    setExecutingCashout(true);
    try {
      const response = await fetch('/v1/cashout/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          netContractsMicros: netContractsMicros.toString(),
          maxSlippagePts: 100000, // 1% max slippage
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute cashout: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Close order submitted! Order ID: ${result.orderId}\n\n${result.message}`);
        onClose();
        // Trigger refetch in parent component
        onCashoutSuccess?.();
      } else {
        alert(`❌ Close failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to execute cashout:', error);
      alert(`❌ Close failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExecutingCashout(false);
    }
  };

  // Execute cashout for grouped position - closes THIS GROUP only
  const handleGroupCashout = async (yesPricePts: number, totalContractsMicros: bigint) => {
    console.log('[GroupCashout] Closing individual group:', { yesPricePts, groupContracts: totalContractsMicros.toString() });
    
    const quote = groupQuotes.get(yesPricePts);
    console.log('[GroupCashout] Quote for this group:', quote);
    
    if (!quote || !quote.success) {
      alert('No valid quote available for this group. Please get a quote first.');
      return;
    }

    const filledContracts = BigInt(quote.filledContractsMicros);
    const unfilledContracts = BigInt(quote.unfilledContractsMicros);
    const fillablePercent = Number(filledContracts) > 0 
      ? (Number(filledContracts) * 100 / (Number(filledContracts) + Number(unfilledContracts))).toFixed(1)
      : '0';

    const confirmMessage = `Close ${(Number(totalContractsMicros) / 1_000_000).toFixed(2)} contracts @ ${(yesPricePts / 100_000).toFixed(2)}% for ${formatPence(Number(quote.netValuePence))}?\n\nBook fill: ${fillablePercent}%\nUnfilled: ${(Number(unfilledContracts) / 1_000_000).toFixed(2)} contracts\n\nThis will reduce your position but not close it entirely.`;
    console.log('[GroupCashout] Confirmation message:', confirmMessage);
    
    if (!confirm(confirmMessage)) {
      console.log('[GroupCashout] User cancelled');
      return;
    }

    console.log('[GroupCashout] Executing group cashout (IOC order)...');
    setExecutingCashout(true);
    try {
      // Sign group contracts to match overall position direction (same as quote)
      const posNet = typeof netContractsMicrosStr === 'string' 
        ? BigInt(netContractsMicrosStr) 
        : netContractsMicrosStr;
      const sign = posNet === 0n ? 0n : (posNet > 0n ? 1n : -1n);
      const absGroupContracts = totalContractsMicros < 0n ? -totalContractsMicros : totalContractsMicros;
      const groupSigned = sign * absGroupContracts;
      
      const requestBody = {
        marketId,
        netContractsMicros: groupSigned.toString(),
        maxSlippagePts: 100000, // 1% max slippage
      };
      console.log('[GroupCashout] Request body:', requestBody);
      
      const response = await fetch('/v1/cashout/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('Cashout response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cashout error response:', errorText);
        throw new Error(`Failed to execute cashout: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[GroupCashout] Result:', result);
      
      if (result.success) {
        alert(`✅ Close order submitted! Order ID: ${result.orderId}\n\n${result.message}`);
        onClose();
        // Trigger refetch in parent component
        onCashoutSuccess?.();
      } else {
        alert(`❌ Close failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[GroupCashout] Error:', error);
      alert(`❌ Close failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExecutingCashout(false);
    }
  };

  // Early return AFTER all hooks have been called
  if (!isOpen) return null;

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

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#1a1f26',
        borderRadius: '12px',
        border: '1px solid #2d3748',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        width: '90%',
        maxWidth: '800px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #2d3748',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#e4e8eb',
            margin: 0
          }}>
            Your Positions
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Liquidation Mode Toggle */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #2d3748',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          background: '#141922',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8', fontWeight: 600 }}>
            Close Mode:
          </span>
          <div style={{
            display: 'flex',
            background: '#1a1f26',
            border: '1px solid #2d3748',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <button
              type="button"
              onClick={() => setLiquidationMode(true)}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: liquidationMode ? '#667eea' : 'transparent',
                color: liquidationMode ? 'white' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🚀 Instant (IOC)
            </button>
            <button
              type="button"
              onClick={() => setLiquidationMode(false)}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: !liquidationMode ? '#667eea' : 'transparent',
                color: !liquidationMode ? 'white' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              📋 Limit Order
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 'auto' }}>
            {liquidationMode 
              ? 'Close immediately at market price' 
              : 'Place limit order at current price'}
          </div>
        </div>

        {/* IOC Warning */}
        {liquidationMode && (
          <div style={{
            padding: '0.75rem 1.5rem',
            background: '#f59e0b20',
            border: '1px solid #f59e0b40',
            borderBottom: '1px solid #2d3748',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.75rem',
            color: '#fbbf24',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <div>
              <strong>Market Order Mode:</strong> Positions will close immediately ONLY if there's opposing liquidity in the orderbook. 
              If orders get cancelled, there's no liquidity - use <strong>Limit Order mode</strong> instead or use <strong>"Close All Positions"</strong> button below.
            </div>
          </div>
        )}

        {/* Content - Scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem'
        }}>
          {/* Summary Section */}
          <div style={{
            background: isLong ? '#10b98110' : '#ef444410',
            border: '1px solid ' + (isLong ? '#10b98130' : '#ef444430'),
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.875rem' }}>
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Direction</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: isLong ? '#10b981' : '#ef4444' }}>
                  {isLong ? '▲ FOR (YES)' : '▼ LAY (YES)'}
                </div>
              </div>
              
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Net Size</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e4e8eb' }}>
                  {formatPence(positionSize)}
                </div>
              </div>
              
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Avg Entry</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e4e8eb' }}>
                  {avgEntryPercent.toFixed(2)}%
                </div>
              </div>
              
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '0.25rem' }}>Mark Price</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e4e8eb' }}>
                  {markPercent.toFixed(2)}%
                </div>
              </div>
              
              <div style={{ gridColumn: '1 / -1', paddingTop: '1rem', borderTop: '1px solid #2d3748' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#94a3b8' }}>Unrealized P&L</div>
                  <div style={{
                    fontWeight: 700,
                    fontSize: '1.5rem',
                    color: unrealizedPnlPence >= 0 ? '#10b981' : '#ef4444'
                  }}>
                    {unrealizedPnlPence >= 0 ? '+' : ''}{formatPence(unrealizedPnlPence)}
                  </div>
                </div>
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Total Fees Paid</div>
                  <div style={{ color: '#64748b', fontWeight: 600 }}>{formatPence(totalFeesPence)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Buy Positions */}
          {groupedBuyPositions.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#10b981',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                ▲ FOR Positions ({buyPositions.length})
              </h3>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Total: {formatPence(buyPositions.reduce((sum, p) => sum + p.sizePence, 0))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {groupedBuyPositions.map((group) => {
                  const quote = groupQuotes.get(group.yesPricePts);
                  const isLoadingQuote = loadingGroupQuotes.has(group.yesPricePts);
                  
                  return (
                    <div
                      key={group.yesPricePts}
                      style={{
                        background: '#10b98110',
                        border: '1px solid #10b98130',
                        borderRadius: '8px',
                        padding: '1rem',
                        fontSize: '0.875rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#e4e8eb', marginBottom: '0.25rem' }}>
                            {formatPence(group.totalSizePence)} @ {formatProbability(group.yesPricePts)}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                            {group.positions.length} fill{group.positions.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => fetchGroupQuote(group.yesPricePts, group.totalContractsMicros)}
                            disabled={isLoadingQuote || executingCashout}
                            style={{
                              padding: '0.5rem 0.75rem',
                              background: isLoadingQuote || executingCashout ? '#4b5563' : '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: isLoadingQuote || executingCashout ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              minWidth: '90px'
                            }}
                          >
                            {isLoadingQuote ? '⏳ Loading...' : quote ? `📋 ${formatPence(Number(quote.netValuePence))}` : '📋 Quote'}
                          </button>
                          <button
                            onClick={() => handleGroupCashout(group.yesPricePts, group.totalContractsMicros)}
                            disabled={!quote || !quote.success || executingCashout}
                            style={{
                              padding: '0.5rem 0.75rem',
                              background: (!quote || !quote.success || executingCashout) ? '#4b5563' : '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: (!quote || !quote.success || executingCashout) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              minWidth: '90px',
                              opacity: (!quote || !quote.success || executingCashout) ? 0.5 : 1
                            }}
                          >
                            {executingCashout ? '⏳...' : '💰 Close'}
                          </button>
                        </div>
                      </div>
                      {quote && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: quote.success ? '#94a3b8' : '#f87171',
                          padding: '0.5rem',
                          background: '#1a1f26',
                          borderRadius: '4px',
                          border: '1px solid #2d3748'
                        }}>
                          {quote.success ? (
                            <>
                              Fillable: {(parseInt(quote.filledContractsMicros) / 1_000_000).toFixed(2)} contracts • 
                              Unfilled: {(parseInt(quote.unfilledContractsMicros) / 1_000_000).toFixed(2)} contracts • 
                              Fee: {formatPence(Number(quote.estimatedFeePence))}
                            </>
                          ) : (
                            <>⚠️ {quote.error || 'Failed to get quote'}</>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sell Positions */}
          {groupedSellPositions.length > 0 && (
            <div>
              <h3 style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#ef4444',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                ▼ LAY Positions ({sellPositions.length})
              </h3>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Total: {formatPence(sellPositions.reduce((sum, p) => sum + p.sizePence, 0))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {groupedSellPositions.map((group) => {
                  const quote = groupQuotes.get(group.yesPricePts);
                  const isLoadingQuote = loadingGroupQuotes.has(group.yesPricePts);
                  
                  return (
                    <div
                      key={group.yesPricePts}
                      style={{
                        background: '#ef444410',
                        border: '1px solid #ef444430',
                        borderRadius: '8px',
                        padding: '1rem',
                        fontSize: '0.875rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#e4e8eb', marginBottom: '0.25rem' }}>
                            {formatPence(group.totalSizePence)} @ {formatProbability(group.yesPricePts)}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                            {group.positions.length} fill{group.positions.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => fetchGroupQuote(group.yesPricePts, group.totalContractsMicros)}
                            disabled={isLoadingQuote || executingCashout}
                            style={{
                              padding: '0.5rem 0.75rem',
                              background: isLoadingQuote || executingCashout ? '#4b5563' : '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: isLoadingQuote || executingCashout ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              minWidth: '90px'
                            }}
                          >
                            {isLoadingQuote ? '⏳ Loading...' : quote ? `📋 ${formatPence(Math.abs(Number(quote.netValuePence)))}` : '📋 Quote'}
                          </button>
                          <button
                            onClick={() => handleGroupCashout(group.yesPricePts, group.totalContractsMicros)}
                            disabled={!quote || !quote.success || executingCashout}
                            style={{
                              padding: '0.5rem 0.75rem',
                              background: (!quote || !quote.success || executingCashout) ? '#4b5563' : '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: (!quote || !quote.success || executingCashout) ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              minWidth: '90px',
                              opacity: (!quote || !quote.success || executingCashout) ? 0.5 : 1
                            }}
                          >
                            {executingCashout ? '⏳...' : '💰 Close'}
                          </button>
                        </div>
                      </div>
                      {quote && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: quote.success ? '#94a3b8' : '#f87171',
                          padding: '0.5rem',
                          background: '#1a1f26',
                          borderRadius: '4px',
                          border: '1px solid #2d3748'
                        }}>
                          {quote.success ? (
                            <>
                              Fillable: {(parseInt(quote.filledContractsMicros) / 1_000_000).toFixed(2)} contracts • 
                              Unfilled: {(parseInt(quote.unfilledContractsMicros) / 1_000_000).toFixed(2)} contracts • 
                              Fee: {formatPence(Number(quote.estimatedFeePence))}
                            </>
                          ) : (
                            <>⚠️ {quote.error || 'Failed to get quote'}</>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Close All button */}
        <div style={{
          borderTop: '1px solid #2d3748',
          padding: '1rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          flexShrink: 0
        }}>
          {/* Cashout Quote Display */}
          {cashoutQuote && cashoutQuote.success && (
            <div style={{
              fontSize: '0.875rem',
              color: '#e4e8eb',
              background: '#10b98115',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #10b98130',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.25rem' }}>
                  💰 Close All Positions Estimate
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Fillable: {(parseInt(cashoutQuote.filledContractsMicros) / 1_000_000).toFixed(2)} contracts • 
                  Unfilled: {(parseInt(cashoutQuote.unfilledContractsMicros) / 1_000_000).toFixed(2)} contracts
                </div>
              </div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: Number(cashoutQuote.netValuePence) >= 0 ? '#10b981' : '#ef4444'
              }}>
                {formatPence(Number(cashoutQuote.netValuePence))}
              </div>
            </div>
          )}
          
          {loadingQuote && (
            <div style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              background: '#1a1f26',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #2d3748',
              textAlign: 'center'
            }}>
              ⏳ Loading cashout quote...
            </div>
          )}

          {liquidationMode && (
            <div style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              background: '#1a1f26',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #2d3748'
            }}>
              💡 <strong>No liquidity?</strong> Use the Close All Positions button - it will close what it can from the orderbook
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleCashout}
              disabled={!cashoutQuote || !cashoutQuote.success || executingCashout}
              style={{
                flex: 1,
                padding: '0.875rem 1.5rem',
                background: executingCashout || !cashoutQuote?.success
                  ? '#4b5563'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: executingCashout || !cashoutQuote?.success ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: executingCashout || !cashoutQuote?.success ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.4)',
                opacity: executingCashout || !cashoutQuote?.success ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!executingCashout && cashoutQuote?.success) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {executingCashout ? '⏳ Processing...' : '💰 Close All Positions'}
            </button>
            <button
              onClick={onClose}
              disabled={executingCashout}
              style={{
                padding: '0.875rem 1.5rem',
                background: '#374151',
                color: '#e4e8eb',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: executingCashout ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: executingCashout ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!executingCashout) {
                  e.currentTarget.style.background = '#4b5563';
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#374151';
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
