import { useState } from "react";
import { useParams, useNavigate } from "@remix-run/react";
import { Card, Badge, StatusBadge, Tabs, DataTable } from "~/components/admin/ui";
import {
  markets,
  orders,
  trades,
  botSessions,
  orderbookLevels,
  auditLogs,
} from "~/components/admin/data/mockData";

export default function AdminMarketDetail() {
  const { marketId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const market = markets.find(m => m.id === marketId);

  if (!market) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/admin/markets')} className="text-sm text-blue-400 hover:text-blue-300">
          ← Back to Markets
        </button>
        <div className="bg-admin-surface border border-admin-border rounded-lg p-8 text-center">
          <h2 className="text-xl font-bold text-admin-text">Market not found</h2>
          <p className="text-sm text-admin-text-dim mt-2">ID: {marketId}</p>
        </div>
      </div>
    );
  }

  const marketOrders = orders.filter(o => o.marketId === marketId);
  const marketTrades = trades.filter(t => t.marketId === marketId);
  const marketBots = botSessions.filter(b => b.marketId === marketId);
  const marketAudit = auditLogs.filter(a => a.target.includes(market.name.slice(0, 15)));

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'orderbook', label: 'Orderbook', count: orderbookLevels.length },
    { id: 'orders', label: 'Orders', count: marketOrders.length },
    { id: 'trades', label: 'Trades', count: marketTrades.length },
    { id: 'bots', label: 'Bots', count: marketBots.length },
    { id: 'audit', label: 'Audit', count: marketAudit.length },
  ];

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <button onClick={() => navigate('/admin/markets')} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Markets
      </button>

      {/* Market header */}
      <div className="bg-admin-surface border border-admin-border rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-admin-text">{market.name}</h1>
              <StatusBadge status={market.status} />
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="blue">{market.category}</Badge>
              <Badge variant="gray">{market.subcategory}</Badge>
              <span className="text-xs text-admin-text-dim">ID: {market.id}</span>
              <span className="text-xs text-admin-text-dim">Maturity: {market.maturityDate}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-admin-text">
              {market.status === 'active' ? `${(market.midPrice * 100).toFixed(0)}p` : '—'}
            </div>
            <div className="text-xs text-admin-text-dim mt-1">Last trade: {market.lastTrade}</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-5 pt-4 border-t border-admin-border">
          <div>
            <div className="text-xs text-admin-text-dim">24h Volume</div>
            <div className="text-sm font-bold font-mono text-admin-text">£{market.volume24h.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-admin-text-dim">Open Interest</div>
            <div className="text-sm font-bold font-mono text-admin-text">£{market.openInterest.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-admin-text-dim">Total Liquidity</div>
            <div className="text-sm font-bold font-mono text-admin-text">£{market.liquidity.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-admin-text-dim">Spread</div>
            <div className={`text-sm font-bold font-mono ${market.spread > 0.08 ? 'text-amber-400' : 'text-admin-text'}`}>
              {(market.spread * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-admin-text-dim">Open Orders</div>
            <div className="text-sm font-bold font-mono text-admin-text">{market.openOrders}</div>
          </div>
          <div>
            <div className="text-xs text-admin-text-dim">Unique Traders</div>
            <div className="text-sm font-bold font-mono text-admin-text">{market.uniqueTraders}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Liquidity Breakdown">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-emerald-400">FOR (Buy Yes)</span>
                  <span className="font-mono text-admin-text">£{market.forLiquidity.toLocaleString()}</span>
                </div>
                <div className="w-full bg-admin-surface-3 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${market.liquidity > 0 ? (market.forLiquidity / market.liquidity * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-red-400">LAY (Sell Yes)</span>
                  <span className="font-mono text-admin-text">£{market.layLiquidity.toLocaleString()}</span>
                </div>
                <div className="w-full bg-admin-surface-3 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full"
                    style={{ width: `${market.liquidity > 0 ? (market.layLiquidity / market.liquidity * 100) : 0}%` }}
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-admin-border flex justify-between text-sm">
                <span className="text-admin-text-dim">Imbalance Ratio</span>
                <span className="font-mono text-admin-text">
                  {market.liquidity > 0 ? (market.forLiquidity / market.layLiquidity).toFixed(2) : '—'}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Bot Activity">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-admin-text-dim">Activity Level</span>
                <Badge variant={market.botActivity === 'high' ? 'green' : market.botActivity === 'medium' ? 'amber' : 'red'}>
                  {market.botActivity}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-admin-text-dim">Active Bot Sessions</span>
                <span className="text-sm font-mono text-admin-text">{marketBots.filter(b => b.status === 'running').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-admin-text-dim">Total Bot Orders</span>
                <span className="text-sm font-mono text-admin-text">{marketBots.reduce((s, b) => s + b.ordersPlaced, 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-admin-text-dim">Bot Taker Trades</span>
                <span className="text-sm font-mono text-admin-text">{marketBots.reduce((s, b) => s + b.takerTrades, 0)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'orderbook' && (
        <Card title="Live Orderbook" subtitle="Depth visualization" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-border text-admin-text-dim text-xs">
                  <th className="text-right p-3">Cum FOR</th>
                  <th className="text-right p-3">FOR Qty</th>
                  <th className="text-center p-3 font-bold">Price</th>
                  <th className="text-left p-3">LAY Qty</th>
                  <th className="text-left p-3">Cum LAY</th>
                </tr>
              </thead>
              <tbody>
                {orderbookLevels.map((level, i) => {
                  const maxQty = Math.max(...orderbookLevels.map(l => Math.max(l.forQty, l.layQty)));
                  const forWidth = level.forQty > 0 ? (level.forQty / maxQty * 100) : 0;
                  const layWidth = level.layQty > 0 ? (level.layQty / maxQty * 100) : 0;
                  const isSpread = i > 0 && orderbookLevels[i - 1].layQty > 0 && level.forQty > 0;

                  return (
                    <tr key={i} className={`border-b border-admin-border/50 ${isSpread ? 'border-t-2 border-t-blue-500/30' : ''}`}>
                      <td className="p-3 text-right">
                        <span className="font-mono text-admin-text-dim">{level.cumFor > 0 ? level.cumFor : ''}</span>
                      </td>
                      <td className="p-3 text-right relative">
                        {level.forQty > 0 && (
                          <>
                            <div className="absolute inset-y-0 right-0 bg-emerald-500/10" style={{ width: `${forWidth}%` }} />
                            <span className="relative font-mono text-emerald-400">{level.forQty}</span>
                          </>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-mono font-bold text-admin-text">{(level.price * 100).toFixed(0)}p</span>
                      </td>
                      <td className="p-3 text-left relative">
                        {level.layQty > 0 && (
                          <>
                            <div className="absolute inset-y-0 left-0 bg-red-500/10" style={{ width: `${layWidth}%` }} />
                            <span className="relative font-mono text-red-400">{level.layQty}</span>
                          </>
                        )}
                      </td>
                      <td className="p-3 text-left">
                        <span className="font-mono text-admin-text-dim">{level.cumLay > 0 ? level.cumLay : ''}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'orders' && (
        <Card title="Orders" noPadding>
          <DataTable
            data={marketOrders}
            columns={[
              { key: 'id', header: 'ID', render: o => <span className="font-mono text-xs text-admin-text-dim">{o.id}</span>, width: '60px' },
              { key: 'userEmail', header: 'User', render: o => (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-admin-text truncate">{o.userEmail}</span>
                  {o.isBot && <Badge variant="cyan">Bot</Badge>}
                </div>
              ), width: '200px' },
              { key: 'side', header: 'Side', render: o => <Badge variant={o.side === 'BUY_YES' ? 'green' : 'red'}>{o.side}</Badge>, width: '100px' },
              { key: 'price', header: 'Price', render: o => <span className="font-mono">{(o.price * 100).toFixed(0)}p</span>, align: 'right', width: '70px' },
              { key: 'quantity', header: 'Qty', render: o => <span className="font-mono">{o.quantity}</span>, align: 'right', width: '60px' },
              { key: 'filled', header: 'Filled', render: o => <span className="font-mono">{o.filled}/{o.quantity}</span>, align: 'right', width: '80px' },
              { key: 'status', header: 'Status', render: o => <StatusBadge status={o.status} />, width: '90px' },
            ]}
            emptyMessage="No orders for this market"
            compact
          />
        </Card>
      )}

      {activeTab === 'trades' && (
        <Card title="Recent Trades" noPadding>
          <DataTable
            data={marketTrades}
            columns={[
              { key: 'id', header: 'ID', render: t => <span className="font-mono text-xs text-admin-text-dim">{t.id}</span>, width: '60px' },
              { key: 'price', header: 'Price', render: t => <span className="font-mono">{(t.price * 100).toFixed(0)}p</span>, align: 'right', width: '70px' },
              { key: 'quantity', header: 'Qty', render: t => <span className="font-mono">{t.quantity}</span>, align: 'right', width: '70px' },
              { key: 'buyerEmail', header: 'Buyer', render: t => <span className="text-sm text-emerald-400 truncate">{t.buyerEmail}</span>, width: '180px' },
              { key: 'sellerEmail', header: 'Seller', render: t => <span className="text-sm text-red-400 truncate">{t.sellerEmail}</span>, width: '180px' },
              { key: 'timestamp', header: 'Time', render: t => <span className="text-xs text-admin-text-dim">{t.timestamp.split('T')[1]?.slice(0, 8)}</span>, width: '80px' },
              { key: 'isBot', header: '', render: t => t.isBot ? <Badge variant="cyan">Bot</Badge> : null, width: '60px' },
            ]}
            emptyMessage="No trades for this market"
            compact
          />
        </Card>
      )}

      {activeTab === 'bots' && (
        <Card title="Bot Sessions" noPadding>
          {marketBots.length === 0 ? (
            <div className="p-8 text-center text-admin-text-dim">No bot sessions for this market</div>
          ) : (
            <div className="divide-y divide-admin-border">
              {marketBots.map(bot => (
                <div key={bot.id} className="p-4 flex items-center justify-between hover:bg-admin-surface-2 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-admin-text">{bot.botEmail}</div>
                    <div className="text-xs text-admin-text-dim mt-0.5">Started: {bot.startedAt.split('T')[1]?.slice(0, 5)} · Last refresh: {bot.lastRefresh}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-admin-text-dim">{bot.ordersPlaced} orders</div>
                      <div className="text-xs text-admin-text-dim">{bot.takerTrades} taker trades</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-admin-text-dim">Avg spread</div>
                      <div className="text-xs font-mono text-admin-text">{(bot.avgSpread * 100).toFixed(1)}%</div>
                    </div>
                    <StatusBadge status={bot.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'audit' && (
        <Card title="Audit Trail" noPadding>
          <DataTable
            data={marketAudit}
            columns={[
              { key: 'timestamp', header: 'Time', render: a => <span className="text-xs text-admin-text-dim">{a.timestamp.split('T')[1]?.slice(0, 5)}</span>, width: '60px' },
              { key: 'adminUser', header: 'Admin', render: a => <span className="text-sm text-admin-text">{a.adminUser}</span>, width: '180px' },
              { key: 'actionType', header: 'Action', render: a => <Badge variant="blue">{a.actionType.replace(/_/g, ' ')}</Badge>, width: '130px' },
              { key: 'summary', header: 'Summary', render: a => <span className="text-sm text-admin-text-dim">{a.summary}</span> },
              { key: 'result', header: 'Result', render: a => <StatusBadge status={a.result} />, width: '90px' },
            ]}
            emptyMessage="No audit events for this market"
            compact
          />
        </Card>
      )}
    </div>
  );
}
