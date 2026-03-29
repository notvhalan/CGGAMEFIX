import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useActionData, useLoaderData, useLocation, useNavigate } from "@remix-run/react";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getMarkets } from "~/lib/api.server";
import { AdminLayout } from "~/components/admin/layout/AdminLayout";
import "~/styles/admin.css";

const API_BASE_URL = typeof window !== 'undefined' && window.ENV?.API_URL 
  ? window.ENV.API_URL 
  : (process.env.API_BASE_URL || 'http://localhost:3000');

// ─── Insurance subcategories (used by contract factory child route) ─────────
export const SUBCATEGORIES: Record<string, { slug: string; label: string; template: string }[]> = {
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

export const BOT_PRESETS = [
  { label: '⚡ Fastest',        mid: 50, spread: 0.5, taker: 40, levels: 3,  size: 5,  delay: 0,    delayVar: 0,    sizeVar: 0, priceVar: 0, refresh: 1000,  drift: 50000,  vol: 0.5 },
  { label: '💧 Deep Liquidity', mid: 50, spread: 5,   taker: 5,  levels: 15, size: 20, delay: 5000, delayVar: 1000, sizeVar: 0, priceVar: 0, refresh: 15000, drift: 50000,  vol: 0.1 },
  { label: '⚖️ Balanced',       mid: 50, spread: 2.5, taker: 10, levels: 8,  size: 10, delay: 2000, delayVar: 1000, sizeVar: 0, priceVar: 0, refresh: 5000,  drift: 200000, vol: 0.3 },
  { label: '🎯 Tight Market',   mid: 50, spread: 1,   taker: 20, levels: 5,  size: 8,  delay: 1000, delayVar: 500,  sizeVar: 0, priceVar: 0, refresh: 3000,  drift: 150000, vol: 0.4 },
] as const;

export type BotPreset = typeof BOT_PRESETS[number];

export const INS_SERIES: Record<string, { icon: string; label: string; series: string }> = {
  life:        { icon: '🫀', label: 'Life / Mortality',         series: 'Mortality Risk Index' },
  health:      { icon: '🏥', label: 'Health / Critical Illness', series: 'Critical Illness Tracker' },
  climate:     { icon: '🌡️', label: 'Climate / Weather',         series: 'Climate Risk Benchmark' },
  agriculture: { icon: '🌾', label: 'Agriculture / Crop',        series: 'Harvest Yield Contract' },
  liability:   { icon: '⚖️', label: 'Liability / Legal',         series: 'Liability Exposure Index' },
  travel:      { icon: '✈️', label: 'Travel / Cancellation',     series: 'Travel Disruption Cover' },
};

// ─── Loader ─────────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  
  const ADMIN_EMAILS = [
    'vhalan02@gmail.com',
    'developer@gmail.com',
  ];
  
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;
  
  try {
    const data = await getMarkets();
    
    let botUsers: any[] = [];
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

// ─── Action (handles all admin mutations) ────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const actionType = formData.get('action');
  const marketId = formData.get('marketId');
  const cookieHeader = request.headers.get('Cookie');

  if (actionType === 'start-bots') {
    const userCount = Number(formData.get('userCount') || 20);
    const midPrice = Number(formData.get('midPrice') || 50);
    const spread = Number(formData.get('spread') || 2.5);
    const levels = Number(formData.get('levels') || 8);
    const sizeContracts = Number(formData.get('sizeContracts') || 5.0);
    const takerChance = Number(formData.get('takerChance') || 10);
    const sizeVariance = Number(formData.get('sizeVariance') || 0);
    const priceVariance = Number(formData.get('priceVariance') || 0);
    const orderDelayMs = Number(formData.get('orderDelayMs') || 0);
    const orderDelayVarianceMs = Number(formData.get('orderDelayVarianceMs') || 0);
    const refreshIntervalMs = Number(formData.get('refreshIntervalMs') || 0);
    const priceDriftPts = Number(formData.get('priceDriftPts') || 0);
    const volatility = Number(formData.get('volatility') || 0);

    const midYesPts = Math.round((midPrice / 100) * 10_000_000);
    const halfSpreadPts = Math.round((spread / 100) * 10_000_000);
    const takerChanceDecimal = takerChance / 100;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/liquidity-bots/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
        credentials: 'include',
        body: JSON.stringify({
          marketId, userCount, midYesPts, halfSpreadPts, levels, sizeContracts,
          takerChance: takerChanceDecimal, sizeVariance, priceVariance,
          orderDelayMs, orderDelayVarianceMs, refreshIntervalMs, priceDriftPts, volatility,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return json({ success: false, error }, { status: response.status });
      }
      const result = await response.json();
      return json({ success: true, message: result.message });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to start bots' }, { status: 500 });
    }
  }

  if (actionType === 'stop-bots') {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/liquidity-bots/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
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
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to stop bots' }, { status: 500 });
    }
  }

  if (actionType === 'create-batch-orders') {
    const batchMarketId = formData.get('batchMarketId');
    const batchSide = formData.get('batchSide') as 'FOR' | 'LAY';
    const batchCount = Number(formData.get('batchCount') || 10);
    const batchPriceFrom = Number(formData.get('batchPriceFrom') || 20);
    const batchPriceTo = Number(formData.get('batchPriceTo') || 80);
    const batchQuantity = Number(formData.get('batchQuantity') || 2.0);

    if (!batchMarketId) return json({ success: false, error: 'Missing market ID' }, { status: 400 });
    if (!user?.id) return json({ success: false, error: 'User ID not found' }, { status: 401 });

    try {
      const priceStep = (batchPriceTo - batchPriceFrom) / (batchCount - 1);
      const orderPromises = [];
      for (let i = 0; i < batchCount; i++) {
        const pricePercent = batchPriceFrom + (priceStep * i);
        const yesPts = Math.round((pricePercent / 100) * 10_000_000);
        orderPromises.push(
          fetch(`${API_BASE_URL}/v1/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
            credentials: 'include',
            body: JSON.stringify({ marketId: batchMarketId, side: batchSide, yesPts, sizeContracts: batchQuantity, timeInForce: 'GTC' }),
          })
        );
      }
      const responses = await Promise.all(orderPromises);
      const successCount = responses.filter(r => r.ok).length;
      return json({ success: true, message: `Created ${successCount}/${batchCount} orders successfully` });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to create batch orders' }, { status: 500 });
    }
  }

  if (actionType === 'resolveMarket') {
    const winningOutcome = formData.get('winningOutcome') as 'YES' | 'NO';
    const reason = formData.get('reason') as string;
    if (!marketId || !winningOutcome) return json({ success: false, error: 'Missing required fields' }, { status: 400 });
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/markets/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
        credentials: 'include',
        body: JSON.stringify({ marketId, winningOutcome, reason }),
      });
      if (!response.ok) { const error = await response.text(); return json({ success: false, error }, { status: response.status }); }
      const result = await response.json();
      return json({ success: true, message: `${result.message} - Settled ${result.positionsSettled} positions` });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to resolve market' }, { status: 500 });
    }
  }

  if (actionType === 'voidMarket') {
    const reason = formData.get('reason') as string;
    if (!marketId || !reason) return json({ success: false, error: 'Market ID and reason required' }, { status: 400 });
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/markets/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
        credentials: 'include',
        body: JSON.stringify({ marketId, reason }),
      });
      if (!response.ok) { const error = await response.text(); return json({ success: false, error }, { status: response.status }); }
      const result = await response.json();
      return json({ success: true, message: `${result.message} - Voided ${result.positionsVoided} positions` });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to void market' }, { status: 500 });
    }
  }

  if (actionType === 'resetMarketStatus') {
    if (!marketId) return json({ success: false, error: 'Market ID required' }, { status: 400 });
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/markets/reset-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
        credentials: 'include',
        body: JSON.stringify({ marketId }),
      });
      if (!response.ok) { const error = await response.text(); return json({ success: false, error }, { status: response.status }); }
      const result = await response.json();
      return json({ success: true, message: result.message });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to reset market status' }, { status: 500 });
    }
  }

  if (actionType === 'bulk-create-insurance') {
    const slug = formData.get('insCategory') as string;
    const count = Number(formData.get('insCount') || 6);
    const startOffsetDays = Number(formData.get('insStartOffset') || 30);
    const spacingDays = Number(formData.get('insSpacingDays') || 30);
    if (!slug) return json({ success: false, error: 'Insurance category is required' }, { status: 400 });
    try {
      const response = await fetch(`${API_BASE_URL}/v1/admin/insurance/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader || '' },
        credentials: 'include',
        body: JSON.stringify({ slug, count, startOffsetDays, spacingDays, customName: formData.get('insCustomName') as string || undefined, conditionName: formData.get('insConditionName') as string || undefined }),
      });
      if (!response.ok) { const error = await response.text(); return json({ success: false, error }, { status: response.status }); }
      const result = await response.json();
      return json({ success: true, message: result.message });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to create insurance contracts' }, { status: 500 });
    }
  }

  if (actionType === 'delete-insurance-group') {
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
      if (!response.ok) { const error = await response.text(); return json({ success: false, error }, { status: response.status }); }
      const result = await response.json();
      return json({ success: true, message: result.message });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete insurance contracts' }, { status: 500 });
    }
  }

  return json({ success: false, error: 'Unknown action' }, { status: 400 });
}

// ─── Route → Page ID mapping ────────────────────────────────────────────────

function routeToPageId(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return 'overview';
  const segment = pathname.replace('/admin/', '').replace('/admin', '');
  const map: Record<string, string> = {
    '': 'overview',
    'markets': 'markets',
    'bots': 'liquidity-bots',
    'orders': 'orders',
    'contracts': 'contract-factory',
    'settlement': 'settlement',
    'users': 'users',
    'analytics': 'analytics',
    'audit': 'audit-logs',
    'risk': 'risk-controls',
  };
  // Handle nested like markets/m1
  const base = segment.split('/')[0];
  return map[base] || 'overview';
}

function pageIdToRoute(pageId: string): string {
  const map: Record<string, string> = {
    'overview': '/admin',
    'markets': '/admin/markets',
    'liquidity-bots': '/admin/bots',
    'orders': '/admin/orders',
    'contract-factory': '/admin/contracts',
    'settlement': '/admin/settlement',
    'users': '/admin/users',
    'analytics': '/admin/analytics',
    'audit-logs': '/admin/audit',
    'risk-controls': '/admin/risk',
  };
  return map[pageId] || '/admin';
}

// ─── Default Export ──────────────────────────────────────────────────────────

export default function Admin() {
  const { user, isAdmin } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const location = useLocation();
  const navigate = useNavigate();
  
  const activePage = routeToPageId(location.pathname);

  const handleNavigate = (pageId: string) => {
    navigate(pageIdToRoute(pageId));
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-admin-bg text-admin-text flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Not Authenticated</h1>
          <p className="text-admin-text-dim">Please log in to access the admin panel.</p>
          <a href="/auth/login" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
            Go to Login →
          </a>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout activePage={activePage} onNavigate={handleNavigate}>
      {/* Permission Warning */}
      {!isAdmin && (
        <div className="mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-sm">
          ⚠️ You don't have admin privileges. Some actions may be restricted. Contact an administrator.
        </div>
      )}

      {/* Action Feedback */}
      {actionData?.success && 'message' in actionData && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm">
          ✅ {actionData.message}
        </div>
      )}
      {actionData && !actionData.success && 'error' in actionData && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
          ❌ {actionData.error}
        </div>
      )}

      <Outlet />
    </AdminLayout>
  );
}
