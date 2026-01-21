import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form } from "@remix-run/react";
import { getMarket, getMarketOrderBook, getMarketTrades, createOrder, getWallet, getPosition } from "~/lib/api.server";
import { OrderBook } from "~/components/OrderBook";
import { OrderTicket } from "~/components/OrderTicket";
import { TradesTape } from "~/components/TradesTape";
import { PriceChart } from "~/components/PriceChart";
import { PositionPanel } from "~/components/PositionPanel";
import { useEffect, useState } from "react";
import { wsClient } from "~/lib/ws.client";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const marketId = params.marketId!;
  
  try {
    const [market, orderBook, trades] = await Promise.all([
      getMarket(marketId),
      getMarketOrderBook(marketId),
      getMarketTrades(marketId, 50),
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
      // Get current position and orderbook
      const position = await getPosition(request, marketId);
      const orderBook = await getMarketOrderBook(marketId);
      
      if (!position || position.netYesPence === 0) {
        return json({ success: false, error: 'No position to cash out' }, { status: 400 });
      }
      
      // Determine opposite side and aggressive price
      const isLong = position.netYesPence > 0;
      const liabilityPence = Math.abs(position.netYesPence);
      
      // For cash out, place IOC order on opposite side
      // If long (positive net), we need to LAY (sell YES)
      // If short (negative net), we need to FOR (buy YES)
      const side = isLong ? 'LAY' : 'FOR';
      
      // Get aggressive price to cross the spread
      // For LAY: take best bid (buy YES at their price)
      // For FOR: take best ask (sell YES at their price)
      let pPts: number;
      
      if (isLong && orderBook.bids?.length > 0) {
        // LAY at best bid price (canonical YES price)
        const bestBid = orderBook.bids[0];
        pPts = bestBid.side === 'FOR' 
          ? bestBid.pPts 
          : (10_000_000 - bestBid.pPts); // Convert LAY to FOR equivalent
      } else if (!isLong && orderBook.asks?.length > 0) {
        // FOR at best ask price
        const bestAsk = orderBook.asks[0];
        pPts = bestAsk.side === 'FOR'
          ? bestAsk.pPts
          : (10_000_000 - bestAsk.pPts);
      } else {
        return json({ success: false, error: 'Insufficient liquidity to cash out' }, { status: 400 });
      }
      
      // Place IOC order
      const result = await createOrder(request, {
        marketId,
        side: side as 'FOR' | 'LAY',
        pPts,
        liabilityPence,
        timeInForce: 'IOC',
      });

      return json({ success: true, result, message: 'Position closed' });
    }
    
    // Handle regular order placement
    const side = formData.get("side") as 'FOR' | 'LAY';
    const pPts = parseInt(formData.get("pPts") as string);
    const liabilityPence = parseInt(formData.get("liabilityPence") as string);

    const result = await createOrder(request, {
      marketId,
      side,
      pPts,
      liabilityPence,
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

  // Real-time state
  const [trades, setTrades] = useState(loaderData.trades?.trades || []);
  const [orderBook, setOrderBook] = useState(loaderData.orderBook);

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
        // Prepend new trade and limit to 200
        const newTrades = [data, ...prev].slice(0, 200);
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

  return (
    <div style={{ minHeight: '100vh', background: '#f7fafc' }}>
      <nav style={{ 
        padding: '1rem 2rem', 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link to="/" style={{ color: '#667eea', fontSize: '1.5rem', fontWeight: 700, textDecoration: 'none' }}>
          Betting Exchange
        </Link>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/markets" style={{ color: '#4a5568', textDecoration: 'none' }}>Markets</Link>
          {wallet ? (
            <>
              <Link to="/app/wallet" style={{ color: '#4a5568', textDecoration: 'none' }}>
                Balance: ${wallet.balance.toFixed(2)}
              </Link>
              <Link to="/app" style={{ 
                padding: '0.5rem 1rem', 
                background: '#667eea', 
                color: 'white', 
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 600
              }}>
                Dashboard
              </Link>
            </>
          ) : (
            <Link to="/auth/login" style={{ 
              padding: '0.5rem 1rem', 
              background: '#667eea', 
              color: 'white', 
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600
            }}>
              Log In
            </Link>
          )}
        </div>
      </nav>

      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1a202c' }}>
            {market.name || `Market ${marketId}`}
          </h1>
          <p style={{ color: '#718096' }}>Status: {market.status}</p>
        </div>

        {actionData && !actionData.success && (
          <div style={{ 
            padding: '1rem', 
            background: '#fed7d7', 
            color: '#c53030', 
            borderRadius: '6px',
            marginBottom: '1rem'
          }}>
            Error: {actionData.error}
          </div>
        )}

        {actionData && actionData.success && (
          <div style={{ 
            padding: '1rem', 
            background: '#c6f6d5', 
            color: '#22543d', 
            borderRadius: '6px',
            marginBottom: '1rem'
          }}>
            Order submitted successfully! Order ID: {actionData.result.orderId}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
          <PriceChart trades={trades} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Market Info</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                <div><strong>Market ID:</strong> {marketId}</div>
                <div><strong>Status:</strong> {market.status}</div>
                <div><strong>Type:</strong> Exchange</div>
              </div>
            </div>
            {wallet && <PositionPanel position={position} />}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', position: 'relative', zIndex: 2 }}>
          <OrderBook orderBook={orderBook} marketId={marketId} />
          <OrderTicket marketId={marketId} wallet={wallet} />
          <TradesTape trades={trades} marketId={marketId} />
        </div>
      </main>
    </div>
  );
}
