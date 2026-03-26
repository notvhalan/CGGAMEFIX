/**
 * Thin HTTP wrapper that captures session cookies automatically.
 * Each TestApiClient instance represents a single user session.
 */

const API_URL = () => process.env.API_URL || 'http://localhost:3000';

export class TestApiClient {
  private cookie: string = '';
  public userId: string = '';
  public email: string = '';

  /** Extract and store the set-cookie header from a response. */
  private captureCookie(res: Response): void {
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      // Keep the first cookie token (session id).
      this.cookie = setCookie.split(';')[0];
    }
  }

  // ─── Generic request helpers ──────────────────────────────

  async post<T = any>(path: string, body?: any): Promise<{ status: number; data: T; raw: Response }> {
    const res = await fetch(`${API_URL()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual', // don't follow redirects (OAuth)
    });
    this.captureCookie(res);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data: data as T, raw: res };
  }

  async get<T = any>(path: string): Promise<{ status: number; data: T; raw: Response }> {
    const res = await fetch(`${API_URL()}${path}`, {
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
    });
    this.captureCookie(res);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data: data as T, raw: res };
  }

  async del<T = any>(path: string): Promise<{ status: number; data: T; raw: Response }> {
    const res = await fetch(`${API_URL()}${path}`, {
      method: 'DELETE',
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
    });
    this.captureCookie(res);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data: data as T, raw: res };
  }

  // ─── Auth shortcuts ───────────────────────────────────────

  async signup(email: string, password: string, name?: string): Promise<void> {
    const { status, data } = await this.post('/v1/auth/signup', {
      email,
      password,
      name: name ?? email.split('@')[0],
    });
    if (status >= 400) {
      throw new Error(`Signup failed (${status}): ${JSON.stringify(data)}`);
    }
    this.userId = data.user?.id ?? '';
    this.email = email;
  }

  async login(email: string, password: string): Promise<void> {
    const { status, data } = await this.post('/v1/auth/login', { email, password });
    if (status >= 400) {
      throw new Error(`Login failed (${status}): ${JSON.stringify(data)}`);
    }
    this.userId = data.user?.id ?? '';
    this.email = email;
  }

  // ─── Wallet shortcuts ─────────────────────────────────────

  async deposit(amountPounds: number, currency = 'GBP'): Promise<any> {
    const { status, data } = await this.post('/v1/wallet/deposit', {
      amount: amountPounds,
      currency,
    });
    if (status >= 400) {
      throw new Error(`Deposit failed (${status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  async getWallet(): Promise<{ userId: string; balance: number; lockedBalance: number; currency: string }> {
    const { status, data } = await this.get('/v1/wallet');
    if (status >= 400) {
      throw new Error(`Get wallet failed (${status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  // ─── Cashout (close position) shortcuts ───────────────────

  async cashoutQuote(opts: {
    marketId: string;
    netContractsMicros: string;
  }): Promise<{
    filledContractsMicros: string;
    unfilledContractsMicros: string;
    avgYesPts: number;
    costPence: number;
    estimatedFeePence: number;
    netValuePence: number;
    quoteTimestamp: number;
  }> {
    const { status, data } = await this.post('/v1/cashout/quote', opts);
    if (status >= 400) {
      throw new Error(`cashoutQuote failed (${status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  async cashoutExecute(opts: {
    marketId: string;
    netContractsMicros: string;
    closeMode?: 'ioc' | 'limit';
    limitYesPts?: number;
    lotIds?: string[];
  }): Promise<{ orderId: string; success: boolean }> {
    const { status, data } = await this.post('/v1/cashout/execute', opts);
    if (status >= 400) {
      throw new Error(`cashoutExecute failed (${status}): ${JSON.stringify(data)}`);
    }
    return data;
  }
}
