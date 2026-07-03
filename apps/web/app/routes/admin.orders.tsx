import { useState } from "react";
import { Form, useNavigation, useRouteLoaderData } from "@remix-run/react";
import { Badge, Button, Card, DataTable, StatusBadge, Tabs } from "~/components/admin/ui";
import { markets as mockMarkets, orders as mockOrders, trades as mockTrades } from "~/components/admin/data/mockData";

export { action } from "./admin";

export default function AdminOrders() {
  const parentData = useRouteLoaderData<any>("routes/admin");
  const navigation = useNavigation();
  const realMarkets = parentData?.adminSnapshot?.markets || parentData?.markets || [];
  const allMarkets = realMarkets.length > 0 ? realMarkets : mockMarkets;
  const orders: any[] = parentData?.adminSnapshot?.orders?.length ? parentData.adminSnapshot.orders : mockOrders;
  const trades: any[] = parentData?.adminSnapshot?.trades?.length ? parentData.adminSnapshot.trades : mockTrades;

  const [activeTab, setActiveTab] = useState("orders");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBot, setFilterBot] = useState("all");
  const [batchMarketId, setBatchMarketId] = useState(allMarkets[0]?.id || "");
  const [batchSide, setBatchSide] = useState<"FOR" | "LAY">("FOR");
  const [batchCount, setBatchCount] = useState(10);
  const [batchPriceFrom, setBatchPriceFrom] = useState(20);
  const [batchPriceTo, setBatchPriceTo] = useState(80);
  const [batchQuantity, setBatchQuantity] = useState(2.0);

  const isCreating = navigation.state === "submitting" && navigation.formData?.get("action") === "create-batch-orders";

  const filteredOrders = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterBot === "bot" && !o.isBot) return false;
    if (filterBot === "human" && o.isBot) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [o.marketName, o.userEmail, o.id].some((value) => String(value || "").toLowerCase().includes(q));
  });

  const tabs = [
    { id: "orders", label: "Order Book", count: orders.length },
    { id: "trades", label: "Recent Trades", count: trades.length },
    { id: "batch", label: "Batch Create" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-admin-text">Orders & Trades</h1>
          <p className="mt-1 text-sm text-admin-text-dim">View all orders across markets, recent trades, and batch create</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="green">{orders.filter((o) => o.status === "open").length} open</Badge>
          <Badge variant="amber">{orders.filter((o) => o.status === "partial").length} partial</Badge>
          <Badge variant="blue">{orders.filter((o) => o.status === "filled").length} filled</Badge>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "orders" && (
        <Card noPadding>
          <div className="flex flex-wrap items-center gap-3 border-b border-admin-border p-4">
            <input
              type="text"
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
            />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="filled">Filled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={filterBot} onChange={(e) => setFilterBot(e.target.value)} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
              <option value="all">All Users</option>
              <option value="human">Human Only</option>
              <option value="bot">Bot Only</option>
            </select>
          </div>

          <DataTable
            data={filteredOrders}
            columns={[
              { key: "id", header: "ID", render: (o: any) => <span className="font-mono text-xs text-admin-text-dim">{String(o.id).slice(0, 8)}</span>, width: "60px" },
              { key: "marketName", header: "Market", render: (o: any) => <span className="text-sm text-admin-text">{o.marketName}</span>, width: "220px" },
              { key: "userEmail", header: "User", render: (o: any) => <div className="flex items-center gap-1.5"><span className="truncate text-sm text-admin-text">{o.userEmail}</span>{o.isBot && <Badge variant="cyan">Bot</Badge>}</div>, width: "220px" },
              { key: "side", header: "Side", render: (o: any) => <Badge variant={["BUY_YES", "FOR"].includes(o.side) ? "green" : "red"}>{o.side}</Badge>, width: "100px" },
              { key: "price", header: "Price", render: (o: any) => <span className="font-mono">{((o.price || 0) * 100).toFixed(0)}p</span>, align: "right", width: "60px" },
              { key: "quantity", header: "Qty", render: (o: any) => <span className="font-mono">{Number(o.quantity || 0).toFixed(2)}</span>, align: "right", width: "80px" },
              { key: "filled", header: "Filled", render: (o: any) => <span className="font-mono text-xs">{Number(o.filled || 0).toFixed(2)}/{Number(o.quantity || 0).toFixed(2)}</span>, width: "110px" },
              { key: "status", header: "Status", render: (o: any) => <StatusBadge status={o.status} />, width: "90px" },
              { key: "createdAt", header: "Time", render: (o: any) => <span className="text-xs text-admin-text-dim">{o.createdAt ? new Date(o.createdAt).toLocaleString() : "-"}</span>, width: "140px" },
            ]}
            emptyMessage="No orders match your filters"
            compact
          />
        </Card>
      )}

      {activeTab === "trades" && (
        <Card title="Recent Trades" subtitle="All matched trades across markets" noPadding>
          <DataTable
            data={trades}
            columns={[
              { key: "id", header: "ID", render: (t: any) => <span className="font-mono text-xs text-admin-text-dim">{String(t.id).slice(0, 8)}</span>, width: "60px" },
              { key: "marketName", header: "Market", render: (t: any) => <span className="text-sm text-admin-text">{t.marketName}</span>, width: "220px" },
              { key: "price", header: "Price", render: (t: any) => <span className="font-mono font-bold">{((t.price || 0) * 100).toFixed(0)}p</span>, align: "right", width: "60px" },
              { key: "quantity", header: "Qty", render: (t: any) => <span className="font-mono">{Number(t.quantity || 0).toFixed(2)}</span>, align: "right", width: "70px" },
              { key: "buyerEmail", header: "Buyer", render: (t: any) => <span className="truncate text-sm text-emerald-400">{t.buyerEmail || t.makerEmail}</span>, width: "200px" },
              { key: "sellerEmail", header: "Seller", render: (t: any) => <span className="truncate text-sm text-red-400">{t.sellerEmail || t.takerEmail}</span>, width: "200px" },
              { key: "isBot", header: "", render: (t: any) => t.isBot ? <Badge variant="cyan">Bot</Badge> : null, width: "50px" },
              { key: "timestamp", header: "Time", render: (t: any) => <span className="text-xs text-admin-text-dim">{t.timestamp ? new Date(t.timestamp).toLocaleString() : "-"}</span>, width: "140px" },
            ]}
            emptyMessage="No trades yet"
            compact
          />
        </Card>
      )}

      {activeTab === "batch" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Batch Order Creator" subtitle="Create multiple orders at once">
            <Form method="post" className="space-y-4">
              <input type="hidden" name="action" value="create-batch-orders" />
              <div>
                <label className="mb-1.5 block text-xs font-medium text-admin-text-dim">Market</label>
                <select name="batchMarketId" value={batchMarketId} onChange={(e) => setBatchMarketId(e.target.value)} className="w-full rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text">
                  {allMarkets.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.question || m.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-admin-text-dim">Side</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setBatchSide("FOR")} className={`rounded-lg border py-2 text-sm font-medium ${batchSide === "FOR" ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400" : "border-admin-border bg-admin-surface-2 text-admin-text-dim"}`}>FOR (Buy Yes)</button>
                  <button type="button" onClick={() => setBatchSide("LAY")} className={`rounded-lg border py-2 text-sm font-medium ${batchSide === "LAY" ? "border-red-500/50 bg-red-500/20 text-red-400" : "border-admin-border bg-admin-surface-2 text-admin-text-dim"}`}>LAY (Sell Yes)</button>
                </div>
                <input type="hidden" name="batchSide" value={batchSide} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" name="batchCount" min="1" max="50" value={batchCount} onChange={(e) => setBatchCount(Number(e.target.value))} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text" />
                <input type="number" name="batchQuantity" min="1" max="100" step="0.5" value={batchQuantity} onChange={(e) => setBatchQuantity(Number(e.target.value))} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text" />
                <input type="number" name="batchPriceFrom" min="1" max="99" value={batchPriceFrom} onChange={(e) => setBatchPriceFrom(Number(e.target.value))} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text" />
                <input type="number" name="batchPriceTo" min="1" max="99" value={batchPriceTo} onChange={(e) => setBatchPriceTo(Number(e.target.value))} className="rounded-lg border border-admin-border bg-admin-surface-2 px-3 py-2 text-sm text-admin-text" />
              </div>
              <Button type="submit" variant="primary" className="w-full" disabled={isCreating}>
                {isCreating ? "Creating..." : `Create ${batchCount} Orders`}
              </Button>
            </Form>
          </Card>
          <Card title="Order Preview" subtitle={`${batchCount} orders from ${batchPriceFrom}% to ${batchPriceTo}%`}>
            <div className="max-h-80 space-y-1 overflow-y-auto admin-scrollbar">
              {Array.from({ length: Math.min(batchCount, 20) }, (_, i) => {
                const price = batchCount === 1 ? batchPriceFrom : batchPriceFrom + ((batchPriceTo - batchPriceFrom) / (batchCount - 1)) * i;
                return <div key={i} className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-admin-surface-2"><span className="text-admin-text-dim">#{i + 1}</span><Badge variant={batchSide === "FOR" ? "green" : "red"}>{batchSide}</Badge><span className="font-mono text-admin-text">{price.toFixed(1)}%</span><span className="font-mono text-admin-text-dim">x{batchQuantity}</span></div>;
              })}
              {batchCount > 20 && <div className="py-2 text-center text-xs text-admin-text-dim">... and {batchCount - 20} more</div>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
