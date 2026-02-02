import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form, useRevalidator } from "@remix-run/react";
import { getMarket, getMarketOrderBook, getMarketTrades, createOrder, getWallet, getPosition, cashOutPosition, getUserOrders, cancelOrder } from "~/lib/api.server";
import { OrderBook } from "~/components/OrderBook";
import { OrderTicket } from "~/components/OrderTicket";
import { TradesTape } from "~/components/TradesTape";
import { PriceChart } from "~/components/PriceChart";
import { PositionPanel } from "~/components/PositionPanel";
import { PositionsModal } from "~/components/PositionsModal";
import OpenOrders from "~/components/OpenOrders";
import { useEffect, useState, useMemo } from "react";
import { wsClient } from "~/lib/ws.client";
import { TrendingUp, TrendingDown } from "lucide-react";
import "~/styles/components/controls.css";

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
type Timeframe = 'tick' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

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

    // Get wallet, position, and orders if user is authenticated
    let wallet = null;
    let position = null;
    let userOrders = null;
    try {
      wallet = await getWallet(request);
      position = await getPosition(request, marketId);
      userOrders = await getUserOrders(request, marketId);
    } catch {
      // Not authenticated or fetch failed
    }

    return json({ market, orderBook, trades, wallet, position, userOrders, marketId });
  } catch (error) {
    throw new Response("Market not found", { status: 404 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const marketId = params.marketId!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    // Handle multiple order cancellation
    if (intent === "cancelMany") {
      const orderIds = formData.getAll("orderIds").map(String);
      await Promise.all(orderIds.map(id => cancelOrder(request, id)));
      
      return json({ 
        success: true, 
        message: `Cancelled ${orderIds.length} ${orderIds.length === 1 ? 'order' : 'orders'}`
      });
    }
    
    // Handle single order cancellation
    if (intent === "cancel") {
      const orderId = formData.get("orderId") as string;
      const result = await cancelOrder(request, orderId);
      
      return json({ 
        success: true, 
        message: `Order ${orderId.substring(0, 8)} cancelled`,
        result
      });
    }
    
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
  const [lastTrade, setLastTrade] = useState<any | null>(null);
  const [orderBook, setOrderBook] = useState(loaderData.orderBook);
  const [timeframe, setTimeframe] = useState<Timeframe>('tick');
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [isPositionsModalOpen, setIsPositionsModalOpen] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isToastExiting, setIsToastExiting] = useState(false);
  const [activeTab, setActiveTab] = useState<'trades' | 'orders' | 'positions'>('trades');
  const [userOrders, setUserOrders] = useState(loaderData.userOrders);

  // Sync userOrders with loaderData when it changes (after revalidation)
  useEffect(() => {
    setUserOrders(loaderData.userOrders);
  }, [loaderData.userOrders]);
  
  // Callback to refetch data after cashout
  const handleCashoutSuccess = () => {
    revalidator.revalidate();
  };

  // Show feedback from action results
  useEffect(() => {
    if (actionData) {
      setIsToastExiting(false);
      if (actionData.success) {
        setOrderFeedback({
          type: 'success',
          message: actionData.message || 'Order placed successfully'
        });
        // Trigger exit animation, then remove after animation completes
        setTimeout(() => setIsToastExiting(true), 4700); // Start exit animation
        setTimeout(() => setOrderFeedback(null), 5000); // Remove after animation
        // Revalidate to refetch user orders and position
        revalidator.revalidate();
      } else {
        setOrderFeedback({
          type: 'error',
          message: actionData.error || 'Order failed'
        });
        // Trigger exit animation, then remove after animation completes
        setTimeout(() => setIsToastExiting(true), 6700); // Start exit animation
        setTimeout(() => setOrderFeedback(null), 7000); // Remove after animation
      }
    }
  }, [actionData, revalidator]);

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
    // console.log('[Market] Connecting to WebSocket for market:', marketId);
    wsClient.connect();

    // Subscribe to market events
    const bookTopic = `book:${marketId}`;
    const tradeTopic = `trades:${marketId}`;
    
    // console.log('[Market] Subscribing to topics:', { bookTopic, tradeTopic });
    wsClient.subscribe(bookTopic);
    wsClient.subscribe(tradeTopic);

    // Handle order book updates
    const handleBookUpdate = (data: any) => {
      // console.log('[Market] 📊 Real-time book update received:', data);
      if (data.orderBook) {
        setOrderBook(data.orderBook);
      } else if (data) {
        // If data itself is the orderBook
        setOrderBook(data);
      }
    };

    // Handle trade events
    const handleTrade = (data: any) => {
      // console.log('[Market] 💰 Real-time trade received:', data);
      setLastTrade(data);
      
      setTrades(prev => {
        // Prepend new trade and limit to 500
        const newTrades = [data, ...prev].slice(0, 500);
        return newTrades;
      });
      
      // Auto-refresh position after trade (if user is involved)
      if (wallet && (data.maker_id === wallet.userId || data.taker_id === wallet.userId)) {
        // console.log('[Market] User involved in trade, revalidating...');
        revalidator.revalidate();
      }
    };

    wsClient.on('book_update', handleBookUpdate);
    wsClient.on('trade', handleTrade);

    // console.log('[Market] WebSocket handlers registered');

    // Cleanup
    return () => {
      // console.log('[Market] Cleaning up WebSocket subscriptions');
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
                  color: marketStats.priceChangePercent >= 0 ? '#10b981' : '#ef4444',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  {marketStats.priceChangePercent >= 0 ? (
                    <TrendingUp size={14} />
                  ) : (
                    <TrendingDown size={14} />
                  )}
                  {Math.abs(marketStats.priceChangePercent).toFixed(2)}%
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

      {/* 3-Column Terminal Layout */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'minmax(520px, 1fr) 360px 340px',
        gridTemplateRows: 'calc(100vh - 120px - 180px) 180px',
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
            {(['tick', '1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map(tf => (
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
            <PriceChart trades={trades} lastTrade={lastTrade} timeframe={timeframe} marketId={marketId} />
          </div>
        </div>

        {/* MIDDLE: Order Book + Position + Market Info (col 2, row 1) */}
        <div style={{ 
          background: '#1a1f26',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%'
        }}>
          {/* Order Book at top */}
          <div style={{ 
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0
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

          {/* Position Panel below orderbook */}
          {wallet && position && (
            <div style={{ 
              borderTop: '1px solid #2d3748',
              flex: '0 0 auto',
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

          {/* Market Info below position (Collapsible) */}
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

        {/* RIGHT: Order Ticket (col 3, row 1) */}
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
            letterSpacing: '0.05em'
          }}>
            Place Order
          </div>
          <div style={{ overflow: 'auto' }}>
            <OrderTicket 
              marketId={marketId} 
              wallet={wallet}
              selectedPrice={selectedPrice}
              bestBidPPts={orderBook?.bids?.[0]?.yesPts ?? null}
              bestAskPPts={orderBook?.asks?.[0]?.yesPts ?? null}
              lastTradePPts={trades?.[0]?.yes_pts ?? null}
              compact={true}
            />
          </div>
        </div>

        {/* BOTTOM: Trades Tape + Tabs (spans all 3 columns, row 2) */}
        <div style={{ 
          gridColumn: '1 / -1',
          background: '#1a1f26',
          borderTop: '1px solid #2d3748',
          height: '180px',
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
            <span 
              style={{ 
                color: activeTab === 'trades' ? '#667eea' : '#94a3b8',
                borderBottom: activeTab === 'trades' ? '2px solid #667eea' : 'none',
                paddingBottom: '0.5rem',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('trades')}
            >
              Recent Trades
            </span>
            <span 
              style={{ 
                color: activeTab === 'orders' ? '#667eea' : '#94a3b8',
                borderBottom: activeTab === 'orders' ? '2px solid #667eea' : 'none',
                paddingBottom: '0.5rem',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('orders')}
            >
              Open Orders
            </span>
            <span 
              style={{ 
                color: activeTab === 'positions' ? '#667eea' : '#94a3b8',
                borderBottom: activeTab === 'positions' ? '2px solid #667eea' : 'none',
                paddingBottom: '0.5rem',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (position && BigInt(position.netContractsMicros || '0') !== 0n) {
                  setIsPositionsModalOpen(true);
                }
              }}
            >
              Positions
            </span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: activeTab === 'orders' ? '0.875rem' : '0' }}>
            {activeTab === 'trades' && <TradesTape trades={trades} marketId={marketId} compact={true} />}
            {activeTab === 'orders' && <OpenOrders orders={userOrders} />}
          </div>
        </div>
      </div>

      {/* Positions Modal */}
      {position && BigInt(position.netContractsMicros || '0') !== 0n && (
        <PositionsModal
          position={position}
          isOpen={isPositionsModalOpen}
          onClose={() => setIsPositionsModalOpen(false)}
          onCashoutSuccess={handleCashoutSuccess}
          marketId={marketId}
          orderBook={orderBook}
        />
      )}


    </div>
  );
}

