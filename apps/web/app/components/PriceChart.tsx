import React, { useEffect, useMemo, useRef, useState } from "react";

interface PriceBar {
  market_id?: string;
  bucket_start: string | Date;
  open_yes_pts: number;
  close_yes_pts: number;
  volume_micros: number;
}

interface Trade {
  id?: string;
  market_id?: string;
  yes_pts: number;
  contracts: number;
  executed_at: string | Date;
}

type Timeframe = "tick" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface PriceChartProps {
  priceBars: PriceBar[];
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
    case "tick": return 0;
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

/** Aggregate price_bars_100ms rows into OHLCV candles for any timeframe */
function buildCandles(bars: PriceBar[], timeframe: Timeframe): Candle[] {
  if (bars.length === 0) return [];

  const sorted = [...bars].sort((a, b) => toSec(a.bucket_start) - toSec(b.bucket_start));

  if (timeframe === "tick") {
    // Each 100ms bar → one candle; ensure strictly increasing integer timestamps
    const result: Candle[] = [];
    let lastT = -Infinity;
    for (const bar of sorted) {
      const open = pPtsToPercent(Number(bar.open_yes_pts));
      const close = pPtsToPercent(Number(bar.close_yes_pts));
      let t = toSec(bar.bucket_start);
      if (t <= lastT) t = lastT + 1;
      lastT = t;
      result.push({
        time: t,
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
        volume: Number(bar.volume_micros),
      });
    }
    return result;
  }

  // Aggregate 100ms bars into the selected timeframe bucket
  const tfSec = intervalSec(timeframe);
  const buckets = new Map<number, Candle>();
  for (const bar of sorted) {
    const barSec = toSec(bar.bucket_start);
    const bucket = Math.floor(barSec / tfSec) * tfSec;
    const open = pPtsToPercent(Number(bar.open_yes_pts));
    const close = pPtsToPercent(Number(bar.close_yes_pts));
    const vol = Number(bar.volume_micros);

    if (!buckets.has(bucket)) {
      buckets.set(bucket, {
        time: bucket,
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
        volume: vol,
      });
    } else {
      const c = buckets.get(bucket)!;
      c.high = Math.max(c.high, open, close);
      c.low = Math.min(c.low, open, close);
      c.close = close; // last 100ms bar's close = candle close
      c.volume += vol;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

export function PriceChart({
  priceBars,
  lastTrade,
  timeframe = "15m",
  chartType = "line",
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartLib, setChartLib] = useState<any>(null);

  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const volRef = useRef<any>(null);

  // Tracks the live candle being updated by real-time trades
  const liveBarRef = useRef<{ bucket: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);

  // Create chart once
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

    if (candleRef.current) {
      chartRef.current.removeSeries(candleRef.current);
      candleRef.current = null;
    }
    if (volRef.current) {
      chartRef.current.removeSeries(volRef.current);
      volRef.current = null;
    }

    const candles =
      chartType === "line"
        ? chartRef.current.addSeries(chartLib.LineSeries, {
            priceFormat: {
              type: "custom",
              formatter: (p: number) => `${p.toFixed(2)}%`,
            },
            color: "#667eea",
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

  // Re-seed chart when timeframe, chartType, or source data changes
  const seedKey = useMemo(() => {
    const first = priceBars[0]?.bucket_start?.toString() ?? "";
    const last = priceBars[priceBars.length - 1]?.bucket_start?.toString() ?? "";
    return `${timeframe}:${chartType}:${first}:${last}:${priceBars.length}`;
  }, [timeframe, chartType, priceBars]);

  useEffect(() => {
    if (isLoading) return;
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const volSeries = volRef.current;
    if (!chart || !candleSeries || !volSeries) return;

    const candles = buildCandles(priceBars, timeframe);
    if (candles.length === 0) return;

    liveBarRef.current = null; // reset live bar on full reseed

    if (chartType === "line") {
      candleSeries.setData(candles.map((c) => ({ time: c.time, value: c.close })));
    } else {
      candleSeries.setData(
        candles.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }

    volSeries.setData(
      candles.map((c) => ({
        time: c.time,
        value: Number(c.volume) || 0,
        color:
          c.close >= c.open
            ? "rgba(16,185,129,0.30)"
            : "rgba(239,68,68,0.30)",
      }))
    );

    chart.timeScale().fitContent();
  }, [seedKey, isLoading, timeframe, priceBars, chartType]);

  // Incremental real-time update from WebSocket trade events
  useEffect(() => {
    if (!lastTrade) return;
    const candleSeries = candleRef.current;
    const volSeries = volRef.current;
    if (!candleSeries || !volSeries) return;

    const price = pPtsToPercent(Number(lastTrade.yes_pts));
    // WebSocket normalised trade uses qtyMicros; REST-sourced trades may use contracts.
    // Fall back through both and default to 0 to prevent NaN from reaching the histogram series.
    const vol = Number(lastTrade.qtyMicros ?? lastTrade.contracts ?? 0) || 0;
    const tradeSec = toSec(lastTrade.executed_at);

    // Which timeframe bucket does this trade belong to?
    let bucketSec: number;
    if (timeframe === "tick") {
      bucketSec = tradeSec; // 1-second granularity for live tick
    } else {
      const tfSec = intervalSec(timeframe);
      bucketSec = Math.floor(tradeSec / tfSec) * tfSec;
    }

    const live = liveBarRef.current;
    if (!live || live.bucket !== bucketSec) {
      const prevClose = live?.close ?? price;
      liveBarRef.current = {
        bucket: bucketSec,
        open: prevClose,
        high: Math.max(prevClose, price),
        low: Math.min(prevClose, price),
        close: price,
        volume: vol,
      };
    } else {
      live.high = Math.max(live.high, price);
      live.low = Math.min(live.low, price);
      live.close = price;
      live.volume += vol;
    }

    const c = liveBarRef.current!;
    if (chartType === "line") {
      candleSeries.update({ time: bucketSec, value: c.close });
    } else {
      candleSeries.update({
        time: bucketSec,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    }
    volSeries.update({
      time: bucketSec,
      value: c.volume,
      color:
        c.close >= c.open
          ? "rgba(16,185,129,0.30)"
          : "rgba(239,68,68,0.30)",
    });
  }, [lastTrade, chartType, timeframe]);

  if (!priceBars || priceBars.length === 0) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#64748b" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📈</div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>No Price Data Yet</div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
            Chart will appear once trading begins
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "grid",
            placeItems: "center",
            background: "#1a1f26",
            color: "#64748b",
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Loading chart...</div>
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: "4px",
          left: "4px",
          fontSize: "10px",
          color: "#64748b",
          pointerEvents: "none",
        }}
      >
        Chart by TradingView
      </div>
    </div>
  );
}
