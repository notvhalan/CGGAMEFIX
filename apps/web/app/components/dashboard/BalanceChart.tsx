import { useEffect, useRef } from 'react';

/* ──────────────────────────────────────────────────────────────────────
 *  BalanceChart — multi-series equity · available · exposure
 *  lightweight-charts v5 (ESM, dynamically imported on client)
 * ────────────────────────────────────────────────────────────────────── */

interface DataPoint {
  time: number; // unix seconds
  value: number;
}

interface BalanceEvent {
  time: number;
  entryType: string;
  credit: number;
  debit: number;
  balance: number;
}

export interface TooltipData {
  time: number;
  equity: number | null;
  available: number | null;
  exposure: number | null;
}

export interface BalanceChartProps {
  equity: DataPoint[];
  available: DataPoint[];
  exposure: DataPoint[];
  events?: BalanceEvent[];
  timeRange?: '1D' | '1W' | '1M' | 'ALL';
  visibleSeries?: { equity: boolean; available: boolean; exposure: boolean };
  onTooltip?: (tip: TooltipData | null) => void;
}

export function BalanceChart({
  equity,
  available,
  exposure,
  events,
  timeRange = '1W',
  visibleSeries = { equity: true, available: false, exposure: false },
  onTooltip,
}: BalanceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeRef = useRef<(() => void) | null>(null);
  const tooltipRef = useRef(onTooltip);
  tooltipRef.current = onTooltip;

  useEffect(() => {
    if (!containerRef.current) return;
    let dead = false;

    import('lightweight-charts').then((mod) => {
      if (dead || !containerRef.current) return;

      const { createChart, ColorType, LineSeries, AreaSeries, createSeriesMarkers } = mod as any;
      if (!createChart) return;

      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

      const el = containerRef.current!;
      const chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#6b7280',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: 'rgba(48, 54, 61, 0.5)' },
        },
        rightPriceScale: {
          borderColor: 'transparent',
          autoScale: true,
          scaleMargins: { top: 0.12, bottom: 0.08 },
          minimumWidth: 55,
        },
        localization: {
          priceFormatter: (p: number) => {
            const abs = Math.abs(p);
            if (abs >= 1_000_000) return '£' + (p / 1_000_000).toFixed(1) + 'M';
            if (abs >= 1_000) return '£' + (p / 1_000).toFixed(1) + 'K';
            return '£' + p.toFixed(0);
          },
        },
        timeScale: {
          borderColor: 'transparent',
          timeVisible: timeRange === '1D',
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        crosshair: {
          vertLine: { color: 'rgba(148,163,184,0.25)', width: 1, labelBackgroundColor: '#334155' },
          horzLine: { color: 'rgba(148,163,184,0.25)', width: 1, labelBackgroundColor: '#334155' },
        },
        handleScale: { axisPressedMouseMove: { time: true, price: false } },
        handleScroll: { vertTouchDrag: false },
      });
      chartRef.current = chart;

      const norm = (arr: DataPoint[]) =>
        arr.map((d) => ({
          time: (d.time > 1_000_000_000_000 ? Math.floor(d.time / 1000) : d.time) as any,
          value: d.value,
        }));

      /* ─ 1. Equity (hero area fill) ─ */
      let equitySeries: any = null;
      if (visibleSeries.equity && equity.length > 0) {
        equitySeries = chart.addSeries(AreaSeries, {
          lineColor: '#667eea',
          topColor: 'rgba(102, 126, 234, 0.28)',
          bottomColor: 'rgba(102, 126, 234, 0.02)',
          lineWidth: 2.5,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: '#667eea',
          crosshairMarkerBackgroundColor: '#1e1b4b',
        });
        equitySeries.setData(norm(equity));

        // Event markers (wins/losses only, no deposit arrows)
        if (createSeriesMarkers && events && events.length > 0) {
          const PRIO: Record<string, number> = { WIN: 2, LOSS: 1 };
          const seen = new Map<number, { t: number; type: string; evt: BalanceEvent }>();
          for (const evt of events) {
            if (evt.entryType === 'DEPOSIT') continue; // skip deposit markers
            const t = evt.time > 1_000_000_000_000 ? Math.floor(evt.time / 1000) : evt.time;
            const type = evt.credit > evt.debit ? 'WIN' : 'LOSS';
            const existing = seen.get(t);
            if (!existing || (PRIO[type] ?? 0) > (PRIO[existing.type] ?? 0)) seen.set(t, { t, type, evt });
          }
          const markers = Array.from(seen.values())
            .sort((a, b) => a.t - b.t)
            .map(({ t, type }) => {
              if (type === 'WIN')
                return { time: t as any, position: 'inBar' as const, color: '#818cf8', shape: 'circle' as const, text: '', size: 0 };
              return { time: t as any, position: 'inBar' as const, color: '#f87171', shape: 'circle' as const, text: '', size: 0 };
            });
          createSeriesMarkers(equitySeries, markers);
        }
      }

      /* ─ 2. Available (green line) ─ */
      let availSeries: any = null;
      if (visibleSeries.available && available.length > 0) {
        availSeries = chart.addSeries(LineSeries, {
          color: '#3fb950',
          lineWidth: 1.5,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 3,
        });
        availSeries.setData(norm(available));
      }

      /* ─ 3. Open Exposure (dashed amber) ─ */
      let expoSeries: any = null;
      if (visibleSeries.exposure && exposure.length > 0) {
        expoSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 1.5,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 3,
        });
        expoSeries.setData(norm(exposure));
      }

      chart.timeScale().fitContent();

      /* ─ crosshair → tooltip ─ */
      chart.subscribeCrosshairMove((param: any) => {
        if (!tooltipRef.current) return;
        if (!param || !param.time) { tooltipRef.current(null); return; }
        const get = (s: any) => {
          if (!s) return null;
          const d = param.seriesData?.get(s);
          return d ? (d as any).value ?? (d as any).close ?? null : null;
        };
        tooltipRef.current({
          time: typeof param.time === 'object' ? 0 : param.time,
          equity: get(equitySeries),
          available: get(availSeries),
          exposure: get(expoSeries),
        });
      });

      /* ─ resize ─ */
      const onResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
        }
      };
      resizeRef.current = onResize;
      window.addEventListener('resize', onResize);
    });

    return () => {
      dead = true;
      if (resizeRef.current) { window.removeEventListener('resize', resizeRef.current); resizeRef.current = null; }
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [equity, available, exposure, events, timeRange, visibleSeries.equity, visibleSeries.available, visibleSeries.exposure]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
