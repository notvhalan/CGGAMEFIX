import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getMarkets } from "~/lib/api.server";
import { useState } from "react";

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Bot control inputs component
function BotControlInputs({ disabled }: { disabled: boolean }) {
  const [midPrice, setMidPrice] = useState(50);
  const [spread, setSpread] = useState(2.5);
  const [takerChance, setTakerChance] = useState(10);

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#cbd5e1'
        }}>
          Mid Price: <span style={{ color: '#667eea' }}>{midPrice}%</span>
        </label>
        <input
          type="range"
          name="midPrice"
          min="10"
          max="90"
          step="1"
          value={midPrice}
          onChange={(e) => setMidPrice(Number(e.target.value))}
          disabled={disabled}
          style={{
            width: '100%',
            accentColor: '#667eea'
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#cbd5e1'
        }}>
          Half Spread: <span style={{ color: '#667eea' }}>{spread}%</span>
        </label>
        <input
          type="range"
          name="spread"
          min="0.5"
          max="10"
          step="0.5"
          value={spread}
          onChange={(e) => setSpread(Number(e.target.value))}
          disabled={disabled}
          style={{
            width: '100%',
            accentColor: '#667eea'
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#cbd5e1'
        }}>
          Number of Levels (per side)
        </label>
        <input
          type="number"
          name="levels"
          min="1"
          max="20"
          defaultValue="8"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '0.625rem',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '0.875rem'
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#cbd5e1'
        }}>
          Size per Order (contracts)
        </label>
        <input
          type="number"
          name="sizeContracts"
          min="0.1"
          max="10"
          step="0.1"
          defaultValue="1.5"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '0.625rem',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '0.875rem'
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#cbd5e1'
        }}>
          Refresh Interval (ms)
        </label>
        <input
          type="number"
          name="refreshMs"
          min="1000"
          max="10000"
          step="100"
          defaultValue="4000"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '0.625rem',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '0.875rem'
          }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#cbd5e1'
        }}>
          Taker Chance: <span style={{ color: '#667eea' }}>{takerChance}%</span>
        </label>
        <input
          type="range"
          name="takerChance"
          min="0"
          max="50"
          step="5"
          value={takerChance}
          onChange={(e) => setTakerChance(Number(e.target.value))}
          disabled={disabled}
          style={{
            width: '100%',
            accentColor: '#667eea'
          }}
        />
      </div>

      {/* Variance Controls */}
      <div style={{ 
        borderTop: '1px solid #334155', 
        paddingTop: '1rem', 
        marginTop: '1rem',
        marginBottom: '1rem'
      }}>
        <h4 style={{ 
          fontSize: '0.875rem', 
          fontWeight: 600, 
          color: '#94a3b8',
          marginBottom: '1rem'
        }}>
          Variance Settings (Optional)
        </h4>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: '#cbd5e1'
          }}>
            Delay Variance (±ms)
          </label>
          <input
            type="number"
            name="delayVarianceMs"
            min="0"
            max="2000"
            step="100"
            defaultValue="0"
            disabled={disabled}
            placeholder="0 = no variance"
            style={{
              width: '100%',
              padding: '0.625rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '0.875rem'
            }}
          />
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem' }}>
            Adds random ±ms to refresh interval
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: '#cbd5e1'
          }}>
            Size Variance (0-1)
          </label>
          <input
            type="number"
            name="sizeVariance"
            min="0"
            max="1"
            step="0.05"
            defaultValue="0"
            disabled={disabled}
            placeholder="0 = no variance"
            style={{
              width: '100%',
              padding: '0.625rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '0.875rem'
            }}
          />
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem' }}>
            e.g., 0.2 = ±20% size variation
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: '#cbd5e1'
          }}>
            Price Variance (±pts)
          </label>
          <input
            type="number"
            name="priceVariance"
            min="0"
            max="500000"
            step="10000"
            defaultValue="0"
            disabled={disabled}
            placeholder="0 = no variance"
            style={{
              width: '100%',
              padding: '0.625rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '0.875rem'
            }}
          />
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem' }}>
            e.g., 50000 = ±0.5% price variation
          </div>
        </div>
      </div>
    </>
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  
  // Simple admin check - you can make this more robust
  const isAdmin = user?.email === 'vhalan02@gmail.com' || user?.email?.includes('@admin');
  
  try {
    const data = await getMarkets();
    return json({ 
      markets: data.markets || [], 
      user,
      isAdmin 
    });
  } catch (error) {
    console.error('Failed to load markets:', error);
    return json({ 
      markets: [], 
      user,
      isAdmin 
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get('action');
  const marketId = formData.get('marketId');
  const cookieHeader = request.headers.get('Cookie');

  if (action === 'start-bots') {
    const userCount = Number(formData.get('userCount') || 20);
    const midPrice = Number(formData.get('midPrice') || 50);
    const spread = Number(formData.get('spread') || 2.5);
    const levels = Number(formData.get('levels') || 8);
    const sizeContracts = Number(formData.get('sizeContracts') || 1.5);
    const refreshMs = Number(formData.get('refreshMs') || 4000);
    const takerChance = Number(formData.get('takerChance') || 10);
    
    // Variance parameters
    const delayVarianceMs = Number(formData.get('delayVarianceMs') || 0);
    const sizeVariance = Number(formData.get('sizeVariance') || 0);
    const priceVariance = Number(formData.get('priceVariance') || 0);

    // Convert percentage values to points (scale of 10,000,000 = 100%)
    const midYesPts = Math.round((midPrice / 100) * 10_000_000);
    const halfSpreadPts = Math.round((spread / 100) * 10_000_000);
    const takerChanceDecimal = takerChance / 100;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/liquidity-bots/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          userCount,
          midYesPts,
          halfSpreadPts,
          levels,
          sizeContracts,
          refreshMs,
          takerChance: takerChanceDecimal,
          delayVarianceMs,
          sizeVariance,
          priceVariance,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return json({ success: false, error }, { status: response.status });
      }

      const result = await response.json();
      return json({ success: true, message: result.message });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to start bots' 
      }, { status: 500 });
    }
  }

  if (action === 'stop-bots') {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/liquidity-bots/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader || '',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const error = await response.text();
        return json({ success: false, error }, { status: response.status });
      }

      const result = await response.json();
      return json({ success: true, message: result.message });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to stop bots' 
      }, { status: 500 });
    }
  }

  if (action === 'create-batch-orders') {
    const batchMarketId = formData.get('batchMarketId');
    const batchSide = formData.get('batchSide') as 'FOR' | 'LAY';
    const batchCount = Number(formData.get('batchCount') || 10);
    const batchPriceFrom = Number(formData.get('batchPriceFrom') || 20);
    const batchPriceTo = Number(formData.get('batchPriceTo') || 80);
    const batchQuantity = Number(formData.get('batchQuantity') || 2.0);

    if (!batchMarketId) {
      return json({ success: false, error: 'Missing market ID' }, { status: 400 });
    }

    if (!user?.id) {
      return json({ success: false, error: 'User ID not found' }, { status: 401 });
    }

    try {
      // Create batch orders by spacing them evenly
      const priceStep = (batchPriceTo - batchPriceFrom) / (batchCount - 1);
      const orderPromises = [];

      for (let i = 0; i < batchCount; i++) {
        const pricePercent = batchPriceFrom + (priceStep * i);
        const yesPts = Math.round((pricePercent / 100) * 10_000_000);
        
        const orderPromise = fetch(`${API_BASE_URL}/v1/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookieHeader || '',
          },
          credentials: 'include',
          body: JSON.stringify({
            marketId: batchMarketId,
            side: batchSide,
            yesPts,
            sizeContracts: batchQuantity,
            timeInForce: 'GTC'
          })
        });

        orderPromises.push(orderPromise);
      }

      const responses = await Promise.all(orderPromises);
      const successCount = responses.filter(r => r.ok).length;
      
      return json({ 
        success: true, 
        message: `Created ${successCount}/${batchCount} orders successfully` 
      });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create batch orders' 
      }, { status: 500 });
    }
  }

  return json({ success: false, error: 'Invalid action' }, { status: 400 });
}

export default function Admin() {
  const { markets, user, isAdmin } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedMarket, setSelectedMarket] = useState(markets[0]?.id || '');
  const [userCount, setUserCount] = useState(20);

  const isStarting = navigation.state === 'submitting' && navigation.formData?.get('action') === 'start-bots';
  const isStopping = navigation.state === 'submitting' && navigation.formData?.get('action') === 'stop-bots';

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '2rem' }}>
        <h1>Not authenticated</h1>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ 
        padding: '1.5rem 2rem', 
        borderBottom: '1px solid #1e293b',
        background: '#0a0f1a'
      }}>
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 700, 
          color: '#667eea',
          margin: 0 
        }}>
          🔧 Admin Panel
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Logged in as: {user.email}
        </p>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Warning if not admin */}
        {!isAdmin && (
          <div style={{
            background: '#78350f',
            border: '1px solid #92400e',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#fef3c7'
          }}>
            ⚠️ You don't have admin privileges. Contact an administrator.
          </div>
        )}

        {/* Feedback Messages */}
        {actionData?.success && 'message' in actionData && (
          <div style={{
            background: '#065f46',
            border: '1px solid #059669',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#d1fae5'
          }}>
            ✅ {actionData.message}
          </div>
        )}

        {actionData && !actionData.success && 'error' in actionData && (
          <div style={{
            background: '#7f1d1d',
            border: '1px solid #991b1b',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#fee2e2'
          }}>
            ❌ {actionData.error}
          </div>
        )}

        {/* Liquidity Bots Section */}
        <div style={{
          background: '#1a1f2e',
          borderRadius: '12px',
          border: '1px solid #2d3748',
          padding: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            marginBottom: '1rem',
            color: '#e2e8f0'
          }}>
            🤖 Liquidity Bot Swarm
          </h2>
          
          <p style={{ 
            color: '#94a3b8', 
            fontSize: '0.875rem', 
            marginBottom: '1.5rem',
            lineHeight: '1.5'
          }}>
            Start automated market makers to seed orderbook depth and generate trades. 
            Bots will place laddered orders around the midpoint and occasionally send taker orders.
          </p>

          <Form method="post">
            <input type="hidden" name="action" value="start-bots" />
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Market
              </label>
              <select
                name="marketId"
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                disabled={!isAdmin}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '0.875rem'
                }}
              >
                {markets.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Number of Bot Users
              </label>
              <input
                type="number"
                name="userCount"
                min="5"
                max="50"
                value={userCount}
                onChange={(e) => setUserCount(Number(e.target.value))}
                disabled={!isAdmin}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '0.875rem'
                }}
              />
              <p style={{ 
                fontSize: '0.75rem', 
                color: '#64748b', 
                marginTop: '0.25rem' 
              }}>
                Recommended: 15-25 bots
              </p>
            </div>

            <BotControlInputs disabled={!isAdmin} />

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="submit"
                disabled={!isAdmin || isStarting}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: isAdmin ? '#667eea' : '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: isAdmin ? 'pointer' : 'not-allowed',
                  opacity: isStarting ? 0.7 : 1
                }}
              >
                {isStarting ? '🔄 Starting...' : '▶️ Start Bots'}
              </button>

              <Form method="post" style={{ display: 'inline' }}>
                <input type="hidden" name="action" value="stop-bots" />
                <button
                  type="submit"
                  disabled={!isAdmin || isStopping}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: isAdmin ? '#dc2626' : '#374151',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: isAdmin ? 'pointer' : 'not-allowed',
                    opacity: isStopping ? 0.7 : 1
                  }}
                >
                  {isStopping ? '🔄 Stopping...' : '⏹️ Stop All Bots'}
                </button>
              </Form>
            </div>
          </Form>
        </div>

        {/* Bot Configuration Info */}
        <div style={{
          background: '#1a1f2e',
          borderRadius: '12px',
          border: '1px solid #2d3748',
          padding: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            marginBottom: '0.75rem',
            color: '#e2e8f0'
          }}>
            ℹ️ Bot Configuration Tips
          </h3>
          <ul style={{ 
            color: '#94a3b8', 
            fontSize: '0.875rem',
            lineHeight: '1.7',
            paddingLeft: '1.5rem',
            margin: 0
          }}>
            <li><strong>Mid Price:</strong> Center of the bid/ask ladder (typically 30-70%)</li>
            <li><strong>Spread:</strong> Distance from mid to first level (0.5-5%)</li>
            <li><strong>Levels:</strong> Number of orders per side (5-15 for depth)</li>
            <li><strong>Size:</strong> Contracts per order (0.5-5.0 typical)</li>
            <li><strong>Refresh:</strong> How often to requote (2-10 seconds)</li>
            <li><strong>Taker:</strong> Chance to cross spread each refresh (5-20%)</li>
          </ul>
        </div>

        {/* Batch Order Creation */}
        <div style={{
          background: '#1a1f2e',
          borderRadius: '12px',
          border: '1px solid #2d3748',
          padding: '1.5rem'
        }}>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            marginBottom: '1rem',
            color: '#e2e8f0'
          }}>
            📋 Batch Order Creation
          </h2>
          
          <p style={{ 
            color: '#94a3b8', 
            fontSize: '0.875rem', 
            marginBottom: '1.5rem',
            lineHeight: '1.5'
          }}>
            Create multiple orders at once with evenly spaced prices. Useful for seeding liquidity or testing order matching.
          </p>

          <Form method="post">
            <input type="hidden" name="action" value="create-batch-orders" />
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Market
              </label>
              <select
                name="batchMarketId"
                defaultValue={selectedMarket}
                disabled={!isAdmin}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '0.875rem'
                }}
              >
                {markets.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#cbd5e1'
                }}>
                  Side
                </label>
                <select
                  name="batchSide"
                  disabled={!isAdmin}
                  defaultValue="FOR"
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="FOR">FOR (Buy)</option>
                  <option value="LAY">LAY (Sell)</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#cbd5e1'
                }}>
                  Number of Orders
                </label>
                <input
                  type="number"
                  name="batchCount"
                  min="1"
                  max="50"
                  defaultValue="10"
                  disabled={!isAdmin}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#cbd5e1'
                }}>
                  From Price (% Yes)
                </label>
                <input
                  type="number"
                  name="batchPriceFrom"
                  min="1"
                  max="99"
                  defaultValue="20"
                  disabled={!isAdmin}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#cbd5e1'
                }}>
                  To Price (% Yes)
                </label>
                <input
                  type="number"
                  name="batchPriceTo"
                  min="1"
                  max="99"
                  defaultValue="80"
                  disabled={!isAdmin}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Quantity (contracts each)
              </label>
              <input
                type="number"
                name="batchQuantity"
                min="0.1"
                max="100"
                step="0.1"
                defaultValue="2.0"
                disabled={!isAdmin}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!isAdmin}
              style={{
                padding: '0.75rem 1.5rem',
                background: isAdmin ? '#10b981' : '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                width: '100%'
              }}
            >
              📝 Create Batch Orders
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
