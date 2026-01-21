interface Trade {
  id: string;
  market_id: string;
  yes_pts: number; // Probability points (1-9,999,999) - snake_case from database
  cost_pence: number;
  executed_at: string | Date;
}

interface PriceChartProps {
  trades: Trade[];
}

// Convert probability points to percentage (0-100%)
// PRICE_SCALE = 10,000,000, so divide by 100,000
// e.g., 5,000,000 pPts = 50.0000%
function pPtsToPercent(pPts: number): number {
  return pPts / 100_000;
}

export function PriceChart({ trades }: PriceChartProps) {
  if (!trades || trades.length === 0) {
    return (
      <div style={{ 
        background: 'white', 
        padding: '1rem', 
        borderRadius: '8px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        height: '320px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        <div style={{ textAlign: 'center', color: '#a0aec0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Trades Yet</div>
          <div style={{ fontSize: '0.875rem' }}>
            Price chart will appear once trading begins
          </div>
        </div>
      </div>
    );
  }

  // Sort trades by time (oldest first for the chart)
  const sortedTrades = [...trades].sort((a, b) => {
    const timeA = new Date(a.executed_at).getTime();
    const timeB = new Date(b.executed_at).getTime();
    return timeA - timeB;
  });

  // Calculate probability percentages (convert from probability points)
  const probabilities = sortedTrades.map(t => pPtsToPercent(t.yes_pts));
  const lastProb = probabilities[probabilities.length - 1];
  const firstProb = probabilities[0];
  const probChange = lastProb - firstProb;
  const probChangePercent = ((probChange / firstProb) * 100).toFixed(2);
  const isPositive = probChange >= 0;

  // Chart dimensions
  const width = 100;
  const height = 60;
  const padding = { top: 5, right: 5, bottom: 5, left: 5 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate min/max for scaling (use 0-100% range for probabilities)
  const minProb = Math.min(...probabilities, 0);
  const maxProb = Math.max(...probabilities, 100);
  const probRange = maxProb - minProb || 1; // Avoid division by zero

  // Generate path points
  const points = sortedTrades.map((trade, index) => {
    const prob = pPtsToPercent(trade.yes_pts);
    const x = padding.left + (index / (sortedTrades.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((prob - minProb) / probRange) * chartHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // Generate area path for gradient fill
  const areaPath = `${pathD} L ${padding.left + chartWidth},${padding.top + chartHeight} L ${padding.left},${padding.top + chartHeight} Z`;

  return (
    <div style={{ 
      background: 'white', 
      padding: '1rem', 
      borderRadius: '8px', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      height: '320px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a202c', margin: 0 }}>Probability Chart</h3>
          <div style={{ fontSize: '0.875rem', color: '#718096' }}>
            {sortedTrades.length} trades
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1a202c' }}>
            {lastProb.toFixed(4)}%
          </div>
          <div style={{ 
            fontSize: '1rem', 
            fontWeight: 600,
            color: isPositive ? '#38a169' : '#e53e3e'
          }}>
            {isPositive ? '+' : ''}{probChange.toFixed(4)}% ({isPositive ? '+' : ''}{probChangePercent}%)
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg 
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id="priceGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={isPositive ? '#38a169' : '#667eea'} stopOpacity="0.2" />
              <stop offset="100%" stopColor={isPositive ? '#38a169' : '#667eea'} stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* Gradient area */}
          <path
            d={areaPath}
            fill="url(#priceGradient)"
          />
          
          {/* Price line */}
          <path
            d={pathD}
            fill="none"
            stroke={isPositive ? '#38a169' : '#667eea'}
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Latest point indicator */}
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="1"
            fill={isPositive ? '#38a169' : '#667eea'}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div style={{ 
        marginTop: '0.5rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: '#718096'
      }}>
        <div>Low: {minProb.toFixed(4)}%</div>
        <div>High: {maxProb.toFixed(4)}%</div>
      </div>
    </div>
  );
}
