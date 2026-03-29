import { useState } from "react";
import { Form, useRouteLoaderData, useNavigation } from "@remix-run/react";
import { Card, Badge, StatusBadge, Tabs, DataTable, Button } from "~/components/admin/ui";
import { orders, trades, markets as mockMarkets, type Order, type Trade } from "~/components/admin/data/mockData";

export default function AdminOrders() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const navigation = useNavigation();
  const realMarkets = parentData?.markets || [];
  const allMarkets = realMarkets.length > 0 ? realMarkets : mockMarkets;

  const [activeTab, setActiveTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBot, setFilterBot] = useState('all');

  // Batch order state
  const [batchMarketId, setBatchMarketId] = useState(allMarkets[0]?.id || '');
  const [batchSide, setBatchSide] = useState<'FOR' | 'LAY'>('FOR');
  const [batchCount, setBatchCount] = useState(10);
  const [batchPriceFrom, setBatchPriceFrom] = useState(20);
  const [batchPriceTo, setBatchPriceTo] = useState(80);
  const [batchQuantity, setBatchQuantity] = useState(2.0);

  const isCreating = navigation.state === 'submitting' && navigation.formData?.get('action') === 'create-batch-orders';

  const filteredOrders = orders
    .filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (filterBot === 'bot' && !o.isBot) return false;
      if (filterBot === 'human' && o.isBot) return false;
      if (search) {
        const s = search.toLowerCase();
        return o.marketName.toLowerCase().includes(s) || o.userEmail.toLowerCase().includes(s) || o.id.toLowerCase().includes(s);
      }
      return true;
    });

  const tabs = [
    { id: 'orders', label: 'Order Book', count: orders.length },
    { id: 'trades', label: 'Recent Trades', count: trades.length },
    { id: 'batch', label: 'Batch Create' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Orders & Trades</h1>
          <p className="text-sm text-admin-text-dim mt-1">View all orders across markets, recent trades, and batch create</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="green">{orders.filter(o => o.status === 'open').length} open</Badge>
          <Badge variant="amber">{orders.filter(o => o.status === 'partial').length} partial</Badge>
          <Badge variant="blue">{orders.filter(o => o.status === 'filled').length} filled</Badge>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <Card noPadding>
          <div className="p-4 border-b border-admin-border flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-admin-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search orders..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-admin-surface-2 border border-admin-border rounded-lg pl-9 pr-4 py-2 text-sm text-admin-text placeholder:text-admin-text-dim focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="filled">Filled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={filterBot}
              onChange={e => setFilterBot(e.target.value)}
              className="bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
            >
              <option value="all">All Users</option>
              <option value="human">Human Only</option>
              <option value="bot">Bot Only</option>
            </select>
          </div>

          <DataTable
            data={filteredOrders}
            columns={[
              { key: 'id', header: 'ID', render: (o: Order) => <span className="font-mono text-xs text-admin-text-dim">{o.id}</span>, width: '50px' },
              { key: 'marketName', header: 'Market', render: (o: Order) => <span className="text-sm text-admin-text truncate">{o.marketName}</span>, width: '200px' },
              { key: 'userEmail', header: 'User', render: (o: Order) => (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-admin-text truncate">{o.userEmail}</span>
                  {o.isBot && <Badge variant="cyan">Bot</Badge>}
                </div>
              ), width: '200px' },
              { key: 'side', header: 'Side', render: (o: Order) => <Badge variant={o.side === 'BUY_YES' ? 'green' : 'red'}>{o.side}</Badge>, width: '100px' },
              { key: 'price', header: 'Price', render: (o: Order) => <span className="font-mono">{(o.price * 100).toFixed(0)}p</span>, align: 'right', width: '60px' },
              { key: 'quantity', header: 'Qty', render: (o: Order) => <span className="font-mono">{o.quantity}</span>, align: 'right', width: '60px' },
              { key: 'filled', header: 'Filled', render: (o: Order) => (
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-admin-surface-3 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${o.quantity > 0 ? (o.filled / o.quantity * 100) : 0}%` }} />
                  </div>
                  <span className="font-mono text-xs">{o.filled}/{o.quantity}</span>
                </div>
              ), width: '130px' },
              { key: 'status', header: 'Status', render: (o: Order) => <StatusBadge status={o.status} />, width: '80px' },
              { key: 'createdAt', header: 'Time', render: (o: Order) => <span className="text-xs text-admin-text-dim">{o.createdAt.split('T')[1]?.slice(0, 8)}</span>, width: '70px' },
            ]}
            emptyMessage="No orders match your filters"
            compact
          />
        </Card>
      )}

      {/* Trades Tab */}
      {activeTab === 'trades' && (
        <Card title="Recent Trades" subtitle="All matched trades across markets" noPadding>
          <DataTable
            data={trades}
            columns={[
              { key: 'id', header: 'ID', render: (t: Trade) => <span className="font-mono text-xs text-admin-text-dim">{t.id}</span>, width: '50px' },
              { key: 'marketName', header: 'Market', render: (t: Trade) => <span className="text-sm text-admin-text truncate">{t.marketName}</span>, width: '200px' },
              { key: 'price', header: 'Price', render: (t: Trade) => <span className="font-mono font-bold">{(t.price * 100).toFixed(0)}p</span>, align: 'right', width: '60px' },
              { key: 'quantity', header: 'Qty', render: (t: Trade) => <span className="font-mono">{t.quantity}</span>, align: 'right', width: '60px' },
              { key: 'buyerEmail', header: 'Buyer', render: (t: Trade) => <span className="text-sm text-emerald-400 truncate">{t.buyerEmail}</span>, width: '180px' },
              { key: 'sellerEmail', header: 'Seller', render: (t: Trade) => <span className="text-sm text-red-400 truncate">{t.sellerEmail}</span>, width: '180px' },
              { key: 'isBot', header: '', render: (t: Trade) => t.isBot ? <Badge variant="cyan">Bot</Badge> : null, width: '50px' },
              { key: 'timestamp', header: 'Time', render: (t: Trade) => <span className="text-xs text-admin-text-dim">{t.timestamp.split('T')[1]?.slice(0, 8)}</span>, width: '70px' },
            ]}
            emptyMessage="No trades yet"
            compact
          />
        </Card>
      )}

      {/* Batch Create Tab */}
      {activeTab === 'batch' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Batch Order Creator" subtitle="Create multiple orders at once">
            <Form method="post" className="space-y-4">
              <input type="hidden" name="action" value="create-batch-orders" />

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1.5">Market</label>
                <select
                  name="batchMarketId"
                  value={batchMarketId}
                  onChange={e => setBatchMarketId(e.target.value)}
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
                >
                  {allMarkets.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name || m.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1.5">Side</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchSide('FOR')}
                    className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                      batchSide === 'FOR' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-admin-surface-2 border-admin-border text-admin-text-dim'
                    }`}
                  >
                    FOR (Buy Yes)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchSide('LAY')}
                    className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                      batchSide === 'LAY' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-admin-surface-2 border-admin-border text-admin-text-dim'
                    }`}
                  >
                    LAY (Sell Yes)
                  </button>
                </div>
                <input type="hidden" name="batchSide" value={batchSide} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Count</label>
                  <input type="number" name="batchCount" min="1" max="50" value={batchCount} onChange={e => setBatchCount(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Qty Each</label>
                  <input type="number" name="batchQuantity" min="1" max="100" step="0.5" value={batchQuantity} onChange={e => setBatchQuantity(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Price From (%)</label>
                  <input type="number" name="batchPriceFrom" min="1" max="99" value={batchPriceFrom} onChange={e => setBatchPriceFrom(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-admin-text-dim mb-1">Price To (%)</label>
                  <input type="number" name="batchPriceTo" min="1" max="99" value={batchPriceTo} onChange={e => setBatchPriceTo(Number(e.target.value))}
                    className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono" />
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full" disabled={isCreating}>
                {isCreating ? '⏳ Creating...' : `📋 Create ${batchCount} Orders`}
              </Button>
            </Form>
          </Card>

          {/* Preview */}
          <Card title="Order Preview" subtitle={`${batchCount} orders from ${batchPriceFrom}% to ${batchPriceTo}%`}>
            <div className="space-y-1 max-h-80 overflow-y-auto admin-scrollbar">
              {Array.from({ length: Math.min(batchCount, 20) }, (_, i) => {
                const price = batchPriceFrom + ((batchPriceTo - batchPriceFrom) / (batchCount - 1)) * i;
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-admin-surface-2">
                    <span className="text-admin-text-dim">#{i + 1}</span>
                    <Badge variant={batchSide === 'FOR' ? 'green' : 'red'}>{batchSide}</Badge>
                    <span className="font-mono text-admin-text">{price.toFixed(1)}%</span>
                    <span className="font-mono text-admin-text-dim">×{batchQuantity}</span>
                  </div>
                );
              })}
              {batchCount > 20 && (
                <div className="text-center text-xs text-admin-text-dim py-2">
                  ... and {batchCount - 20} more
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
