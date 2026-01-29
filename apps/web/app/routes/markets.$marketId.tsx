import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useRevalidator } from "@remix-run/react";
import { getMarket, getMarketOrderBook, getMarketTrades, createOrder, getWallet, getPosition, cashOutPosition } from "~/lib/api.server";
import { OrderBook } from "~/components/OrderBook";
import { OrderTicket } from "~/components/OrderTicket";
import { TradesTape } from "~/components/TradesTape";
import { PriceChart } from "~/components/PriceChart";
import { PositionPanel } from "~/components/PositionPanel";
import { PositionsModal } from "~/components/PositionsModal";
import { useEffect, useState, useMemo } from "react";
import { wsClient } from "~/lib/ws.client";

// Add CSS animation for toast
const toastStyle = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('toast-style')) {
  const style = document.createElement('style');
  style.id = 'toast-style';
  style.textContent = toastStyle;
  document.head.appendChild(style);
}

// Timeframe options for chart
type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// Helper to format prices
const formatPrice = (pPts: number) => {
  return (pPts / 100_000).toFixed(2) + '%';
};

const formatMoney = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return '£0.00';
  const num = Number(amount);
  if (isNaN(num)) return '£0.00';
  return '£' + num.toFixed(2);
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const marketId = params.marketId!;
  
  try {
    const [market, orderBook, trades] = await Promise.all([
      getMarket(marketId),
      getMarketOrderBook(marketId),
      getMarketTrades(marketId, 500),
    ]);

    // Get wallet and position if user is authenticated
    let wallet = null;
    let position = null;
    try {
      wallet = await getWallet(request);
      position = await getPosition(request, marketId);
    } catch {
      // Not authenticated or fetch failed
    }

    return json({ market, orderBook, trades, wallet, position, marketId });
  } catch (error) {
    throw new Response("Market not found", { status: 404 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const marketId = params.marketId!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    // Handle cash out
    if (intent === "cashout") {
      const percentage = parseInt(formData.get("percentage") as string) || 100;
      const result = await cashOutPosition(request, marketId, percentage);
      
      return json({ 
        success: true, 
        message: result.message,
        orderId: result.orderId
      });
    }
    
    // Handle regular order placement
    const side = formData.get("side") as 'FOR' | 'LAY';
    const pPts = parseInt(formData.get("pPts") as string);
    const liabilityPence = parseInt(formData.get("liabilityPence") as string);
    const timeInForce = (formData.get("timeInForce") as 'GTC' | 'IOC') || 'GTC';

    const result = await createOrder(request, {
      marketId,
      side,
      pPts,
      liabilityPence,
      timeInForce,
    });

    return json({ success: true, result });
  } catch (error: any) {
    console.error('Action error:', error);
    return json({ success: false, error: error.message || 'Action failed' }, { status: 400 });
  }
}

export default function MarketDetail() {
  const loaderData = useLoaderData<typeof loader>();
  const { market, wallet, position, marketId } = loaderData;
  const actionData = useActionData<typeof action>();
  const revalidator = useRevalidator();

  // Real-time state
  const [trades, setTrades] = useState(loaderData.trades?.trades || []);
  const [orderBook, setOrderBook] = useState(loaderData.orderBook);
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [isPositionsModalOpen, setIsPositionsModalOpen] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // Callback to refetch data after cashout
  const handleCashoutSuccess = () => {
    revalidator.revalidate();
  };

  // Show feedback from action results
  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        setOrderFeedback({
          type: 'success',
          message: actionData.message || 'Order placed successfully'
        });
        // Auto-dismiss after 5 seconds
        setTimeout(() => setOrderFeedback(null), 5000);
      } else {
        setOrderFeedback({
          type: 'error',
          message: actionData.error || 'Order failed'
        });
        // Auto-dismiss after 7 seconds
        setTimeout(() => setOrderFeedback(null), 7000);
      }
    }
  }, [actionData]);

  // Calculate market stats from trades
  const marketStats = useMemo(() => {
    if (trades.length === 0) return null;
    
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    );
    
    const lastPrice = sortedTrades[sortedTrades.length - 1].yes_pts;
    const firstPrice = sortedTrades[0]?.yes_pts || lastPrice;
    const priceChange = lastPrice - firstPrice;
    const priceChangePercent = ((priceChange / firstPrice) * 100).toFixed(2);
    
    // 24h volume (sum cost_pence)
    const volume24h = trades.reduce((sum, t) => sum + t.cost_pence, 0);
    
    // Spread calculation
    const bestBid = orderBook.bids?.[0]?.pPts || 0;
    const bestAsk = orderBook.asks?.[0]?.pPts || 0;
    const spread = bestAsk > bestBid ? (bestAsk - bestBid) / 100_000 : 0;
    
    return {
      lastPrice,
      priceChange,
      priceChangePercent: parseFloat(priceChangePercent),
      volume24h,
      spread,
      numTrades: trades.length,
    };
  }, [trades, orderBook]);

  useEffect(() => {
    // Connect to WebSocket
    wsClient.connect();

    // Subscribe to market events
    const bookTopic = `book:${marketId}`;
    const tradeTopic = `trades:${marketId}`;
    
    wsClient.subscribe(bookTopic);
    wsClient.subscribe(tradeTopic);

    // Handle order book updates
    const handleBookUpdate = (data: any) => {
      console.log('[Market] Book update:', data);
      if (data.orderBook) {
        setOrderBook(data.orderBook);
      }
    };

    // Handle trade events
    const handleTrade = (data: any) => {
      console.log('[Market] Trade:', data);
      setTrades(prev => {
        // Prepend new trade and limit to 500
        const newTrades = [data, ...prev].slice(0, 500);
        return newTrades;
      });
    };

    wsClient.on('book_update', handleBookUpdate);
    wsClient.on('trade', handleTrade);

    // Cleanup
    return () => {
      wsClient.off('book_update', handleBookUpdate);
      wsClient.off('trade', handleTrade);
      wsClient.unsubscribe(bookTopic);
      wsClient.unsubscribe(tradeTopic);
    };
  }, [marketId]);

  // Handle clicking price in orderbook to auto-fill ticket
  const handlePriceClick = (pPts: number) => {
    setSelectedPrice(pPts);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f1419',
      color: '#e4e8eb',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Header Bar */}
      <div style={{ 
        background: '#1a1f26', 
        borderBottom: '1px solid #2d3748',
        padding: '0.5rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Link to="/" style={{ 
          color: '#667eea', 
          fontSize: '1.25rem', 
          fontWeight: 700, 
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span>📊</span>
          <span>Exchange</span>
        </Link>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
          <Link to="/markets" style={{ color: '#94a3b8', textDecoration: 'none', fontWeight: 500 }}>Markets</Link>
          {wallet ? (
            <>
              <span style={{ color: '#94a3b8' }}>
                Balance: <span style={{ color: '#10b981', fontWeight: 600 }}>{formatMoney(wallet.balance)}</span>
              </span>
              <Link to="/app" style={{ 
                padding: '0.4rem 0.875rem', 
                background: '#667eea', 
                color: 'white', 
                borderRadius: '4px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.8125rem'
              }}>
                Dashboard
              </Link>
            </>
          ) : (
            <Link to="/auth/login" style={{ 
              padding: '0.4rem 0.875rem', 
              background: '#667eea', 
              color: 'white', 
              borderRadius: '4px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem'
            }}>
              Log In
            </Link>
          )}
        </div>
      </div>

      {/* Market Header Bar */}
      <div style={{
        background: '#1a1f26',
        borderBottom: '1px solid #2d3748',
        padding: '0.75rem 1rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ 
              fontSize: '1.125rem', 
              fontWeight: 700, 
              color: '#e4e8eb', 
              margin: 0 
            }}>
              {market.name || `Market ${marketId.substring(0, 8)}`}
            </h1>
            <span style={{ 
              fontSize: '0.6875rem', 
              color: market.status === 'ACTIVE' ? '#10b981' : '#64748b',
              background: market.status === 'ACTIVE' ? '#10b98120' : '#64748b20',
              padding: '0.25rem 0.5rem',
              borderRadius: '3px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {market.status}
            </span>
            {market.endTime && (
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Ends: {new Date(market.endTime).toLocaleString()}
              </span>
            )}
          </div>
          
          {/* Market Stats Strip */}
          {marketStats && (
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#64748b', marginRight: '0.5rem' }}>Last:</span>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#e4e8eb' }}>
                  {formatPrice(marketStats.lastPrice)}
                </span>
              </div>
              <div>
                <span style={{ 
                  fontWeight: 600, 
                  color: marketStats.priceChangePercent >= 0 ? '#10b981' : '#ef4444' 
                }}>
                  {marketStats.priceChangePercent >= 0 ? '▲' : '▼'} {Math.abs(marketStats.priceChangePercent).toFixed(2)}%
                </span>
              </div>
              <div>
                <span style={{ color: '#64748b', marginRight: '0.5rem' }}>24h Vol:</span>
                <span style={{ fontWeight: 600 }}>{formatMoney(marketStats.volume24h)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', marginRight: '0.5rem' }}>Spread:</span>
                <span style={{ fontWeight: 600 }}>{marketStats.spread.toFixed(2)}%</span>
              </div>
              <div>
                <span style={{ color: '#64748b', marginRight: '0.5rem' }}>Trades:</span>
                <span style={{ fontWeight: 600 }}>{marketStats.numTrades}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {actionData && !actionData.success && (
        <div style={{ 
          padding: '0.75rem 1rem', 
          background: '#7f1d1d', 
          color: '#fca5a5', 
          borderBottom: '1px solid #991b1b',
          fontSize: '0.875rem'
        }}>
          ⚠️ {actionData.error}
        </div>
      )}

      {actionData && actionData.success && (
        <div style={{ 
          padding: '0.75rem 1rem', 
          background: '#14532d', 
          color: '#86efac', 
          borderBottom: '1px solid #166534',
          fontSize: '0.875rem'
        }}>
          ✓ {actionData.message || `Order submitted! ID: ${actionData.result.orderId?.substring(0, 8)}`}
        </div>
      )}

      {/* 3-Column Terminal Layout */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'minmax(520px, 1fr) 360px 340px',
        gridTemplateRows: 'calc(100vh - 120px - 240px) 240px',
        gap: '1px',
        background: '#2d3748',
        height: 'calc(100vh - 120px)',
        minHeight: '600px',
        overflow: 'hidden'
      }}>
        {/* LEFT: Chart Panel (col 1, row 1) */}
        <div style={{ 
          background: '#1a1f26',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%'
        }}>
          {/* Timeframe Controls */}
          <div style={{ 
            padding: '0.5rem 0.75rem',
            borderBottom: '1px solid #2d3748',
            display: 'flex',
            gap: '0.5rem',
            flexShrink: 0
          }}>
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  padding: '0.25rem 0.625rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: timeframe === tf ? '#667eea' : 'transparent',
                  color: timeframe === tf ? 'white' : '#94a3b8',
                  border: '1px solid',
                  borderColor: timeframe === tf ? '#667eea' : '#374151',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
          
          {/* Chart Component */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '0.75rem' }}>
            <PriceChart trades={trades} timeframe={timeframe} marketId={marketId} />
          </div>
        </div>

        {/* MIDDLE: Order Book (col 2, row 1) */}
        <div style={{ 
          background: '#1a1f26',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%'
        }}>
          <div style={{ 
            padding: '0.625rem 0.875rem',
            borderBottom: '1px solid #2d3748',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flexShrink: 0
          }}>
            Order Book
          </div>
          <OrderBook 
            orderBook={orderBook} 
            marketId={marketId} 
            onPriceClick={handlePriceClick}
            compact={true}
          />
        </div>

        {/* RIGHT: Ticket + Position (col 3, row 1) */}
        <div style={{ 
          background: '#1a1f26',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%'
        }}>
          {/* Sticky Ticket */}
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ 
              padding: '0.625rem 0.875rem',
              borderBottom: '1px solid #2d3748',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Place Order
            </div>
            <OrderTicket 
              marketId={marketId} 
              wallet={wallet}
              selectedPrice={selectedPrice}
              compact={true}
            />
          </div>

          {/* Position Panel */}
          {wallet && position && (
            <div style={{ 
              borderTop: '1px solid #2d3748',
              flex: '1 1 auto',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <PositionPanel 
                position={position} 
                compact={true} 
                onOpenDetails={() => setIsPositionsModalOpen(true)}
              />
            </div>
          )}

          {/* Market Info (Collapsible) */}
          <div style={{ 
            borderTop: '1px solid #2d3748',
            padding: '0.875rem',
            fontSize: '0.75rem',
            color: '#94a3b8',
            flexShrink: 0
          }}>
            <details>
              <summary style={{ 
                fontWeight: 700, 
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                marginBottom: '0.5rem'
              }}>
                Market Info
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', paddingLeft: '0.5rem' }}>
                {market.description && (
                  <div style={{ marginBottom: '0.5rem', color: '#cbd5e0', lineHeight: '1.4' }}>
                    {market.description}
                  </div>
                )}
                <div><strong>Type:</strong> {market.type || 'BINARY'}</div>
                {market.outcomes && (
                  <div><strong>Outcomes:</strong> {market.outcomes.join(' / ')}</div>
                )}
                {market.minStake && market.maxStake && (
                  <div><strong>Limits:</strong> {formatMoney(market.minStake)} - {formatMoney(market.maxStake)}</div>
                )}
                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.375rem' }}>
                  ID: {marketId.substring(0, 12)}...
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* BOTTOM: Trades Tape + Tabs (spans all 3 columns, row 2) */}
        <div style={{ 
          gridColumn: '1 / -1',
          background: '#1a1f26',
          borderTop: '1px solid #2d3748',
          height: '240px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ 
            padding: '0.5rem 0.875rem',
            borderBottom: '1px solid #2d3748',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'flex',
            gap: '1.5rem',
            flexShrink: 0
          }}>
            <span style={{ color: '#667eea', borderBottom: '2px solid #667eea', paddingBottom: '0.5rem' }}>
              Recent Trades
            </span>
            <span style={{ cursor: 'pointer' }}>Open Orders</span>
            <span 
              style={{ cursor: 'pointer' }}
              onClick={() => position && setIsPositionsModalOpen(true)}
            >
              Positions
            </span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <TradesTape trades={trades} marketId={marketId} compact={true} />
          </div>
        </div>
      </div>

      {/* Positions Modal */}
      {position && position.netContractsMicros !== '0' && (
        <PositionsModal
          position={position}
          isOpen={isPositionsModalOpen}
          onClose={() => setIsPositionsModalOpen(false)}
          onCashoutSuccess={handleCashoutSuccess}
          marketId={marketId}
        />
      )}

      {/* Order Feedback Toast */}
      {orderFeedback && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: orderFeedback.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          minWidth: '300px',
          maxWidth: '500px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ fontSize: '1.5rem' }}>
            {orderFeedback.type === 'success' ? '✓' : '⚠️'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              {orderFeedback.type === 'success' ? 'Success' : 'Failed'}
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.95 }}>
              {orderFeedback.message}
            </div>
          </div>
          <button
            onClick={() => setOrderFeedback(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0',
              lineHeight: 1,
              opacity: 0.8
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

