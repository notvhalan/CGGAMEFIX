import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getMarkets } from "~/lib/api.server";
import { useState, useRef } from "react";

const API_BASE_URL = typeof window !== 'undefined' && window.ENV?.API_URL 
  ? window.ENV.API_URL 
  : (process.env.API_BASE_URL || 'http://localhost:3000');

const SUBCATEGORIES: Record<string, { slug: string; label: string; template: string }[]> = {
  life: [
    { slug: 'paralysis-cure',    label: 'Paralysis Cure',            template: 'Will a cure for paralysis be discovered before {date}?' },
    { slug: 'alzheimers-cure',   label: "Alzheimer's Cure",          template: "Will an approved cure for Alzheimer's disease be available before {date}?" },
    { slug: 'parkinsons-cure',   label: "Parkinson's Cure",          template: "Will an approved Parkinson's disease reversal therapy be available before {date}?" },
    { slug: 'cancer-universal',  label: 'Universal Cancer Cure',     template: 'Will a universal cancer cure receive regulatory approval before {date}?' },
    { slug: 'heart-reversal',    label: 'Heart Disease Reversal',    template: 'Will a restorative coronary heart disease therapy be approved before {date}?' },
    { slug: 'diabetes-cure',     label: 'Type 1 Diabetes Cure',      template: 'Will a clinical cure for Type 1 diabetes be approved before {date}?' },
  ],
  health: [
    { slug: 'ae-wait-12h',       label: 'A&E 12h Wait Threshold',    template: 'Will UK A&E average wait times exceed 12 hours nationally before {date}?' },
    { slug: 'nhs-emergency',     label: 'NHS Financial Emergency',   template: 'Will NHS England declare a financial emergency before {date}?' },
    { slug: 'amr-deaths',        label: 'AMR Deaths Threshold',      template: 'Will AMR-related UK hospital deaths exceed 50,000 in the year ending {date}?' },
    { slug: 'winter-crisis',     label: 'NHS Winter Beds Crisis',    template: 'Will NHS England report fewer than 2,000 spare acute beds on any day before {date}?' },
  ],
  climate: [
    { slug: 'hurricane-us',      label: 'US Hurricane Landfall',     template: 'Will a Category 4+ hurricane make US mainland landfall before {date}?' },
    { slug: 'uk-major-flood',    label: 'UK Major Flood',            template: 'Will a major UK flood event displace 10,000+ residents before {date}?' },
    { slug: 'arctic-ice-free',   label: 'Arctic Ice-Free Day',       template: 'Will the Arctic Ocean be effectively ice-free in September before {date}?' },
    { slug: 'global-temp-record',label: 'Global Temp Record',        template: 'Will a new global mean surface temperature record be set before {date}?' },
  ],
  agriculture: [
    { slug: 'wheat-yield',       label: 'UK Wheat Shortfall',        template: 'Will UK national wheat yield fall below 7.5 t/ha before {date}?' },
    { slug: 'uk-drought',        label: 'Severe UK Drought',         template: 'Will the Met Office declare a national drought before {date}?' },
    { slug: 'crop-blight',       label: 'Crop Blight Outbreak',      template: 'Will a crop blight reduce UK harvest by 20%+ before {date}?' },
    { slug: 'food-price-spike',  label: 'Food Price Spike',          template: 'Will UK food CPI inflation exceed 15% year-on-year before {date}?' },
  ],
  liability: [
    { slug: 'auto-claims-500m',  label: 'Auto Liability £500M',      template: 'Will aggregate UK auto liability claims exceed £500M before {date}?' },
    { slug: 'cyber-1b',          label: 'Cyber Incident £1B',        template: 'Will a single cyber event cause £1B+ UK economic damage before {date}?' },
    { slug: 'product-recall-1m', label: 'Mass Product Recall',       template: 'Will a UK product recall affect 1M+ consumers before {date}?' },
    { slug: 'class-action',      label: 'Major Class Action',        template: 'Will a UK class action lawsuit exceed £100M in claimed damages before {date}?' },
  ],
  travel: [
    { slug: 'lhr-jfk-cancel',    label: 'LHR–JFK Cancellation Rate', template: 'Will LHR–JFK cancellation rate exceed 15% weekly before {date}?' },
    { slug: 'ash-cloud-48h',     label: 'Volcanic Ash Closure',      template: 'Will volcanic ash close European airspace for 48+ hours before {date}?' },
    { slug: 'who-travel-ban',    label: 'WHO Travel Ban',            template: 'Will the WHO declare a travel restriction affecting UK airports before {date}?' },
    { slug: 'uk-airport-strike', label: 'UK Airport Strike',         template: 'Will a UK airport worker strike cancel 500+ flights before {date}?' },
  ],
};

const BOT_PRESETS = [
  { label: '⚡ Fastest',        mid: 50, spread: 0.5, taker: 40, levels: 3,  size: 5,  delay: 0,    delayVar: 0,    sizeVar: 0, priceVar: 0, refresh: 1000,  drift: 50000,  vol: 0.5 },
  { label: '💧 Deep Liquidity', mid: 50, spread: 5,   taker: 5,  levels: 15, size: 20, delay: 5000, delayVar: 1000, sizeVar: 0, priceVar: 0, refresh: 15000, drift: 50000,  vol: 0.1 },
  { label: '⚖️ Balanced',       mid: 50, spread: 2.5, taker: 10, levels: 8,  size: 10, delay: 2000, delayVar: 1000, sizeVar: 0, priceVar: 0, refresh: 5000,  drift: 200000, vol: 0.3 },
  { label: '🎯 Tight Market',   mid: 50, spread: 1,   taker: 20, levels: 5,  size: 8,  delay: 1000, delayVar: 500,  sizeVar: 0, priceVar: 0, refresh: 3000,  drift: 150000, vol: 0.4 },
] as const;

type BotPreset = typeof BOT_PRESETS[number];

// Bot control inputs component
function BotControlInputs({
  disabled,
  initMidPrice = 50,
  initSpread = 2.5,
  initTakerChance = 10,
  initLevels = 8,
  initSizeContracts = 10.0,
  initOrderDelayMs = 12000,
  initOrderDelayVarianceMs = 2000,
  initSizeVariance = 0,
  initPriceVariance = 0,
  initRefreshIntervalMs = 5000,
  initPriceDriftPts = 200000,
  initVolatility = 0.3,
}: {
  disabled: boolean;
  initMidPrice?: number;
  initSpread?: number;
  initTakerChance?: number;
  initLevels?: number;
  initSizeContracts?: number;
  initOrderDelayMs?: number;
  initOrderDelayVarianceMs?: number;
  initSizeVariance?: number;
  initPriceVariance?: number;
  initRefreshIntervalMs?: number;
  initPriceDriftPts?: number;
  initVolatility?: number;
}) {
  const [midPrice, setMidPrice] = useState(initMidPrice);
  const [spread, setSpread] = useState(initSpread);
  const [takerChance, setTakerChance] = useState(initTakerChance);

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
        <p style={{ 
          fontSize: '0.75rem', 
          color: '#64748b', 
          marginTop: '0.25rem',
          lineHeight: '1.4'
        }}>
          Center point for all bot orders. Bots will place orders spread around this price.
        </p>
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
        <p style={{ 
          fontSize: '0.75rem', 
          color: '#64748b', 
          marginTop: '0.25rem',
          lineHeight: '1.4'
        }}>
          Distance from mid price to furthest orders. Larger = wider orderbook depth.
        </p>
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
          defaultValue={initLevels}
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
        <p style={{ 
          fontSize: '0.75rem', 
          color: '#64748b', 
          marginTop: '0.25rem',
          lineHeight: '1.4'
        }}>
          Number of price levels per side (FOR/LAY). Each bot places 2 orders per level (1 FOR, 1 LAY). 8 levels = 16 orders per bot.
        </p>
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
          min="2.0"
          max="20"
          step="0.5"
          defaultValue={initSizeContracts}
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
        <p style={{ 
          fontSize: '0.75rem', 
          color: '#64748b', 
          marginTop: '0.25rem',
          lineHeight: '1.4'
        }}>
          Number of contracts per order. Minimum 2.0 to ensure orders meet £1.00 minimum risk. Higher = more liquidity.
        </p>
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
        <p style={{ 
          fontSize: '0.75rem', 
          color: '#64748b', 
          marginTop: '0.25rem',
          lineHeight: '1.4'
        }}>
          Probability each bot will place an aggressive market order (to generate trades). 0% = only passive orders.
        </p>
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
          Advanced Settings (Optional)
        </h4>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: '#cbd5e1'
          }}>
            Order Delay (ms)
          </label>
          <input
            type="number"
            name="orderDelayMs"
            min="0"
            max="30000"
            step="1000"
            defaultValue={initOrderDelayMs}
            disabled={disabled}
            placeholder="12000"
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            Time delay between placing each order. With 8 levels (16 orders) and 12000ms delay, orders spread over ~3.2 minutes. Set to 0 for instant placement.
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
            Order Delay Variance (±ms)
          </label>
          <input
            type="number"
            name="orderDelayVarianceMs"
            min="0"
            max="10000"
            step="500"
            defaultValue={initOrderDelayVarianceMs}
            disabled={disabled}
            placeholder="2000"
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            Random variance added to order delay. Example: 12000ms ± 2000ms = orders delayed 10-14 seconds each. Makes bot timing less predictable.
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
            defaultValue={initSizeVariance}
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            Randomize order sizes. Example: 0.2 = ±20% variation. If base size is 1.5 contracts, orders will be 1.2-1.8 contracts.
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
            defaultValue={initPriceVariance}
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            Randomize order prices. Example: 50000 = ±0.5% variation. Creates more realistic, less uniform orderbook.
          </div>
        </div>
      </div>

      {/* Dynamic Price Movement */}
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
          🎲 Dynamic Price Movement
        </h4>

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
            name="refreshIntervalMs"
            min="0"
            max="60000"
            step="1000"
            defaultValue={initRefreshIntervalMs}
            disabled={disabled}
            placeholder="0 = never refresh"
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            How often bots cancel and replace orders with new prices. Example: 5000ms = refresh every 5 seconds. Set to 0 to disable dynamic pricing.
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
            Price Drift (±pts per refresh)
          </label>
          <input
            type="number"
            name="priceDriftPts"
            min="0"
            max="1000000"
            step="50000"
            defaultValue={initPriceDriftPts}
            disabled={disabled}
            placeholder="0 = no drift"
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            Maximum price movement per refresh. Example: 200000 = ±2% per refresh. Creates realistic price fluctuations. Includes mean reversion to prevent runaway drift.
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
            Volatility (0-1)
          </label>
          <input
            type="number"
            name="volatility"
            min="0"
            max="1"
            step="0.1"
            defaultValue={initVolatility}
            disabled={disabled}
            placeholder="0 = calm, 1 = very volatile"
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
          <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', lineHeight: '1.4' }}>
            Price volatility factor. Higher = more dramatic price swings. Lower = gentler movements. Multiplies drift amount.
          </div>
        </div>
      </div>
    </>
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  
  // Admin email whitelist - must match backend admin.controller.ts
  const ADMIN_EMAILS = [
    'vhalan02@gmail.com',
    'developer@gmail.com',
  ];
  
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;
  
  try {
    const data = await getMarkets();
    
    // Fetch available bot users if admin
    let botUsers = [];
    if (isAdmin) {
      try {
        const botUsersResponse = await fetch(`${API_BASE_URL}/v1/admin/bot-users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('Cookie') || '',
          },
          body: JSON.stringify({}),
        });
        
        if (botUsersResponse.ok) {
          const botData = await botUsersResponse.json();
          botUsers = botData.botUsers || [];
        }
      } catch (error) {
        console.error('Failed to load bot users:', error);
      }
    }
    
    return json({ 
      markets: data.markets || [], 
      user,
      isAdmin,
      botUsers,
    });
  } catch (error) {
    console.error('Failed to load markets:', error);
    return json({ 
      markets: [], 
      user,
      isAdmin,
      botUsers: [],
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
    const sizeContracts = Number(formData.get('sizeContracts') || 5.0);
    const takerChance = Number(formData.get('takerChance') || 10);
    
    // Variance parameters
    const sizeVariance = Number(formData.get('sizeVariance') || 0);
    const priceVariance = Number(formData.get('priceVariance') || 0);
    const orderDelayMs = Number(formData.get('orderDelayMs') || 0);
    const orderDelayVarianceMs = Number(formData.get('orderDelayVarianceMs') || 0);
    
    // Dynamic price movement parameters
    const refreshIntervalMs = Number(formData.get('refreshIntervalMs') || 0);
    const priceDriftPts = Number(formData.get('priceDriftPts') || 0);
    const volatility = Number(formData.get('volatility') || 0);

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
          takerChance: takerChanceDecimal,
          sizeVariance,
          priceVariance,
          orderDelayMs,
          orderDelayVarianceMs,
          refreshIntervalMs,
          priceDriftPts,
          volatility,
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

  if (action === 'resolveMarket') {
    const winningOutcome = formData.get('winningOutcome') as 'YES' | 'NO';
    const reason = formData.get('reason') as string;

    if (!marketId || !winningOutcome) {
      return json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/markets/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          winningOutcome,
          reason,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return json({ success: false, error }, { status: response.status });
      }

      const result = await response.json();
      return json({ 
        success: true, 
        message: `${result.message} - Settled ${result.positionsSettled} positions` 
      });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to resolve market' 
      }, { status: 500 });
    }
  }

  if (action === 'voidMarket') {
    const reason = formData.get('reason') as string;

    if (!marketId || !reason) {
      return json({ success: false, error: 'Market ID and reason required' }, { status: 400 });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/markets/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
          reason,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return json({ success: false, error }, { status: response.status });
      }

      const result = await response.json();
      return json({ 
        success: true, 
        message: `${result.message} - Voided ${result.positionsVoided} positions` 
      });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to void market' 
      }, { status: 500 });
    }
  }

  if (action === 'resetMarketStatus') {
    if (!marketId) {
      return json({ success: false, error: 'Market ID required' }, { status: 400 });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/markets/reset-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader || '',
        },
        credentials: 'include',
        body: JSON.stringify({
          marketId,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return json({ success: false, error }, { status: response.status });
      }

      const result = await response.json();
      return json({ 
        success: true, 
        message: result.message
      });
    } catch (error) {
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to reset market status' 
      }, { status: 500 });
    }
  }

  if (action === 'bulk-create-insurance') {
    const slug = formData.get('insCategory') as string;
    const count = Number(formData.get('insCount') || 6);
    const startOffsetDays = Number(formData.get('insStartOffset') || 30);
    const spacingDays = Number(formData.get('insSpacingDays') || 30);

    if (!slug) {
      return json({ success: false, error: 'Insurance category is required' }, { status: 400 });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/insurance/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader || '',
        },
        credentials: 'include',
        body: JSON.stringify({ slug, count, startOffsetDays, spacingDays, customName: formData.get('insCustomName') as string || undefined, conditionName: formData.get('insConditionName') as string || undefined }),
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
        error: error instanceof Error ? error.message : 'Failed to create insurance contracts',
      }, { status: 500 });
    }
  }

  if (action === 'delete-insurance-group') {
    const slug = formData.get('delCategory') as string;
    const conditionName = formData.get('delCondition') as string | null;
    if (!slug) return json({ success: false, error: 'Category is required' }, { status: 400 });
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/insurance/delete-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
        credentials: 'include',
        body: JSON.stringify({ slug, conditionName: conditionName || undefined }),
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
        error: error instanceof Error ? error.message : 'Failed to delete insurance contracts',
      }, { status: 500 });
    }
  }
}

export default function Admin() {
  const { markets, user, isAdmin, botUsers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedMarket, setSelectedMarket] = useState(markets[0]?.id || '');
  const [userCount, setUserCount] = useState(Math.min(20, botUsers?.length || 20));

  // Bot preset state
  const [botPresetKey, setBotPresetKey] = useState(0);
  const [botInit, setBotInit] = useState({
    midPrice: 50, spread: 2.5, takerChance: 10, levels: 8, sizeContracts: 10.0,
    orderDelayMs: 12000, orderDelayVarianceMs: 2000, sizeVariance: 0, priceVariance: 0,
    refreshIntervalMs: 5000, priceDriftPts: 200000, volatility: 0.3,
  });
  const applyBotPreset = (p: BotPreset) => {
    setBotInit({
      midPrice: p.mid, spread: p.spread, takerChance: p.taker, levels: p.levels,
      sizeContracts: p.size, orderDelayMs: p.delay, orderDelayVarianceMs: p.delayVar,
      sizeVariance: p.sizeVar, priceVariance: p.priceVar, refreshIntervalMs: p.refresh,
      priceDriftPts: p.drift, volatility: p.vol,
    });
    setBotPresetKey(k => k + 1);
  };

  // Insurance contract factory state
  const [insCategory, setInsCategory] = useState('life');
  const [insSubcategory, setInsSubcategory] = useState('');
  const [insCount, setInsCount] = useState(6);
  const [insStartOffset, setInsStartOffset] = useState(30);
  const [insSpacingDays, setInsSpacingDays] = useState(30);
  const [insCustomName, setInsCustomName] = useState('');

  const handleInsCategory = (cat: string) => {
    setInsCategory(cat);
    setInsSubcategory('');
    setInsCustomName('');
  };
  const handleInsSubcategory = (subSlug: string) => {
    setInsSubcategory(subSlug);
    const sub = SUBCATEGORIES[insCategory]?.find(s => s.slug === subSlug);
    if (sub) setInsCustomName(sub.template);
    else if (!subSlug) setInsCustomName('');
  };
  const activeSubLabel = insSubcategory
    ? (SUBCATEGORIES[insCategory]?.find(s => s.slug === insSubcategory)?.label ?? '')
    : '';

  const INS_SERIES: Record<string, { icon: string; label: string; series: string }> = {
    life:        { icon: '🫀', label: 'Life / Mortality',         series: 'Mortality Risk Index' },
    health:      { icon: '🏥', label: 'Health / Critical Illness', series: 'Critical Illness Tracker' },
    climate:     { icon: '🌡️', label: 'Climate / Weather',         series: 'Climate Risk Benchmark' },
    agriculture: { icon: '🌾', label: 'Agriculture / Crop',        series: 'Harvest Yield Contract' },
    liability:   { icon: '⚖️', label: 'Liability / Legal',         series: 'Liability Exposure Index' },
    travel:      { icon: '✈️', label: 'Travel / Cancellation',     series: 'Travel Disruption Cover' },
  };

  const insSeries = INS_SERIES[insCategory]?.series ?? insCategory;
  const insPreviewContracts = Array.from({ length: Math.min(insCount, 12) }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + insStartOffset + i * insSpacingDays);
    const shortDate = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const longDate  = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const idx = String(i + 1).padStart(2, '0');
    let displayName: string;
    if (insCustomName.trim()) {
      const resolved = insCustomName.trim().replace(/\{date\}/gi, shortDate);
      displayName = `${resolved} [#${idx}]`;
    } else {
      displayName = `${insSeries} · ${shortDate} [#${idx}]`;
    }
    return { name: displayName, maturity: longDate };
  });

  const isCreatingInsurance = navigation.state === 'submitting' && navigation.formData?.get('action') === 'bulk-create-insurance';
  const isDeletingInsurance  = navigation.state === 'submitting' && navigation.formData?.get('action') === 'delete-insurance-group';

  const [delCategory,  setDelCategory]  = useState('life');
  const [delCondition, setDelCondition] = useState('');
  const [delConfirmed, setDelConfirmed] = useState(false);

  // Reset confirm state after a delete action lands
  const prevDeleting = useRef(false);
  if (isDeletingInsurance) prevDeleting.current = true;
  else if (prevDeleting.current) { prevDeleting.current = false; setDelConfirmed(false); }

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
                min="1"
                max={botUsers?.length || 50}
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
                {botUsers && botUsers.length > 0 
                  ? `${botUsers.length} bot users available (@bot.local emails)`
                  : 'No bot users found. Create users with @bot.local emails first.'}
              </p>
              {botUsers && botUsers.length > 0 && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ 
                    cursor: 'pointer', 
                    fontSize: '0.75rem', 
                    color: '#667eea',
                    userSelect: 'none'
                  }}>
                    View available bots ({botUsers.length})
                  </summary>
                  <div style={{ 
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: '#1e293b',
                    borderRadius: '4px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontSize: '0.7rem',
                    color: '#94a3b8'
                  }}>
                    {botUsers.map((bot: any, idx: number) => (
                      <div key={bot.id} style={{ marginBottom: '0.25rem' }}>
                        {idx + 1}. {bot.name || 'Bot'} ({bot.email})
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Bot Quick Presets */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                ⚡ Quick Presets
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {BOT_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => applyBotPreset(preset)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: isAdmin ? 'pointer' : 'not-allowed',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (isAdmin) (e.target as HTMLButtonElement).style.borderColor = '#667eea'; }}
                    onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = '#475569'; }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                Presets auto-fill all parameters below. Click a preset, then hit Start Bots.
              </p>
            </div>

            <BotControlInputs
              key={botPresetKey}
              disabled={!isAdmin}
              initMidPrice={botInit.midPrice}
              initSpread={botInit.spread}
              initTakerChance={botInit.takerChance}
              initLevels={botInit.levels}
              initSizeContracts={botInit.sizeContracts}
              initOrderDelayMs={botInit.orderDelayMs}
              initOrderDelayVarianceMs={botInit.orderDelayVarianceMs}
              initSizeVariance={botInit.sizeVariance}
              initPriceVariance={botInit.priceVariance}
              initRefreshIntervalMs={botInit.refreshIntervalMs}
              initPriceDriftPts={botInit.priceDriftPts}
              initVolatility={botInit.volatility}
            />

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

        {/* Insurance Contract Factory */}
        <div style={{
          background: '#1a1f2e',
          borderRadius: '12px',
          border: '1px solid #4c1d95',
          borderLeft: '4px solid #8b5cf6',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}>
          {/* Panel Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '2.5rem', height: '2.5rem', borderRadius: '8px',
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.125rem', flexShrink: 0,
            }}>🏥</div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                Insurance Contract Factory
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.8125rem', marginTop: '0.25rem', lineHeight: '1.5' }}>
                Generate a dated series of insurance contracts. Names follow the{' '}
                <span style={{ color: '#a78bfa', fontStyle: 'italic' }}>"Series · Month YYYY [#NN]"</span> convention.
              </p>
            </div>
          </div>

          <Form method="post">
            <input type="hidden" name="action" value="bulk-create-insurance" />
            <input type="hidden" name="insSpacingDays" value={String(insSpacingDays)} />
            <input type="hidden" name="insConditionName" value={activeSubLabel} />

            {/* Custom contract name */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Contract Question <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — leave blank for default series name)</span>
              </label>
              <input
                type="text"
                name="insCustomName"
                value={insCustomName}
                onChange={e => setInsCustomName(e.target.value)}
                disabled={!isAdmin}
                placeholder="e.g. Will a cure for paralysis be discovered before {date}?"
                style={{
                  width: '100%', padding: '0.625rem 0.75rem',
                  background: '#0f172a', border: `1px solid ${insCustomName.trim() ? '#8b5cf6' : '#334155'}`,
                  borderRadius: '8px', color: '#e2e8f0', fontSize: '0.875rem',
                  outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.375rem', lineHeight: 1.5 }}>
                Use <code style={{ background: '#1e293b', padding: '0.1em 0.35em', borderRadius: '3px', color: '#a78bfa', fontSize: '0.7rem' }}>&#123;date&#125;</code>
                {' '}as a placeholder — it will be substituted with each contract&apos;s maturity month.
              </p>
            </div>

            {/* Row 1: Category + Count */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Category
                </label>
                <select
                  name="insCategory"
                  value={insCategory}
                  onChange={e => handleInsCategory(e.target.value)}
                  disabled={!isAdmin}
                  style={{ width: '100%', padding: '0.625rem 0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none' }}
                >
                  {Object.entries(INS_SERIES).map(([slug, v]) => (
                    <option key={slug} value={slug}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Subcategory
                </label>
                <select
                  value={insSubcategory}
                  onChange={e => handleInsSubcategory(e.target.value)}
                  disabled={!isAdmin}
                  style={{
                    width: '100%', padding: '0.625rem 0.75rem', background: '#0f172a',
                    border: `1px solid ${insSubcategory ? '#8b5cf6' : '#334155'}`,
                    borderRadius: '8px', color: insSubcategory ? '#c4b5fd' : '#94a3b8',
                    fontSize: '0.875rem', outline: 'none',
                  }}
                >
                  <option value="">— select or type custom below —</option>
                  {SUBCATEGORIES[insCategory]?.map(s => (
                    <option key={s.slug} value={s.slug}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Number of Contracts
                </label>
                <input
                  type="number"
                  name="insCount"
                  min="1" max="24"
                  value={insCount}
                  onChange={e => setInsCount(Math.max(1, Math.min(24, Number(e.target.value))))}
                  disabled={!isAdmin}
                  style={{ width: '100%', padding: '0.625rem 0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.875rem' }}
                />
              </div>
            </div>

            {/* Row 2: Start offset + Spacing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  First Maturity (days from today)
                </label>
                <input
                  type="number"
                  name="insStartOffset"
                  min="1" max="365"
                  value={insStartOffset}
                  onChange={e => setInsStartOffset(Number(e.target.value))}
                  disabled={!isAdmin}
                  style={{ width: '100%', padding: '0.625rem 0.75rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.875rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Contract Spacing
                </label>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {[{ label: 'Weekly', days: 7 }, { label: 'Fortnightly', days: 14 }, { label: 'Monthly', days: 30 }, { label: 'Quarterly', days: 90 }].map(opt => (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => setInsSpacingDays(opt.days)}
                      style={{
                        padding: '0.375rem 0.625rem',
                        background: insSpacingDays === opt.days ? 'rgba(139,92,246,0.2)' : 'transparent',
                        border: `1px solid ${insSpacingDays === opt.days ? '#8b5cf6' : '#334155'}`,
                        borderRadius: '6px', color: insSpacingDays === opt.days ? '#a78bfa' : '#94a3b8',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1" max="365"
                    value={insSpacingDays}
                    onChange={e => setInsSpacingDays(Number(e.target.value))}
                    disabled={!isAdmin}
                    title="Custom spacing in days"
                    style={{ width: '64px', padding: '0.375rem 0.5rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.75rem', textAlign: 'center' }}
                  />
                </div>
              </div>
            </div>

            {/* Contract Name Preview */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.625rem', fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Contract Name Preview
              </label>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2.5rem 1fr 7rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e293b', background: '#0a0f1a' }}>
                  <span style={{ fontSize: '0.6875rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>#</span>
                  <span style={{ fontSize: '0.6875rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contract Name</span>
                  <span style={{ fontSize: '0.6875rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Maturity</span>
                </div>
                {/* Rows */}
                {insPreviewContracts.map((contract, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid', gridTemplateColumns: '2.5rem 1fr 7rem',
                      padding: '0.5rem 0.75rem',
                      borderBottom: i < insPreviewContracts.length - 1 ? '1px solid #1e293b' : 'none',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 700, color: '#7c3aed',
                      fontFamily: 'monospace',
                      background: 'rgba(139,92,246,0.1)', borderRadius: '4px',
                      padding: '0.125rem 0.375rem', display: 'inline-block',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '0.8125rem', color: '#e2e8f0', paddingLeft: '0.25rem', fontFamily: 'monospace', letterSpacing: '-0.01em' }}>
                      {contract.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right' }}>
                      {contract.maturity}
                    </span>
                  </div>
                ))}
                {insCount > 12 && (
                  <div style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#4b5563' }}>
                    ·· {insCount - 12} more contracts not shown ··
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={!isAdmin || isCreatingInsurance}
              style={{
                padding: '0.75rem 1.5rem',
                background: isAdmin ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                opacity: isCreatingInsurance ? 0.7 : 1,
                width: '100%',
                letterSpacing: '0.02em',
              }}
            >
              {isCreatingInsurance
                ? '⏳ Creating contracts…'
                : `Generate ${insCount} × ${INS_SERIES[insCategory]?.series ?? insCategory}`}
            </button>
          </Form>

          {/* ── Delete Insurance Contracts ──────────────────────────────── */}
          <div style={{
            marginTop: '1.5rem',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '0.625rem 1rem',
              background: 'rgba(239,68,68,0.07)',
              borderBottom: '1px solid rgba(239,68,68,0.18)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ fontSize: '0.875rem' }}>🗑️</span>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#fca5a5' }}>Delete Insurance Contracts</span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(239,68,68,0.6)', marginLeft: '0.25rem' }}>
                Removes ACTIVE / PENDING contracts only
              </span>
            </div>

            <div style={{ padding: '1rem' }}>
              <Form method="post" onSubmit={() => setDelConfirmed(false)}>
                <input type="hidden" name="action" value="delete-insurance-group" />
                <input type="hidden" name="delCondition" value={delCondition} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.875rem' }}>
                  {/* Category */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 600, fontSize: '0.75rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Category
                    </label>
                    <select
                      name="delCategory"
                      value={delCategory}
                      onChange={e => { setDelCategory(e.target.value); setDelCondition(''); setDelConfirmed(false); }}
                      disabled={!isAdmin}
                      style={{ width: '100%', padding: '0.5rem 0.625rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: '#e2e8f0', fontSize: '0.8125rem', outline: 'none' }}
                    >
                      {Object.entries(INS_SERIES).map(([slug, v]) => (
                        <option key={slug} value={slug}>{v.icon} {v.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Subcategory / condition */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 600, fontSize: '0.75rem', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Subcategory
                    </label>
                    <select
                      value={delCondition}
                      onChange={e => { setDelCondition(e.target.value); setDelConfirmed(false); }}
                      disabled={!isAdmin}
                      style={{
                        width: '100%', padding: '0.5rem 0.625rem', background: '#0f172a',
                        border: `1px solid ${delCondition ? 'rgba(239,68,68,0.4)' : '#334155'}`,
                        borderRadius: '7px',
                        color: delCondition ? '#fca5a5' : '#94a3b8',
                        fontSize: '0.8125rem', outline: 'none',
                      }}
                    >
                      <option value="">— All contracts in category —</option>
                      {SUBCATEGORIES[delCategory]?.map(s => (
                        <option key={s.slug} value={s.label}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Scope hint */}
                <div style={{
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: 'rgba(252,165,165,0.8)',
                  marginBottom: '0.875rem',
                  lineHeight: 1.5,
                }}>
                  Will delete all <strong>ACTIVE</strong> / <strong>PENDING</strong> markets in{' '}
                  <span style={{ color: '#fca5a5', fontWeight: 600 }}>
                    {INS_SERIES[delCategory]?.label ?? delCategory}
                    {delCondition ? ` › ${delCondition}` : ' (entire category)'}
                  </span>
                </div>

                {/* Confirm toggle + button */}
                {!delConfirmed ? (
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setDelConfirmed(true)}
                    style={{
                      width: '100%', padding: '0.6rem 1rem',
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.5)',
                      borderRadius: '7px',
                      color: '#fca5a5',
                      fontWeight: 600, fontSize: '0.875rem',
                      cursor: isAdmin ? 'pointer' : 'not-allowed',
                      opacity: isAdmin ? 1 : 0.5,
                      letterSpacing: '0.02em',
                    }}
                  >
                    🗑️ Delete Group…
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setDelConfirmed(false)}
                      style={{
                        flex: 1, padding: '0.6rem 1rem',
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: '7px',
                        color: '#94a3b8',
                        fontWeight: 600, fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >Cancel</button>
                    <button
                      type="submit"
                      disabled={!isAdmin || isDeletingInsurance}
                      style={{
                        flex: 2, padding: '0.6rem 1rem',
                        background: 'rgba(239,68,68,0.15)',
                        border: '1px solid rgba(239,68,68,0.6)',
                        borderRadius: '7px',
                        color: '#f87171',
                        fontWeight: 700, fontSize: '0.875rem',
                        cursor: isAdmin ? 'pointer' : 'not-allowed',
                        opacity: isDeletingInsurance ? 0.6 : 1,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {isDeletingInsurance ? '⏳ Deleting…' : '⚠️ Confirm Delete'}
                    </button>
                  </div>
                )}
              </Form>
            </div>
          </div>

        </div>

        {/* Market Settlement Section */}
        <div style={{ 
          background: '#1e293b',
          borderRadius: '8px',
          padding: '1.5rem',
          border: '1px solid #334155'
        }}>
          <h2 style={{ 
            fontSize: '1.125rem', 
            fontWeight: 600, 
            marginBottom: '1rem',
            color: '#f1f5f9'
          }}>
            🏁 Market Settlement
          </h2>

          <Form method="post" style={{ marginBottom: '1.5rem' }}>
            <input type="hidden" name="action" value="resolveMarket" />
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Market to Resolve
              </label>
              <select
                name="marketId"
                required
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
                <option value="">Select a market...</option>
                {markets.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name} ({market.status})
                  </option>
                ))}
              </select>
              <p style={{ 
                fontSize: '0.75rem', 
                color: '#64748b', 
                marginTop: '0.25rem',
                lineHeight: '1.4'
              }}>
                Shows all markets. If a market failed to settle, use "Reset Status" section below.
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Winning Outcome
              </label>
              <select
                name="winningOutcome"
                required
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
                <option value="">Select winner...</option>
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Reason (optional)
              </label>
              <input
                type="text"
                name="reason"
                placeholder="e.g., Match ended 2-1"
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
                background: isAdmin ? '#f59e0b' : '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                width: '100%'
              }}
            >
              ✅ Resolve Market
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="action" value="voidMarket" />
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Market to Void (returns all funds)
              </label>
              <select
                name="marketId"
                required
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
                <option value="">Select a market...</option>
                {markets.map((market: any) => (
                  <option key={market.id} value={market.id}>
                    {market.name} ({market.status})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#cbd5e1'
              }}>
                Reason (required)
              </label>
              <input
                type="text"
                name="reason"
                placeholder="e.g., Match cancelled due to weather"
                required
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
                background: isAdmin ? '#ef4444' : '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: isAdmin ? 'pointer' : 'not-allowed',
                width: '100%'
              }}
            >
              ❌ Void Market
            </button>
          </Form>

          <div style={{ 
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #334155'
          }}>
            <h3 style={{ 
              fontSize: '0.875rem', 
              fontWeight: 600, 
              marginBottom: '1rem',
              color: '#cbd5e1'
            }}>Reset Failed Settlement</h3>
            <p style={{ 
              fontSize: '0.75rem', 
              color: '#64748b', 
              marginBottom: '1rem',
              lineHeight: '1.4'
            }}>
              If a settlement failed but the market status was updated, use this to reset it back to ACTIVE.
            </p>
            <Form method="post">
              <input type="hidden" name="action" value="resetMarketStatus" />
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#cbd5e1'
                }}>
                  Market to Reset
                </label>
                <select
                  name="marketId"
                  required
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
                  <option value="">Select a market...</option>
                  {markets.filter((m: any) => m.status === 'SETTLED' || m.status === 'CLOSED').map((market: any) => (
                    <option key={market.id} value={market.id}>
                      {market.name} ({market.status})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={!isAdmin}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: isAdmin ? '#3b82f6' : '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: isAdmin ? 'pointer' : 'not-allowed',
                  width: '100%'
                }}
              >
                🔄 Reset to ACTIVE
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
