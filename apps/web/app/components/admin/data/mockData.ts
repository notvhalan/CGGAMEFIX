// ─── Mock Data for Admin Dashboard ──────────────────────────────────────────

export interface Market {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'resolved' | 'voided' | 'suspended';
  category: string;
  subcategory: string;
  midPrice: number;
  spread: number;
  volume24h: number;
  openInterest: number;
  liquidity: number;
  botActivity: 'high' | 'medium' | 'low' | 'none';
  maturityDate: string;
  lastTrade: string;
  forLiquidity: number;
  layLiquidity: number;
  openOrders: number;
  uniqueTraders: number;
}

export interface User {
  id: string;
  email: string;
  type: 'human' | 'bot' | 'admin';
  lastSeen: string;
  currentPage: string;
  wsStatus: 'connected' | 'disconnected' | 'idle';
  ordersLast10m: number;
  tradesLast10m: number;
  joinedDate: string;
}

export interface Order {
  id: string;
  marketId: string;
  marketName: string;
  userId: string;
  userEmail: string;
  side: 'BUY_YES' | 'SELL_YES';
  price: number;
  quantity: number;
  filled: number;
  status: 'open' | 'filled' | 'partial' | 'cancelled';
  createdAt: string;
  isBot: boolean;
}

export interface Trade {
  id: string;
  marketId: string;
  marketName: string;
  price: number;
  quantity: number;
  buyerEmail: string;
  sellerEmail: string;
  timestamp: string;
  isBot: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminUser: string;
  actionType: 'market_resolve' | 'market_void' | 'bot_start' | 'bot_stop' | 'user_suspend' | 'order_cancel' | 'settlement_reset' | 'config_change';
  target: string;
  summary: string;
  result: 'success' | 'failed';
}

export interface Settlement {
  id: string;
  marketId: string;
  marketName: string;
  status: 'awaiting' | 'resolved' | 'failed' | 'voided';
  maturityDate: string;
  settlementStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  lastUpdated: string;
  outcome?: string;
  impactedAccounts?: number;
  errorMessage?: string;
}

export interface BotSession {
  id: string;
  marketId: string;
  marketName: string;
  botUserId: string;
  botEmail: string;
  status: 'running' | 'stopped' | 'error';
  ordersPlaced: number;
  takerTrades: number;
  lastRefresh: string;
  avgSpread: number;
  startedAt: string;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  category: string;
  acknowledged: boolean;
}

// ─── KPI Data ───────────────────────────────────────────────────────────────

export const kpiData = {
  activeMarkets: 47,
  pendingMarkets: 8,
  concurrentUsers: 234,
  ordersInBook: 12_847,
  tradesToday: 3_291,
  totalLiquidity: 2_847_392,
  botSessionsRunning: 23,
  failedSettlements: 3,
  alerts: 5,
};

// ─── Platform Health ────────────────────────────────────────────────────────

export const platformHealth = {
  apiGateway: { status: 'healthy' as const, latency: 12, uptime: 99.98 },
  matchingEngine: { status: 'healthy' as const, latency: 3, uptime: 99.99 },
  walletService: { status: 'healthy' as const, latency: 8, uptime: 99.95 },
  settlementService: { status: 'degraded' as const, latency: 45, uptime: 98.7 },
  wsConnections: 847,
  rustExchange: { status: 'healthy' as const, latency: 1, uptime: 99.99 },
};

// ─── Markets ────────────────────────────────────────────────────────────────

export const markets: Market[] = [
  { id: 'm1', name: 'BTC > $100K by June 30', status: 'active', category: 'Crypto', subcategory: 'Bitcoin', midPrice: 0.62, spread: 0.03, volume24h: 45_230, openInterest: 128_450, liquidity: 89_230, botActivity: 'high', maturityDate: '2026-06-30', lastTrade: '2 min ago', forLiquidity: 45_000, layLiquidity: 44_230, openOrders: 342, uniqueTraders: 67 },
  { id: 'm2', name: 'ETH > $5K by Q3 2026', status: 'active', category: 'Crypto', subcategory: 'Ethereum', midPrice: 0.38, spread: 0.05, volume24h: 32_100, openInterest: 95_200, liquidity: 67_800, botActivity: 'medium', maturityDate: '2026-09-30', lastTrade: '5 min ago', forLiquidity: 35_000, layLiquidity: 32_800, openOrders: 189, uniqueTraders: 43 },
  { id: 'm3', name: 'Fed Rate Cut Before July', status: 'active', category: 'Macro', subcategory: 'Interest Rates', midPrice: 0.71, spread: 0.02, volume24h: 78_450, openInterest: 234_100, liquidity: 156_700, botActivity: 'high', maturityDate: '2026-07-01', lastTrade: '30 sec ago', forLiquidity: 80_000, layLiquidity: 76_700, openOrders: 567, uniqueTraders: 112 },
  { id: 'm4', name: 'UK Rainfall > 100mm April', status: 'active', category: 'Weather', subcategory: 'UK', midPrice: 0.45, spread: 0.08, volume24h: 12_300, openInterest: 34_500, liquidity: 23_400, botActivity: 'low', maturityDate: '2026-04-30', lastTrade: '15 min ago', forLiquidity: 12_000, layLiquidity: 11_400, openOrders: 78, uniqueTraders: 19 },
  { id: 'm5', name: 'S&P 500 > 6000 by EOY', status: 'active', category: 'Equities', subcategory: 'US Indices', midPrice: 0.54, spread: 0.04, volume24h: 56_700, openInterest: 189_300, liquidity: 134_500, botActivity: 'high', maturityDate: '2026-12-31', lastTrade: '1 min ago', forLiquidity: 68_000, layLiquidity: 66_500, openOrders: 423, uniqueTraders: 89 },
  { id: 'm6', name: 'Apple Stock > $250 Q2', status: 'pending', category: 'Equities', subcategory: 'US Stocks', midPrice: 0.50, spread: 0.00, volume24h: 0, openInterest: 0, liquidity: 0, botActivity: 'none', maturityDate: '2026-06-30', lastTrade: 'Never', forLiquidity: 0, layLiquidity: 0, openOrders: 0, uniqueTraders: 0 },
  { id: 'm7', name: 'Gold > $3000 by March', status: 'resolved', category: 'Commodities', subcategory: 'Metals', midPrice: 0.95, spread: 0.01, volume24h: 890, openInterest: 0, liquidity: 0, botActivity: 'none', maturityDate: '2026-03-31', lastTrade: '1 day ago', forLiquidity: 0, layLiquidity: 0, openOrders: 0, uniqueTraders: 156 },
  { id: 'm8', name: 'UK PM Resignation Q1', status: 'voided', category: 'Politics', subcategory: 'UK', midPrice: 0.15, spread: 0.00, volume24h: 0, openInterest: 0, liquidity: 0, botActivity: 'none', maturityDate: '2026-03-31', lastTrade: '5 days ago', forLiquidity: 0, layLiquidity: 0, openOrders: 0, uniqueTraders: 23 },
  { id: 'm9', name: 'Tesla Deliveries > 500K Q2', status: 'active', category: 'Equities', subcategory: 'US Stocks', midPrice: 0.33, spread: 0.06, volume24h: 18_900, openInterest: 56_700, liquidity: 34_200, botActivity: 'medium', maturityDate: '2026-06-30', lastTrade: '8 min ago', forLiquidity: 18_000, layLiquidity: 16_200, openOrders: 134, uniqueTraders: 31 },
  { id: 'm10', name: 'Major Earthquake Japan Q2', status: 'active', category: 'Insurance', subcategory: 'Natural Disaster', midPrice: 0.08, spread: 0.12, volume24h: 4_500, openInterest: 23_100, liquidity: 8_900, botActivity: 'low', maturityDate: '2026-06-30', lastTrade: '1 hr ago', forLiquidity: 5_000, layLiquidity: 3_900, openOrders: 45, uniqueTraders: 12 },
  { id: 'm11', name: 'UK Flood Insurance April W1', status: 'active', category: 'Insurance', subcategory: 'Weather', midPrice: 0.22, spread: 0.10, volume24h: 6_700, openInterest: 18_400, liquidity: 11_200, botActivity: 'medium', maturityDate: '2026-04-07', lastTrade: '25 min ago', forLiquidity: 6_000, layLiquidity: 5_200, openOrders: 56, uniqueTraders: 14 },
  { id: 'm12', name: 'Champions League Winner', status: 'suspended', category: 'Sports', subcategory: 'Football', midPrice: 0.00, spread: 0.00, volume24h: 0, openInterest: 45_600, liquidity: 0, botActivity: 'none', maturityDate: '2026-06-01', lastTrade: '2 days ago', forLiquidity: 0, layLiquidity: 0, openOrders: 0, uniqueTraders: 78 },
];

// ─── Users ──────────────────────────────────────────────────────────────────

export const users: User[] = [
  { id: 'u1', email: 'alice.trader@gmail.com', type: 'human', lastSeen: '30 sec ago', currentPage: '/app/markets/m1', wsStatus: 'connected', ordersLast10m: 12, tradesLast10m: 5, joinedDate: '2025-11-15' },
  { id: 'u2', email: 'bob.investor@outlook.com', type: 'human', lastSeen: '2 min ago', currentPage: '/app/wallet', wsStatus: 'connected', ordersLast10m: 3, tradesLast10m: 1, joinedDate: '2025-12-01' },
  { id: 'u3', email: 'bot_mm_01@system.internal', type: 'bot', lastSeen: '5 sec ago', currentPage: 'API Only', wsStatus: 'connected', ordersLast10m: 156, tradesLast10m: 42, joinedDate: '2026-01-01' },
  { id: 'u4', email: 'bot_mm_02@system.internal', type: 'bot', lastSeen: '5 sec ago', currentPage: 'API Only', wsStatus: 'connected', ordersLast10m: 134, tradesLast10m: 38, joinedDate: '2026-01-01' },
  { id: 'u5', email: 'charlie@proton.me', type: 'human', lastSeen: '5 min ago', currentPage: '/app/positions', wsStatus: 'idle', ordersLast10m: 0, tradesLast10m: 0, joinedDate: '2026-02-10' },
  { id: 'u6', email: 'vhalan02@gmail.com', type: 'admin', lastSeen: 'now', currentPage: '/admin', wsStatus: 'connected', ordersLast10m: 0, tradesLast10m: 0, joinedDate: '2025-10-01' },
  { id: 'u7', email: 'dana.whale@yahoo.com', type: 'human', lastSeen: '1 min ago', currentPage: '/app/markets/m3', wsStatus: 'connected', ordersLast10m: 28, tradesLast10m: 14, joinedDate: '2025-11-20' },
  { id: 'u8', email: 'bot_arb_01@system.internal', type: 'bot', lastSeen: '3 sec ago', currentPage: 'API Only', wsStatus: 'connected', ordersLast10m: 89, tradesLast10m: 23, joinedDate: '2026-01-15' },
  { id: 'u9', email: 'eve.newbie@gmail.com', type: 'human', lastSeen: '12 min ago', currentPage: '/app', wsStatus: 'disconnected', ordersLast10m: 0, tradesLast10m: 0, joinedDate: '2026-03-25' },
  { id: 'u10', email: 'frank.scalper@proton.me', type: 'human', lastSeen: '40 sec ago', currentPage: '/app/markets/m5', wsStatus: 'connected', ordersLast10m: 45, tradesLast10m: 19, joinedDate: '2026-01-05' },
  { id: 'u11', email: 'bot_mm_03@system.internal', type: 'bot', lastSeen: '2 sec ago', currentPage: 'API Only', wsStatus: 'connected', ordersLast10m: 201, tradesLast10m: 67, joinedDate: '2026-02-01' },
  { id: 'u12', email: 'grace@business.co', type: 'human', lastSeen: '8 min ago', currentPage: '/app/insurance', wsStatus: 'idle', ordersLast10m: 2, tradesLast10m: 1, joinedDate: '2026-03-01' },
];

// ─── Orders ─────────────────────────────────────────────────────────────────

export const orders: Order[] = [
  { id: 'o1', marketId: 'm1', marketName: 'BTC > $100K by June 30', userId: 'u1', userEmail: 'alice.trader@gmail.com', side: 'BUY_YES', price: 0.63, quantity: 100, filled: 0, status: 'open', createdAt: '2026-03-26T10:45:00Z', isBot: false },
  { id: 'o2', marketId: 'm1', marketName: 'BTC > $100K by June 30', userId: 'u3', userEmail: 'bot_mm_01@system.internal', side: 'SELL_YES', price: 0.65, quantity: 500, filled: 230, status: 'partial', createdAt: '2026-03-26T10:44:30Z', isBot: true },
  { id: 'o3', marketId: 'm3', marketName: 'Fed Rate Cut Before July', userId: 'u7', userEmail: 'dana.whale@yahoo.com', side: 'BUY_YES', price: 0.70, quantity: 2000, filled: 2000, status: 'filled', createdAt: '2026-03-26T10:40:00Z', isBot: false },
  { id: 'o4', marketId: 'm5', marketName: 'S&P 500 > 6000 by EOY', userId: 'u10', userEmail: 'frank.scalper@proton.me', side: 'SELL_YES', price: 0.56, quantity: 150, filled: 0, status: 'open', createdAt: '2026-03-26T10:43:00Z', isBot: false },
  { id: 'o5', marketId: 'm2', marketName: 'ETH > $5K by Q3 2026', userId: 'u4', userEmail: 'bot_mm_02@system.internal', side: 'BUY_YES', price: 0.36, quantity: 800, filled: 0, status: 'open', createdAt: '2026-03-26T10:42:00Z', isBot: true },
  { id: 'o6', marketId: 'm3', marketName: 'Fed Rate Cut Before July', userId: 'u8', userEmail: 'bot_arb_01@system.internal', side: 'SELL_YES', price: 0.73, quantity: 300, filled: 300, status: 'filled', createdAt: '2026-03-26T10:38:00Z', isBot: true },
  { id: 'o7', marketId: 'm4', marketName: 'UK Rainfall > 100mm April', userId: 'u2', userEmail: 'bob.investor@outlook.com', side: 'BUY_YES', price: 0.42, quantity: 50, filled: 0, status: 'cancelled', createdAt: '2026-03-26T10:30:00Z', isBot: false },
  { id: 'o8', marketId: 'm9', marketName: 'Tesla Deliveries > 500K Q2', userId: 'u11', userEmail: 'bot_mm_03@system.internal', side: 'SELL_YES', price: 0.35, quantity: 1200, filled: 456, status: 'partial', createdAt: '2026-03-26T10:41:00Z', isBot: true },
];

// ─── Trades ─────────────────────────────────────────────────────────────────

export const trades: Trade[] = [
  { id: 't1', marketId: 'm3', marketName: 'Fed Rate Cut Before July', price: 0.71, quantity: 150, buyerEmail: 'dana.whale@yahoo.com', sellerEmail: 'bot_arb_01@system.internal', timestamp: '2026-03-26T10:58:30Z', isBot: false },
  { id: 't2', marketId: 'm1', marketName: 'BTC > $100K by June 30', price: 0.63, quantity: 80, buyerEmail: 'alice.trader@gmail.com', sellerEmail: 'bot_mm_01@system.internal', timestamp: '2026-03-26T10:57:15Z', isBot: true },
  { id: 't3', marketId: 'm5', marketName: 'S&P 500 > 6000 by EOY', price: 0.55, quantity: 200, buyerEmail: 'bot_mm_03@system.internal', sellerEmail: 'frank.scalper@proton.me', timestamp: '2026-03-26T10:56:00Z', isBot: true },
  { id: 't4', marketId: 'm2', marketName: 'ETH > $5K by Q3 2026', price: 0.38, quantity: 120, buyerEmail: 'bob.investor@outlook.com', sellerEmail: 'bot_mm_02@system.internal', timestamp: '2026-03-26T10:54:45Z', isBot: true },
  { id: 't5', marketId: 'm3', marketName: 'Fed Rate Cut Before July', price: 0.72, quantity: 500, buyerEmail: 'dana.whale@yahoo.com', sellerEmail: 'bot_mm_01@system.internal', timestamp: '2026-03-26T10:52:00Z', isBot: false },
  { id: 't6', marketId: 'm11', marketName: 'UK Flood Insurance April W1', price: 0.23, quantity: 40, buyerEmail: 'grace@business.co', sellerEmail: 'bot_mm_03@system.internal', timestamp: '2026-03-26T10:50:30Z', isBot: true },
];

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export const auditLogs: AuditLog[] = [
  { id: 'a1', timestamp: '2026-03-26T10:55:00Z', adminUser: 'vhalan02@gmail.com', actionType: 'bot_start', target: 'BTC > $100K by June 30', summary: 'Started 4 bot sessions with Balanced preset', result: 'success' },
  { id: 'a2', timestamp: '2026-03-26T10:30:00Z', adminUser: 'vhalan02@gmail.com', actionType: 'market_resolve', target: 'Gold > $3000 by March', summary: 'Resolved market as YES — gold exceeded $3000', result: 'success' },
  { id: 'a3', timestamp: '2026-03-26T09:15:00Z', adminUser: 'developer@gmail.com', actionType: 'market_void', target: 'UK PM Resignation Q1', summary: 'Voided market — ambiguous resolution criteria', result: 'success' },
  { id: 'a4', timestamp: '2026-03-26T08:00:00Z', adminUser: 'vhalan02@gmail.com', actionType: 'settlement_reset', target: 'Weather Contract #42', summary: 'Reset failed settlement for retry — DB timeout', result: 'success' },
  { id: 'a5', timestamp: '2026-03-25T22:30:00Z', adminUser: 'vhalan02@gmail.com', actionType: 'bot_stop', target: 'All Markets', summary: 'Stopped all bot sessions for maintenance window', result: 'success' },
  { id: 'a6', timestamp: '2026-03-25T18:45:00Z', adminUser: 'developer@gmail.com', actionType: 'user_suspend', target: 'spam@fake.com', summary: 'Suspended user for suspicious activity', result: 'success' },
  { id: 'a7', timestamp: '2026-03-25T14:20:00Z', adminUser: 'vhalan02@gmail.com', actionType: 'config_change', target: 'Risk Controls', summary: 'Updated max order size limit from 5000 to 10000', result: 'success' },
  { id: 'a8', timestamp: '2026-03-25T11:00:00Z', adminUser: 'vhalan02@gmail.com', actionType: 'order_cancel', target: 'ETH > $5K by Q3 2026', summary: 'Bulk cancelled 23 stale bot orders', result: 'failed' },
];

// ─── Settlements ────────────────────────────────────────────────────────────

export const settlements: Settlement[] = [
  { id: 's1', marketId: 'm7', marketName: 'Gold > $3000 by March', status: 'resolved', maturityDate: '2026-03-31', settlementStatus: 'completed', lastUpdated: '2026-03-26T10:30:00Z', outcome: 'YES', impactedAccounts: 156 },
  { id: 's2', marketId: 'm8', marketName: 'UK PM Resignation Q1', status: 'voided', maturityDate: '2026-03-31', settlementStatus: 'completed', lastUpdated: '2026-03-26T09:15:00Z', impactedAccounts: 23 },
  { id: 's3', marketId: 'm4', marketName: 'UK Rainfall > 100mm April', status: 'awaiting', maturityDate: '2026-04-30', settlementStatus: 'pending', lastUpdated: '2026-03-26T00:00:00Z' },
  { id: 's4', marketId: 'm11', marketName: 'UK Flood Insurance April W1', status: 'awaiting', maturityDate: '2026-04-07', settlementStatus: 'pending', lastUpdated: '2026-03-26T00:00:00Z' },
  { id: 's5', marketId: 'mx1', marketName: 'Weather Contract #42', status: 'failed', maturityDate: '2026-03-20', settlementStatus: 'failed', lastUpdated: '2026-03-25T08:00:00Z', errorMessage: 'Database timeout during payout calculation', impactedAccounts: 34 },
  { id: 's6', marketId: 'mx2', marketName: 'Earthquake Insurance Feb W3', status: 'failed', maturityDate: '2026-02-21', settlementStatus: 'retrying', lastUpdated: '2026-03-26T06:00:00Z', errorMessage: 'Wallet service unavailable during settlement', impactedAccounts: 12 },
  { id: 's7', marketId: 'mx3', marketName: 'Flood Risk March W2', status: 'failed', maturityDate: '2026-03-14', settlementStatus: 'failed', lastUpdated: '2026-03-20T14:00:00Z', errorMessage: 'Insufficient pool balance for payouts', impactedAccounts: 8 },
];

// ─── Bot Sessions ───────────────────────────────────────────────────────────

export const botSessions: BotSession[] = [
  { id: 'bs1', marketId: 'm1', marketName: 'BTC > $100K by June 30', botUserId: 'u3', botEmail: 'bot_mm_01@system.internal', status: 'running', ordersPlaced: 1_234, takerTrades: 89, lastRefresh: '5 sec ago', avgSpread: 0.03, startedAt: '2026-03-26T08:00:00Z' },
  { id: 'bs2', marketId: 'm1', marketName: 'BTC > $100K by June 30', botUserId: 'u4', botEmail: 'bot_mm_02@system.internal', status: 'running', ordersPlaced: 987, takerTrades: 56, lastRefresh: '3 sec ago', avgSpread: 0.04, startedAt: '2026-03-26T08:00:00Z' },
  { id: 'bs3', marketId: 'm3', marketName: 'Fed Rate Cut Before July', botUserId: 'u3', botEmail: 'bot_mm_01@system.internal', status: 'running', ordersPlaced: 2_456, takerTrades: 178, lastRefresh: '2 sec ago', avgSpread: 0.02, startedAt: '2026-03-26T06:00:00Z' },
  { id: 'bs4', marketId: 'm3', marketName: 'Fed Rate Cut Before July', botUserId: 'u8', botEmail: 'bot_arb_01@system.internal', status: 'running', ordersPlaced: 1_890, takerTrades: 234, lastRefresh: '1 sec ago', avgSpread: 0.02, startedAt: '2026-03-26T06:00:00Z' },
  { id: 'bs5', marketId: 'm5', marketName: 'S&P 500 > 6000 by EOY', botUserId: 'u11', botEmail: 'bot_mm_03@system.internal', status: 'running', ordersPlaced: 3_102, takerTrades: 312, lastRefresh: '4 sec ago', avgSpread: 0.04, startedAt: '2026-03-25T20:00:00Z' },
  { id: 'bs6', marketId: 'm2', marketName: 'ETH > $5K by Q3 2026', botUserId: 'u4', botEmail: 'bot_mm_02@system.internal', status: 'running', ordersPlaced: 567, takerTrades: 34, lastRefresh: '8 sec ago', avgSpread: 0.05, startedAt: '2026-03-26T09:00:00Z' },
  { id: 'bs7', marketId: 'm9', marketName: 'Tesla Deliveries > 500K Q2', botUserId: 'u11', botEmail: 'bot_mm_03@system.internal', status: 'error', ordersPlaced: 234, takerTrades: 12, lastRefresh: '2 min ago', avgSpread: 0.06, startedAt: '2026-03-26T10:00:00Z' },
];

// ─── Alerts ─────────────────────────────────────────────────────────────────

export const alerts: Alert[] = [
  { id: 'al1', severity: 'critical', message: 'Settlement failed: Weather Contract #42 — DB timeout', timestamp: '2026-03-26T10:30:00Z', category: 'Settlement', acknowledged: false },
  { id: 'al2', severity: 'critical', message: 'Bot session error on Tesla Deliveries market', timestamp: '2026-03-26T10:15:00Z', category: 'Bots', acknowledged: false },
  { id: 'al3', severity: 'warning', message: 'Major Earthquake Japan Q2 — spread >10%, low liquidity', timestamp: '2026-03-26T09:45:00Z', category: 'Risk', acknowledged: false },
  { id: 'al4', severity: 'warning', message: 'Champions League Winner market suspended — investigate', timestamp: '2026-03-26T09:00:00Z', category: 'Markets', acknowledged: true },
  { id: 'al5', severity: 'info', message: 'New user eve.newbie@gmail.com signed up', timestamp: '2026-03-26T08:30:00Z', category: 'Users', acknowledged: true },
];

// ─── Activity Feed ──────────────────────────────────────────────────────────

export const activityFeed = [
  { id: 'af1', icon: '📈', text: 'Trade: 150 contracts @ 71p on Fed Rate Cut', time: '30 sec ago' },
  { id: 'af2', icon: '🤖', text: 'Bot MM-01 refreshed 12 orders on BTC market', time: '1 min ago' },
  { id: 'af3', icon: '✅', text: 'Gold > $3000 by March resolved as YES', time: '25 min ago' },
  { id: 'af4', icon: '🔴', text: 'Settlement failed for Weather Contract #42', time: '30 min ago' },
  { id: 'af5', icon: '👤', text: 'New user eve.newbie@gmail.com signed up', time: '2 hr ago' },
  { id: 'af6', icon: '⚡', text: 'Bot sessions started: 4 bots on BTC > $100K', time: '3 hr ago' },
  { id: 'af7', icon: '❌', text: 'Market voided: UK PM Resignation Q1', time: '4 hr ago' },
  { id: 'af8', icon: '📊', text: 'Batch created 12 insurance contracts for April', time: '5 hr ago' },
];

// ─── Orderbook mock ─────────────────────────────────────────────────────────

export const orderbookLevels = [
  { price: 0.75, forQty: 0, layQty: 120, cumFor: 0, cumLay: 120 },
  { price: 0.74, forQty: 0, layQty: 250, cumFor: 0, cumLay: 370 },
  { price: 0.73, forQty: 0, layQty: 180, cumFor: 0, cumLay: 550 },
  { price: 0.72, forQty: 0, layQty: 340, cumFor: 0, cumLay: 890 },
  { price: 0.71, forQty: 0, layQty: 500, cumFor: 0, cumLay: 1390 },
  { price: 0.70, forQty: 450, layQty: 0, cumFor: 450, cumLay: 0 },
  { price: 0.69, forQty: 380, layQty: 0, cumFor: 830, cumLay: 0 },
  { price: 0.68, forQty: 200, layQty: 0, cumFor: 1030, cumLay: 0 },
  { price: 0.67, forQty: 560, layQty: 0, cumFor: 1590, cumLay: 0 },
  { price: 0.66, forQty: 150, layQty: 0, cumFor: 1740, cumLay: 0 },
];

// ─── Chart data (sparkline style) ──────────────────────────────────────────

export const tradesOverTimeData = [
  { time: '00:00', count: 45 }, { time: '01:00', count: 32 },
  { time: '02:00', count: 28 }, { time: '03:00', count: 18 },
  { time: '04:00', count: 12 }, { time: '05:00', count: 22 },
  { time: '06:00', count: 56 }, { time: '07:00', count: 89 },
  { time: '08:00', count: 145 }, { time: '09:00', count: 234 },
  { time: '10:00', count: 312 }, { time: '11:00', count: 278 },
];

export const concurrentUsersData = [
  { time: '00:00', count: 45 }, { time: '01:00', count: 38 },
  { time: '02:00', count: 29 }, { time: '03:00', count: 22 },
  { time: '04:00', count: 18 }, { time: '05:00', count: 25 },
  { time: '06:00', count: 67 }, { time: '07:00', count: 112 },
  { time: '08:00', count: 178 }, { time: '09:00', count: 210 },
  { time: '10:00', count: 234 }, { time: '11:00', count: 221 },
];
