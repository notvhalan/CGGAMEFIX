const API_BASE_URL = process.env.API_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Send cookies with cross-origin requests
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API request failed: ${response.statusText}`
    );
  }

  return response.json();
}

// Market APIs
export async function getMarkets() {
  return fetchApi<{ markets: any[] }>('/v1/markets');
}

export async function getMarket(marketId: string) {
  return fetchApi<any>(`/v1/markets/${marketId}`);
}

export async function getMarketOrderBook(marketId: string) {
  return fetchApi<any>(`/v1/markets/${marketId}/book`);
}

export async function getMarketTrades(marketId: string, limit = 50) {
  return fetchApi<any>(`/v1/markets/${marketId}/trades?limit=${limit}`);
}

// Position APIs
export async function getPosition(request: Request, marketId: string) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{
    netYesPence: number;
    netContractsMicros: string;
    avgEntryYesPts: number;
    markYesPts: number;
    unrealizedPnlPence: number;
    totalFeesPence: number;
    canCashOut: boolean;
  }>(`/v1/positions/markets/${marketId}/me`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

export async function cashOutPosition(request: Request, marketId: string, percentage = 100) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{
    success: boolean;
    message: string;
    orderId?: string;
  }>(`/v1/positions/markets/${marketId}/cashout`, {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : {},
    body: JSON.stringify({ percentage }),
  });
}

// Order APIs
export async function createOrder(request: Request, data: {
  marketId: string;
  outcomeId?: string;
  side: 'FOR' | 'LAY' | 'BUY_YES' | 'SELL_YES';
  pPts?: number;  // Probability points (new pricing model)
  liabilityPence?: number;  // Liability in pence (max loss for both FOR and LAY)
  stakePence?: number;  // Deprecated - backward compatibility only
  odds?: number;  // Deprecated - for backwards compatibility
  stake?: number;  // Deprecated - for backwards compatibility
  timeInForce?: 'GTC' | 'IOC';  // Time in force (default GTC)
}) {
  const cookie = request.headers.get('Cookie');
  
  // Remove undefined fields to avoid sending null
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  );
  
  return fetchApi<{ orderId: string; status: string }>('/v1/orders', {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : {},
    body: JSON.stringify(cleanData),
  });
}

export async function cancelOrder(request: Request, orderId: string) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{ orderId: string; status: string }>(`/v1/orders/${orderId}`, {
    method: 'DELETE',
    headers: cookie ? { Cookie: cookie } : {},
  });
}

export async function getUserOrders(request: Request, marketId?: string) {
  const cookie = request.headers.get('Cookie');
  const url = marketId ? `/v1/orders?marketId=${marketId}` : '/v1/orders';
  const response = await fetchApi<{
    orders: Array<{
      id: string;
      marketId: string;
      side: 'BUY_YES' | 'SELL_YES' | 'FOR' | 'LAY';
      pPts: number;
      yesPts: number;
      liabilityPence: number;
      originalContracts: string;
      remainingContracts: string;
      status: string;
      timeInForce?: string;
      createdAt: string;
    }>;
  }>(url, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  return response.orders;
}

// Wallet APIs
export async function getWallet(request?: Request) {
  const cookie = request?.headers.get('Cookie');
  return fetchApi<{
    userId: string;
    balance: number;
    currency: string;
    lockedBalance: number;
  }>('/v1/wallet', {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

export async function getBalanceHistory(request: Request, timeRange: '1D' | '1W' | '1M' | 'ALL' = '1W') {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{
    history: Array<{
      timestamp: string;
      balance: number;
      available: number;
      reserved: number;
    }>;
  }>(`/v1/wallet/history?range=${timeRange}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

export async function depositFunds(request: Request, amount: number, currency = 'USD') {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{ status: string; message: string; amount: number }>(
    '/v1/wallet/deposit',
    {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : {},
      body: JSON.stringify({ amount, currency }),
    }
  );
}

export async function withdrawFunds(
  request: Request,
  amount: number,
  destination: string,
  currency = 'USD'
) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{ status: string; message: string; amount: number }>(
    '/v1/wallet/withdraw',
    {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : {},
      body: JSON.stringify({ amount, destination, currency }),
    }
  );
}

// User Orders API
export async function getMyOrders(request: Request, limit = 50) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{ orders: any[] }>(`/v1/orders?limit=${limit}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

// User Trades API
export async function getMyTrades(request: Request, limit = 100) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<{ trades: any[] }>(`/v1/orders/trades?limit=${limit}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

// User Positions API
export async function getMyPositions(request: Request) {
  const cookie = request.headers.get('Cookie');
  return fetchApi<any[]>('/v1/positions/me', {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

// User Preferences API
export async function getUserPreferences(request: Request) {
  const cookieHeader = request.headers.get('Cookie');
  
  try {
    return await fetchApi<{
      oddsDisplay: 'decimal' | 'fractional';
      defaultStake: number;
      theme: 'light' | 'dark' | 'system';
      notifications: {
        tradeFills: boolean;
        priceAlerts: boolean;
      };
      trading: {
        defaultOrderType: 'limit' | 'market';
        confirmOrders: boolean;
        maxStakePerOrder: number;
      };
    }>('/v1/me/preferences', {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
  } catch (error) {
    // Fallback to default preferences if API not available
    return {
      oddsDisplay: 'decimal' as const,
      defaultStake: 10,
      theme: 'system' as const,
      notifications: {
        tradeFills: true,
        priceAlerts: true
      },
      trading: {
        defaultOrderType: 'limit' as const,
        confirmOrders: true,
        maxStakePerOrder: 1000
      }
    };
  }
}

export async function saveUserPreferences(request: Request, preferences: any) {
  const cookieHeader = request.headers.get('Cookie');
  
  try {
    return await fetchApi<{ success: boolean }>('/v1/me/preferences', {
      method: 'POST',
      body: JSON.stringify(preferences),
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
  } catch (error) {
    // Silently fail if API not available
    return { success: false };
  }
}

export { API_BASE_URL };
