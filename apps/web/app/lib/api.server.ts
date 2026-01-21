const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

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

// Order APIs
export async function createOrder(request: Request, data: {
  marketId: string;
  outcomeId?: string;
  side: 'BACK' | 'LAY';
  odds: number;
  stake: number;
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
export async function getMyOrders(limit = 50) {
  return fetchApi<{ orders: any[] }>(`/v1/orders?limit=${limit}`);
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
