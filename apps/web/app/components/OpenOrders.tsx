import { Form } from '@remix-run/react';
import { useMemo, useState } from 'react';

// Add scrollbar styles
if (typeof document !== 'undefined' && !document.getElementById('open-orders-scrollbar-style')) {
  const style = document.createElement('style');
  style.id = 'open-orders-scrollbar-style';
  style.textContent = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #1a1f26;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #374151;
      border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #4b5563;
    }
  `;
  document.head.appendChild(style);
}

interface Order {
  id: string;
  marketId: string;
  side: 'BUY_YES' | 'SELL_YES' | 'FOR' | 'LAY' | 'BuyYes' | 'SellYes';
  yesPts?: number;
  pPts?: number;
  remainingContracts: string;
  status: string;
  createdAt: string;
}

interface GroupedOrder {
  yesPts: number;
  side: 'BUY_YES' | 'SELL_YES' | 'FOR' | 'LAY';
  orders: Order[];
  totalContracts: number;
}

interface OpenOrdersProps {
  orders: Order[] | null;
}

const isBuyYesSide = (side: string) => side === 'BUY_YES' || side === 'FOR' || side === 'BuyYes';
const isSellYesSide = (side: string) => side === 'SELL_YES' || side === 'LAY' || side === 'SellYes';

export default function OpenOrders({ orders }: OpenOrdersProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const limit = 200;

  const { forGroups, layGroups } = useMemo(() => {
    if (!orders?.length) return { forGroups: [], layGroups: [] };

    const grouped = orders.reduce((acc, order) => {
      const pts = order.yesPts ?? order.pPts ?? 0;
      const key = `${pts}-${order.side}`;
      if (!acc[key]) {
        acc[key] = { yesPts: Number(pts), side: order.side, orders: [], totalContracts: 0 };
      }
      acc[key].orders.push(order);
      acc[key].totalContracts += Math.round(Number(order.remainingContracts) / 1_000_000);
      return acc;
    }, {} as Record<string, GroupedOrder>);

    const allGroups = Object.values(grouped).sort((a, b) => b.yesPts - a.yesPts);
    const forGroups = allGroups.filter(g => isBuyYesSide(g.side));
    const layGroups = allGroups.filter(g => isSellYesSide(g.side));
    
    return { forGroups, layGroups };
  }, [orders]);

  if (!orders?.length) {
    return (
      <div style={{ padding: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.75rem' }}>
        No open orders
      </div>
    );
  }

  const visibleFor = forGroups.slice(0, limit);
  const visibleLay = layGroups.slice(0, limit);

  const renderOrderGroup = (g: GroupedOrder) => {
    const key = `${g.yesPts}-${g.side}`;
    const yesPct = (g.yesPts / 100_000).toFixed(2) + '%';
    const isExpanded = expandedKey === key;

    return (
      <div key={key}>
        {/* row */}
        <div
          onClick={() => setExpandedKey(isExpanded ? null : key)}
          style={{
            display: 'grid',
            gridTemplateColumns: '70px 100px 60px 50px',
            gap: '0.5rem',
            padding: '0.35rem 0.5rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#e4e8eb',
            borderBottom: '1px solid #111827',
            cursor: 'pointer',
            lineHeight: 1.2
          }}
        >
          <div style={{ fontWeight: 700 }}>{yesPct}</div>
          <div><span style={{ color: 'white', fontWeight: 700 }}>{g.totalContracts}</span> <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>ctr</span></div>
          <div style={{ color: '#94a3b8' }}>{g.orders.length}</div>

          {/* cancel */}
          <div style={{ textAlign: 'right' }}>
            <Form method="post">
              <input type="hidden" name="intent" value="cancelMany" />
              {g.orders.map(o => (
                <input key={o.id} type="hidden" name="orderIds" value={o.id} />
              ))}
              <button
                type="submit"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'transparent',
                  border: '1px solid #374151',
                  color: '#94a3b8',
                  borderRadius: 4,
                  padding: '0.2rem 0.4rem',
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </Form>
          </div>
        </div>

        {/* expanded */}
        {isExpanded && (
          <div style={{
            padding: '0.5rem 0.5rem 0.75rem 0.5rem',
            background: '#0f1419',
            borderBottom: '1px solid #111827',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            color: '#94a3b8'
          }}>
            {g.orders.slice(0, 20).map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                <span>{o.id.slice(0, 8)}…</span>
                <span>{Math.round(Number(o.remainingContracts) / 1_000_000)} ctr</span>
                <span>{new Date(o.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
            {g.orders.length > 20 && (
              <div style={{ marginTop: '0.25rem', color: '#64748b' }}>
                +{g.orders.length - 20} more…
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#2d3748', flex: 1, overflow: 'hidden' }}>
        {/* FOR side */}
        <div style={{ background: '#1a1f26', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* FOR header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '70px 100px 60px 50px',
            gap: '0.5rem',
            padding: '0.35rem 0.5rem',
            fontFamily: 'monospace',
            fontSize: '0.65rem',
            color: '#64748b',
            borderBottom: '1px solid #1f2937',
            flexShrink: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: 'rgba(96, 165, 250, 0.05)'
          }}>
            <div style={{ color: '#60a5fa', fontWeight: 700 }}>BUY YES</div>
            <div>Contracts</div>
            <div>Orders</div>
            <div style={{ textAlign: 'right' }}>Cancel</div>
          </div>

          {/* FOR scroll area */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#374151 #1a1f26'
          }}
          className="custom-scrollbar">
            {visibleFor.length === 0 ? (
              <div style={{ padding: '1rem 0.5rem', color: '#64748b', fontSize: '0.7rem', textAlign: 'center' }}>
                No BUY YES orders
              </div>
            ) : (
              visibleFor.map(renderOrderGroup)
            )}
          </div>
        </div>

        {/* LAY side */}
        <div style={{ background: '#1a1f26', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* LAY header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '70px 100px 60px 50px',
            gap: '0.5rem',
            padding: '0.35rem 0.5rem',
            fontFamily: 'monospace',
            fontSize: '0.65rem',
            color: '#64748b',
            borderBottom: '1px solid #1f2937',
            flexShrink: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: 'rgba(248, 113, 113, 0.05)'
          }}>
            <div style={{ color: '#f87171', fontWeight: 700 }}>SELL YES</div>
            <div>Contracts</div>
            <div>Orders</div>
            <div style={{ textAlign: 'right' }}>Cancel</div>
          </div>

          {/* LAY scroll area */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#374151 #1a1f26'
          }}
          className="custom-scrollbar">
            {visibleLay.length === 0 ? (
              <div style={{ padding: '1rem 0.5rem', color: '#64748b', fontSize: '0.7rem', textAlign: 'center' }}>
                No SELL YES orders
              </div>
            ) : (
              visibleLay.map(renderOrderGroup)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
