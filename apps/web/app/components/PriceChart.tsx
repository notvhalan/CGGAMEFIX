import React, { useEffect, useMemo, useRef, useState } from "react";

interface Trade {
  id: string;
  market_id: string;
  yes_pts: number;
  contracts: number;
  cost_pence: number;
  executed_at: string | Date;
}

type Timeframe = "tick" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface PriceChartProps {
  trades: Trade[];
  lastTrade?: Trade | null;
  timeframe?: Timeframe;
  marketId: string;
  chartType?: 'line' | 'candle';
}

function pPtsToPercent(pPts: number): number {
  return pPts / 100_000;
}

function toSec(t: string | Date): number {
  return Math.floor(new Date(t).getTime() / 1000);
}

function intervalSec(tf: Timeframe): number {
  switch (tf) {
    case "1m": return 60;
    case "5m": return 300;
    case "15m": return 900;
    case "1h": return 3600;
    case "4h": return 14400;
    case "1d": return 86400;
    case "tick": return 0; // special mode
  }
}

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

class CandleAgg {
  private tf: Timeframe;
  private tfSec: number;

  private currentBucketStart: number | null = null;
  private current: Candle | null = null;

  // for tick mode, ensure strictly increasing timestamps (seconds)
  private lastEmittedTime: number | null = null;

  constructor(tf: Timeframe) {
    this.tf = tf;
    this.tfSec = intervalSec(tf);
  }

  reset(tf: Timeframe) {
    this.tf = tf;
    this.tfSec = intervalSec(tf);
    this.currentBucketStart = null;
    this.current = null;
    this.lastEmittedTime = null;
  }

  // Build initial candles from history (ascending)
  seedFromTrades(sortedAscTrades: Trade[]): Candle[] {
    this.currentBucketStart = null;
    this.current = null;
    this.lastEmittedTime = null;

    const out: Candle[] = [];
    for (const tr of sortedAscTrades) {
      const updates = this.ingest(tr, /*emitGapFills*/ true);
      for (const c of updates) out.push(c);
    }
    return out;
  }

  // ingest trade, return candles that should be appended/updated in order:
  // - in normal tf: might return multiple (gap fills) + last updated candle
  // - in tick: always returns one new bar
  ingest(tr: Trade, emitGapFills: boolean): Candle[] {
    // Handle different trade data structures - check for various field names
    const yesPts = Number(tr.yes_pts || (tr as any).yesPts || (tr as any).price || 0);
    const contracts = Number(tr.contracts || (tr as any).quantity || (tr as any).size || 0);
    
    if (isNaN(yesPts) || isNaN(contracts) || yesPts === 0) {
      console.warn('[CandleAgg] Skipping invalid trade:', { 
        yes_pts: tr.yes_pts, 
        contracts: tr.contracts,
        availableKeys: Object.keys(tr),
        rawTrade: tr 
      });
      return [];
    }
    
    const price = pPtsToPercent(yesPts);
    const vol = contracts; // contracts is the volume

    const tSecRaw = toSec(tr.executed_at);

    // TICK MODE: each trade is its own bar
    if (this.tf === "tick") {
      let tSec = tSecRaw;
      // Ensure strictly increasing timestamps - increment if duplicate or earlier
      if (this.lastEmittedTime !== null) {
        if (tSec <= this.lastEmittedTime) {
          tSec = this.lastEmittedTime + 1;
        }
      }
      this.lastEmittedTime = tSec;

      const c: Candle = {
        time: tSec,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: vol,
      };
      // current is irrelevant in tick mode
      return [c];
    }

    // TIME BUCKET MODE
    const bucket = Math.floor(tSecRaw / this.tfSec) * this.tfSec;

    // if first candle
    if (this.currentBucketStart === null || this.current === null) {
      this.currentBucketStart = bucket;
      this.current = {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: vol,
      };
      return [this.current];
    }

    const updates: Candle[] = [];

    // same bucket -> update current candle
    if (bucket === this.currentBucketStart) {
      this.current.high = Math.max(this.current.high, price);
      this.current.low = Math.min(this.current.low, price);
      this.current.close = price;
      this.current.volume += vol;
      updates.push(this.current);
      return updates;
    }

    // future bucket -> optionally fill gaps
    if (bucket > this.currentBucketStart) {
      const prevClose = this.current.close;
      const prevBucket = this.currentBucketStart;

      if (emitGapFills) {
        // fill missing buckets between prevBucket and bucket
        for (let b = prevBucket + this.tfSec; b < bucket; b += this.tfSec) {
          const flat: Candle = {
            time: b,
            open: prevClose,
            high: prevClose,
            low: prevClose,
            close: prevClose,
            volume: 0,
          };
          updates.push(flat);
        }
      }

      // start new candle at bucket
      this.currentBucketStart = bucket;
      this.current = {
        time: bucket,
        open: prevClose, // common exchange style: open at previous close
        high: Math.max(prevClose, price),
        low: Math.min(prevClose, price),
        close: price,
        volume: vol,
      };
      updates.push(this.current);
      return updates;
    }

    // older trade (out of order) — ignore for realtime incremental mode
    return [];
  }
}

export function PriceChart({
  trades,
  lastTrade,
  timeframe = "15m",
  chartType = "line",
}: PriceChartProps) {
  // console.log('[PriceChart] Render - trades count:', trades?.length, 'timeframe:', timeframe, 'isLoading:', 'initializing');
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartLib, setChartLib] = useState<any>(null);

  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const volRef = useRef<any>(null);

  const aggRef = useRef<CandleAgg | null>(null);

  // Create chart once - only recreate on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const initChart = async () => {
      try {
        const imported = await import("lightweight-charts");
        if (!mounted) return;
        
        setChartLib(imported);
        const { createChart, ColorType } = imported;
        
        if (!mounted || !containerRef.current) return;

        const chart = createChart(containerRef.current, {
          autoSize: true,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#94a3b8",
          },
          grid: {
            vertLines: { color: "#1f2937" },
            horzLines: { color: "#1f2937" },
          },
          rightPriceScale: { borderColor: "#1f2937" },
          timeScale: { borderColor: "#1f2937", rightOffset: 2 },
          crosshair: { mode: 1 },
        });

        chartRef.current = chart;
        setIsLoading(false);
      } catch (error) {
        console.error("[PriceChart] Failed to initialize chart:", error);
        setIsLoading(false);
      }
    };

    initChart();

    return () => {
      mounted = false;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleRef.current = null;
        volRef.current = null;
      }
    };
  }, []);

  // Update series when chartType changes
  useEffect(() => {
    if (!chartRef.current || !chartLib || isLoading) return;

    // Remove old series
    if (candleRef.current) {
      chartRef.current.removeSeries(candleRef.current);
      candleRef.current = null;
    }
    if (volRef.current) {
      chartRef.current.removeSeries(volRef.current);
      volRef.current = null;
    }

    // Add new series based on chartType
    const candles = chartType === 'line' 
      ? chartRef.current.addSeries(chartLib.LineSeries, {
          priceFormat: {
            type: "custom",
            formatter: (p: number) => `${p.toFixed(2)}%`,
          },
          color: '#667eea',
          lineWidth: 2,
        })
      : chartRef.current.addSeries(chartLib.CandlestickSeries, {
          priceFormat: {
            type: "custom",
            formatter: (p: number) => `${p.toFixed(2)}%`,
          },
        });

    const volume = chartRef.current.addSeries(chartLib.HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      scaleMargins: { top: 0.8, bottom: 0.0 },
    });

    candleRef.current = candles;
    volRef.current = volume;
  }, [chartType, chartLib, isLoading]);

  // Re-seed chart when timeframe changes OR initial trades change materially
  // (for exchange UIs, you normally re-seed on tf change; and keep incremental updates after)
  const seedKey = useMemo(() => {
    // cheap key; if you pull history via loader, it changes rarely
    const first = trades[trades.length - 1]?.id ?? "";
    const last = trades[0]?.id ?? "";
    return `${timeframe}:${chartType}:${first}:${last}:${trades.length}`;
  }, [timeframe, chartType, trades]);

  useEffect(() => {
    // Don't try to seed data while chart is still loading
    // console.log('[PriceChart] Data seeding effect - isLoading:', isLoading, 'trades:', trades.length);
    if (isLoading) {
      // console.log('[PriceChart] Skipping seed - chart still loading');
      return;
    }
    
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const volSeries = volRef.current;
    // console.log('[PriceChart] Refs - chart:', !!chart, 'candleSeries:', !!candleSeries, 'volSeries:', !!volSeries);
    if (!chart || !candleSeries || !volSeries) return;

    const sortedAsc = [...trades].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    );
    // console.log('[PriceChart] Sorted trades:', sortedAsc.length, 'first:', sortedAsc[0]?.executed_at, 'last:', sortedAsc[sortedAsc.length-1]?.executed_at);

    if (!aggRef.current) aggRef.current = new CandleAgg(timeframe);
    aggRef.current.reset(timeframe);

    const seeded = aggRef.current.seedFromTrades(sortedAsc);
    // console.log('[PriceChart] Seeded candles:', seeded.length);

    if (seeded.length === 0) {
      // console.log('[PriceChart] No candles generated, exiting');
      return;
    }

    // Deduplicate by time (keep last occurrence) and ensure ascending order
    const dedupedMap = new Map<number, Candle>();
    for (const c of seeded) {
      dedupedMap.set(c.time, c);
    }
    const deduped = Array.from(dedupedMap.values()).sort((a, b) => a.time - b.time);
    // console.log('[PriceChart] After dedup:', deduped.length, 'first:', deduped[0], 'last:', deduped[deduped.length-1]);

    // console.log('[PriceChart] Setting candle data, first:', deduped[0], 'last:', deduped[deduped.length-1]);
    if (chartType === 'line') {
      // For line chart, just set time and value (close price)
      candleSeries.setData(
        deduped.map(c => ({
          time: c.time,
          value: c.close,
        }))
      );
    } else {
      // For candlestick chart, set OHLC
      candleSeries.setData(
        deduped.map(c => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }

    volSeries.setData(
      deduped.map(c => ({
        time: c.time,
        value: Number(c.volume) || 0,
        color: c.close >= c.open ? "rgba(16,185,129,0.30)" : "rgba(239,68,68,0.30)",
      }))
    );

    chart.timeScale().fitContent();
  }, [seedKey, isLoading, timeframe, trades, chartType]);

  // Incremental live update when a trade arrives
  useEffect(() => {
    if (!lastTrade) return;

    const candleSeries = candleRef.current;
    const volSeries = volRef.current;
    const agg = aggRef.current;
    if (!candleSeries || !volSeries || !agg) return;

    const updates = agg.ingest(lastTrade, /*emitGapFills*/ true);
    if (updates.length === 0) return;

    for (const c of updates) {
      if (chartType === 'line') {
        candleSeries.update({
          time: c.time,
          value: c.close,
        });
      } else {
        candleSeries.update({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });
      }

      volSeries.update({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16,185,129,0.30)" : "rgba(239,68,68,0.30)",
      });
    }
  }, [lastTrade, chartType]);
  
  if (!trades || trades.length === 0) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#64748b" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📈</div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>No Trades Yet</div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
            Chart will appear once trading begins
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Always render the container so ref attaches and useEffect can run */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      
      {/* Show loading overlay while chart initializes */}
      {isLoading && (
        <div style={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          display: "grid", 
          placeItems: "center", 
          background: "#1a1f26",
          color: "#64748b",
          zIndex: 10
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Loading chart...</div>
          </div>
        </div>
      )}
      
      {/* TradingView Attribution */}
      <div style={{
        position: "absolute",
        bottom: "4px",
        left: "4px",
        fontSize: "10px",
        color: "#64748b",
        pointerEvents: "none"
      }}>
        Chart by TradingView
      </div>
    </div>
  );
}
