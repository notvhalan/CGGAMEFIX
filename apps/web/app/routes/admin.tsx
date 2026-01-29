import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getMarkets } from "~/lib/api.server";
import { useState } from "react";

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

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
  const userCount = Number(formData.get('userCount') || 20);
  const cookieHeader = request.headers.get('Cookie');

  if (action === 'start-bots') {
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
          midYesPts: 5000000, // 50%
          halfSpreadPts: 250000, // 2.5%
          levels: 8,
          sizeContracts: 1.5,
          refreshMs: 4000,
          takerChance: 0.10,
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
          padding: '1.5rem'
        }}>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            marginBottom: '0.75rem',
            color: '#e2e8f0'
          }}>
            ℹ️ Bot Configuration
          </h3>
          <ul style={{ 
            color: '#94a3b8', 
            fontSize: '0.875rem',
            lineHeight: '1.7',
            paddingLeft: '1.5rem',
            margin: 0
          }}>
            <li>Midpoint: 50% (5,000,000 pts)</li>
            <li>Spread: ±2.5% (250,000 pts)</li>
            <li>Ladder levels: 8 per side</li>
            <li>Order size: 1.5 contracts each</li>
            <li>Refresh interval: 4 seconds</li>
            <li>Taker chance: 10% per refresh</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
