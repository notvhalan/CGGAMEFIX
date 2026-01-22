interface Trade {
  id: string;
  market_id: string;
  yes_pts: number;
  cost_pence: number;
  executed_at: string | Date;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  trades: Trade[];
  timeframe?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

function pPtsToPercent(pPts: number): number {
  return pPts / 100_000;
}

// Build candles from trades based on timeframe
function buildCandles(trades: Trade[], timeframe: string): Candle[] {
  if (trades.length === 0) return [];

  const intervalMs: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  };

  const interval = intervalMs[timeframe] || intervalMs['15m'];
  const sorted = [...trades].sort((a, b) => 
    new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
  );

  const candles: Candle[] = [];
  const buckets = new Map<number, Trade[]>();

  // Group trades into time buckets
  sorted.forEach(trade => {
    const time = new Date(trade.executed_at).getTime();
    const bucketTime = Math.floor(time / interval) * interval;
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, []);
    }
    buckets.get(bucketTime)!.push(trade);
  });

  // Convert buckets to candles
  Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([time, bucketTrades]) => {
      const prices = bucketTrades.map(t => pPtsToPercent(t.yes_pts));
      const volume = bucketTrades.reduce((sum, t) => sum + t.cost_pence, 0);
      
      candles.push({
        time,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume
      });
    });

  return candles;
}

export function PriceChart({ trades, timeframe = '15m' }: PriceChartProps) {
  if (!trades || trades.length === 0) {
    return (
      <div style={{ 
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        color: '#64748b'
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📈</div>
        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>No Trades Yet</div>
        <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
          Chart will appear once trading begins
        </div>
      </div>
    );
  }

  const candles = buildCandles(trades, timeframe);
  const lastCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  
  if (!lastCandle || !firstCandle) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Building chart...</div>;
  }

  const priceChange = lastCandle.close - firstCandle.open;
  const priceChangePercent = ((priceChange / firstCandle.open) * 100);
  const isPositive = priceChange >= 0;

  // Calculate chart bounds
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;
  
  const maxVolume = Math.max(...candles.map(c => c.volume), 1);

  return (
    <div style={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Chart Stats Header */}
      <div style={{ 
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #2d3748',
        display: 'flex',
        gap: '1.5rem',
        alignItems: 'center',
        fontSize: '0.75rem',
        flexShrink: 0
      }}>
        <div>
          <span style={{ color: '#64748b', marginRight: '0.375rem' }}>Last</span>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#e4e8eb' }}>
            {lastCandle.close.toFixed(2)}%
          </span>
        </div>
        <div style={{ 
          fontWeight: 600, 
          color: isPositive ? '#10b981' : '#ef4444' 
        }}>
          {isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%
        </div>
        <div>
          <span style={{ color: '#64748b', marginRight: '0.375rem' }}>H</span>
          <span style={{ fontWeight: 600 }}>{maxPrice.toFixed(2)}%</span>
        </div>
        <div>
          <span style={{ color: '#64748b', marginRight: '0.375rem' }}>L</span>
          <span style={{ fontWeight: 600 }}>{minPrice.toFixed(2)}%</span>
        </div>
        <div>
          <span style={{ color: '#64748b', marginRight: '0.375rem' }}>Candles</span>
          <span style={{ fontWeight: 600 }}>{candles.length}</span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ flex: 1, position: 'relative', padding: '0.75rem' }}>
        <svg width="100%" height="100%" viewBox="0 0 1000 500" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = ratio * 500;
            return (
              <g key={ratio}>
                <line
                  x1="0"
                  y1={y}
                  x2="1000"
                  y2={y}
                  stroke="#2d3748"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <text
                  x="8"
                  y={y + 4}
                  fill="#64748b"
                  fontSize="12"
                  fontFamily="monospace"
                >
                  {(maxPrice - (ratio * priceRange)).toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* Candlesticks */}
          {candles.map((candle, i) => {
            const x = (i / (candles.length - 1)) * 1000;
            const candleWidth = Math.max(2, 800 / candles.length);
            
            const highY = ((maxPrice - candle.high) / priceRange) * 500;
            const lowY = ((maxPrice - candle.low) / priceRange) * 500;
            const openY = ((maxPrice - candle.open) / priceRange) * 500;
            const closeY = ((maxPrice - candle.close) / priceRange) * 500;
            
            const isBullish = candle.close >= candle.open;
            const color = isBullish ? '#10b981' : '#ef4444';
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.abs(closeY - openY) || 1;

            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1"
                />
                {/* Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={isBullish ? color : 'transparent'}
                  stroke={color}
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* Last price line */}
          <line
            x1="0"
            y1={((maxPrice - lastCandle.close) / priceRange) * 500}
            x2="1000"
            y2={((maxPrice - lastCandle.close) / priceRange) * 500}
            stroke={isPositive ? '#10b981' : '#ef4444'}
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
        </svg>
      </div>

      {/* Volume Histogram */}
      <div style={{ 
        height: '60px',
        padding: '0 0.75rem 0.5rem',
        borderTop: '1px solid #2d3748',
        flexShrink: 0
      }}>
        <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
          {candles.map((candle, i) => {
            const x = (i / (candles.length - 1)) * 1000;
            const barWidth = Math.max(2, 800 / candles.length);
            const height = (candle.volume / maxVolume) * 100;
            const isBullish = candle.close >= candle.open;

            return (
              <rect
                key={i}
                x={x - barWidth / 2}
                y={100 - height}
                width={barWidth}
                height={height}
                fill={isBullish ? '#10b98140' : '#ef444440'}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
