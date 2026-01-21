import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, Link, Form } from "@remix-run/react";
import { getMarket, getMarketOrderBook, getMarketTrades, createOrder, getWallet } from "~/lib/api.server";
import { OrderBook } from "~/components/OrderBook";
import { OrderTicket } from "~/components/OrderTicket";
import { TradesTape } from "~/components/TradesTape";
import { PriceChart } from "~/components/PriceChart";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const marketId = params.marketId!;
  
  try {
    const [market, orderBook, trades] = await Promise.all([
      getMarket(marketId),
      getMarketOrderBook(marketId),
      getMarketTrades(marketId, 50),
    ]);

    // Get wallet if user is authenticated
    let wallet = null;
    try {
      wallet = await getWallet(request);
    } catch {
      // Not authenticated or wallet fetch failed
    }

    return json({ market, orderBook, trades, wallet, marketId });
  } catch (error) {
    throw new Response("Market not found", { status: 404 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const marketId = params.marketId!;
  const formData = await request.formData();
  
  const side = formData.get("side") as 'BACK' | 'LAY';
  const odds = parseFloat(formData.get("odds") as string);
  const stake = parseFloat(formData.get("stake") as string);

  try {
    const result = await createOrder(request, {
      marketId,
      side,
      odds,
      stake,
      // outcomeId is optional - omit for now since we don't have outcomes set up
    });

    return json({ success: true, result });
  } catch (error: any) {
    console.error('Order creation error:', error);
    return json({ success: false, error: error.message || 'Failed to create order' }, { status: 400 });
  }
}

export default function MarketDetail() {
  const { market, orderBook, trades, wallet, marketId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <PriceChart />
          <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Market Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
              <div><strong>Market ID:</strong> {marketId}</div>
              <div><strong>Status:</strong> {market.status}</div>
              <div><strong>Type:</strong> Exchange</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <OrderBook orderBook={orderBook} marketId={marketId} />
          <OrderTicket marketId={marketId} wallet={wallet} />
          <TradesTape trades={trades.trades || []} marketId={marketId} />
        </div>
      </main>
    </div>
  );
}
