import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation } from "@remix-run/react";
import { useState, useMemo } from "react";
import { getMyOrders, cancelOrder, getMarkets } from "~/lib/api.server";
import { ClipboardList, X, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface Order {
  id: string;
  marketId: string;
  side: 'FOR' | 'LAY';
  pPts: number;
  yesPts: number;
  liabilityPence: number;
  originalContracts: string;
  remainingContracts: string;
  status: string;
  timeInForce?: string;
  createdAt: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const [ordersResponse, marketsResponse] = await Promise.allSettled([
      getMyOrders(request, 100),
      getMarkets()
    ]);

    const orders = ordersResponse.status === 'fulfilled' ? ordersResponse.value?.orders || [] : [];
    const markets = marketsResponse.status === 'fulfilled' ? marketsResponse.value?.markets || [] : [];
    
    // Create a map of market names
    const marketMap: Record<string, string> = {};
    markets.forEach((m: any) => {
      marketMap[m.id] = m.name || m.question || `Market ${m.id.slice(0, 8)}`;
    });

    return json({ orders, marketMap });
  } catch (error) {
    console.error('[Orders Loader] Error:', error);
    return json({ orders: [], marketMap: {} as Record<string, string> });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'cancel') {
    const orderId = formData.get('orderId') as string;
    if (orderId) {
      try {
        await cancelOrder(request, orderId);
        return json({ success: true, message: 'Order cancelled' });
      } catch (error) {
        return json({ success: false, message: 'Failed to cancel order' }, { status: 500 });
      }
    }
  }

  if (intent === 'cancelMany') {
    const orderIds = formData.getAll('orderIds') as string[];
    if (orderIds.length > 0) {
      try {
        await Promise.all(orderIds.map(id => cancelOrder(request, id)));
        return json({ success: true, message: `Cancelled ${orderIds.length} orders` });
      } catch (error) {
        return json({ success: false, message: 'Failed to cancel orders' }, { status: 500 });
      }
    }
  }

  if (intent === 'cancelAll') {
    const orderIds = formData.getAll('allOrderIds') as string[];
    if (orderIds.length > 0) {
      try {
        await Promise.all(orderIds.map(id => cancelOrder(request, id)));
        return json({ success: true, message: `Cancelled all ${orderIds.length} orders` });
      } catch (error) {
        return json({ success: false, message: 'Failed to cancel all orders' }, { status: 500 });
      }
    }
  }

  return json({ success: false, message: 'Invalid action' });
}

type FilterTab = 'all' | 'open' | 'partial' | 'filled' | 'cancelled';

export default function Orders() {
  const { orders, marketMap } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  // Type assertion for marketMap
  const marketNames = marketMap as Record<string, string>;

  // Helper to normalize status to lowercase
  const normalizeStatus = (status: string) => (status || '').toLowerCase();

  // Filter orders based on tab
  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter((o: Order) => normalizeStatus(o.status) === activeTab);
  }, [orders, activeTab]);

  // Group orders by market
  const ordersByMarket = useMemo(() => {
    const grouped: Record<string, Order[]> = {};
    filteredOrders.forEach((order: Order) => {
      if (!grouped[order.marketId]) {
        grouped[order.marketId] = [];
      }
      grouped[order.marketId].push(order);
    });
    return grouped;
  }, [filteredOrders]);

  // Count by status
  const counts = useMemo(() => ({
    all: orders.length,
    open: orders.filter((o: Order) => normalizeStatus(o.status) === 'open').length,
    partial: orders.filter((o: Order) => normalizeStatus(o.status) === 'partial').length,
    filled: orders.filter((o: Order) => normalizeStatus(o.status) === 'filled').length,
    cancelled: orders.filter((o: Order) => normalizeStatus(o.status) === 'cancelled').length,
  }), [orders]);

  // Active orders for cancel all
  const activeOrders = orders.filter((o: Order) => {
    const status = normalizeStatus(o.status);
    return status === 'open' || status === 'partial';
  });

  const toggleMarket = (marketId: string) => {
    setExpandedMarkets(prev => {
      const next = new Set(prev);
      if (next.has(marketId)) {
        next.delete(marketId);
      } else {
        next.add(marketId);
      }
      return next;
    });
  };

  const panelStyle: React.CSSProperties = {
    background: '#0d1117',
    border: '1px solid #2d3748',
    borderRadius: '8px',
    overflow: 'hidden'
  };

  const headerStyle: React.CSSProperties = {
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #2d3748',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ClipboardList size={28} color="#667eea" />
          <h1 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 700, 
            color: '#e4e8eb',
            margin: 0
          }}>
            My Orders
          </h1>
        </div>

        {/* Cancel All Button */}
        {activeOrders.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="cancelAll" />
            {activeOrders.map(o => (
              <input key={o.id} type="hidden" name="allOrderIds" value={o.id} />
            ))}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                color: '#ef4444',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSubmitting ? 0.5 : 1
              }}
            >
              <X size={14} />
              Cancel All ({activeOrders.length})
            </button>
          </Form>
        )}
      </div>

      {/* Stats Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(5, 1fr)', 
        gap: '0.75rem',
        marginBottom: '1.25rem'
      }}>
        {[
          { key: 'all', label: 'All Orders', color: '#667eea' },
          { key: 'open', label: 'Open', color: '#10b981' },
          { key: 'partial', label: 'Partial', color: '#f59e0b' },
          { key: 'filled', label: 'Filled', color: '#06b6d4' },
          { key: 'cancelled', label: 'Cancelled', color: '#64748b' }
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as FilterTab)}
            style={{
              background: activeTab === key ? `${color}15` : '#1a1f26',
              border: `1px solid ${activeTab === key ? color : '#2d3748'}`,
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s'
            }}
          >
            <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: activeTab === key ? color : '#e4e8eb', fontFamily: 'JetBrains Mono' }}>
              {counts[key as keyof typeof counts]}
            </div>
          </button>
        ))}
      </div>

      {/* Orders Panel */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e4e8eb' }}>
            {filteredOrders.length} {activeTab === 'all' ? 'total' : activeTab} order{filteredOrders.length !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Grouped by market
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <ClipboardList size={48} color="#374151" style={{ marginBottom: '1rem' }} />
            <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
              No {activeTab === 'all' ? '' : activeTab} orders
            </div>
            <Link
              to="/app/markets"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                background: '#667eea',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 600
              }}
            >
              Browse Markets
            </Link>
          </div>
        ) : (
          <div>
            {Object.entries(ordersByMarket).map(([marketId, marketOrders]) => {
              const isExpanded = expandedMarkets.has(marketId);
              const marketName = marketNames[marketId] || `Market ${marketId.slice(0, 8)}...`;
              const activeCount = marketOrders.filter(o => {
                const status = normalizeStatus(o.status);
                return status === 'open' || status === 'partial';
              }).length;
              const totalLiability = marketOrders.reduce((sum, o) => sum + (o.liabilityPence || 0), 0);

              return (
                <div key={marketId} style={{ borderBottom: '1px solid #2d3748' }}>
                  {/* Market header row */}
                  <div
                    onClick={() => toggleMarket(marketId)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr 100px 100px 80px 100px',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(102, 126, 234, 0.05)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    <div style={{ color: '#64748b' }}>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div style={{ 
                      fontSize: '0.8125rem', 
                      color: '#e4e8eb', 
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {marketName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {marketOrders.length} order{marketOrders.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: activeCount > 0 ? '#10b981' : '#64748b' }}>
                      {activeCount} active
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontFamily: 'JetBrains Mono' }}>
                      £{(totalLiability / 100).toFixed(2)}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Link
                        to={`/app/markets/${marketId}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.6875rem',
                          color: '#667eea',
                          textDecoration: 'none'
                        }}
                      >
                        View Market <ExternalLink size={10} />
                      </Link>
                    </div>
                  </div>

                  {/* Expanded order list */}
                  {isExpanded && (
                    <div style={{ background: '#0b1220', borderTop: '1px solid #1f2937' }}>
                      {/* Order table header */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 80px 100px 100px 100px 80px 60px',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem 0.5rem 2.5rem',
                        fontSize: '0.6875rem',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid #1f2937'
                      }}>
                        <div>Side</div>
                        <div>Price</div>
                        <div>Original</div>
                        <div>Remaining</div>
                        <div>Liability</div>
                        <div>Status</div>
                        <div style={{ textAlign: 'right' }}>Action</div>
                      </div>

                      {/* Orders */}
                      {marketOrders.map((order) => {
                        const price = (order.pPts / 100_000).toFixed(1);
                        const originalContracts = Number(order.originalContracts) / 1_000_000;
                        const remainingContracts = Number(order.remainingContracts) / 1_000_000;
                        const isActive = normalizeStatus(order.status) === 'open' || normalizeStatus(order.status) === 'partial';
                        const sideColor = order.side === 'FOR' ? '#10b981' : '#ef4444';
                        const statusColor = order.status === 'open' ? '#10b981' : order.status === 'partial' ? '#f59e0b' : order.status === 'filled' ? '#06b6d4' : '#64748b';

                        return (
                          <div
                            key={order.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '80px 80px 100px 100px 100px 80px 60px',
                              gap: '0.5rem',
                              padding: '0.5rem 1rem 0.5rem 2.5rem',
                              fontSize: '0.75rem',
                              alignItems: 'center',
                              borderBottom: '1px solid #1f2937'
                            }}
                          >
                            <div>
                              <span style={{
                                display: 'inline-block',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '3px',
                                fontSize: '0.625rem',
                                fontWeight: 700,
                                background: `${sideColor}20`,
                                color: sideColor
                              }}>
                                {order.side === 'FOR' ? 'BUY YES' : 'SELL YES'}
                              </span>
                            </div>
                            <div style={{ fontFamily: 'JetBrains Mono', color: '#e4e8eb' }}>
                              {price}%
                            </div>
                            <div style={{ fontFamily: 'JetBrains Mono', color: '#94a3b8' }}>
                              {originalContracts.toFixed(2)} ctr
                            </div>
                            <div style={{ fontFamily: 'JetBrains Mono', color: '#e4e8eb' }}>
                              {remainingContracts.toFixed(2)} ctr
                            </div>
                            <div style={{ fontFamily: 'JetBrains Mono', color: '#f59e0b' }}>
                              £{(order.liabilityPence / 100).toFixed(2)}
                            </div>
                            <div>
                              <span style={{
                                display: 'inline-block',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '3px',
                                fontSize: '0.5625rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                background: `${statusColor}15`,
                                color: statusColor
                              }}>
                                {order.status}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              {isActive && (
                                <Form method="post" style={{ display: 'inline' }}>
                                  <input type="hidden" name="intent" value="cancel" />
                                  <input type="hidden" name="orderId" value={order.id} />
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '24px',
                                      height: '24px',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      borderRadius: '4px',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      opacity: isSubmitting ? 0.5 : 1
                                    }}
                                  >
                                    <X size={12} />
                                  </button>
                                </Form>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
