import { useEffect, useRef } from 'react';

interface BalancePoint {
  time: number;
  value: number;
}

interface BalanceEvent {
  time: number;       // unix seconds
  entryType: string;  // 'DEPOSIT' | 'TRADE_SETTLEMENT' | etc.
  credit: number;
  debit: number;
  balance: number;
}

interface BalanceChartProps {
  equity: BalancePoint[];
  available: BalancePoint[];
  reserved: BalancePoint[];
  events?: BalanceEvent[];
  timeRange?: '1D' | '1W' | '1M' | 'ALL';
}

export function BalanceChart({ equity, available, reserved, events, timeRange = '1D' }: BalanceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let isMounted = true;

    import('lightweight-charts').then((module) => {
      if (!isMounted || !chartContainerRef.current) return;

      // v5 exports everything directly — no .default needed
      const { createChart, ColorType, AreaSeries, createSeriesMarkers } = module as any;

      if (!createChart || !AreaSeries) return;

      // Destroy any previous chart instance
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const chart = createChart(chartContainerRef.current!, {
        width: chartContainerRef.current!.clientWidth,
        height: chartContainerRef.current!.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#6b7280',
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: 'rgba(229, 231, 235, 0.4)' },
        },
        rightPriceScale: {
          borderColor: 'transparent',
          autoScale: true,
          alignLabels: true,
          scaleMargins: { top: 0.15, bottom: 0.1 },
        },
        localization: {
          priceFormatter: (price: number) => '£' + price.toFixed(2),
        },
        timeScale: {
          borderColor: 'transparent',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          vertLine: { color: '#e5e7eb', labelBackgroundColor: '#667eea' },
          horzLine: { color: '#e5e7eb', labelBackgroundColor: '#667eea' },
        },
      });

      chartRef.current = chart;

      try {
        const equitySeries = chart.addSeries(AreaSeries, {
          lineColor: '#667eea',
          topColor: 'rgba(102, 126, 234, 0.4)',
          bottomColor: 'rgba(102, 126, 234, 0.05)',
          lineWidth: 2,
        });

        if (equity && equity.length > 0) {
          const validData = equity.map((d) => {
            const time = d.time > 1_000_000_000_000 ? Math.floor(d.time / 1000) : d.time;
            return { time: time as any, value: d.value };
          });
          equitySeries.setData(validData);

          // ── Color-coded event markers ──────────────────────────────────────
          // Priority per second: DEPOSIT > WIN > LOSS (no duplicate times allowed)
          // Colors: green deposit arrow | indigo win dot | red loss dot
          if (createSeriesMarkers && events && events.length > 0) {
            const PRIORITY: Record<string, number> = { DEPOSIT: 3, WIN: 2, LOSS: 1 };
            const seen = new Map<number, { t: number; type: string; evt: BalanceEvent }>();

            for (const evt of events) {
              const t = evt.time > 1_000_000_000_000 ? Math.floor(evt.time / 1000) : evt.time;
              const type =
                evt.entryType === 'DEPOSIT'
                  ? 'DEPOSIT'
                  : evt.credit > evt.debit
                  ? 'WIN'
                  : 'LOSS';
              const existing = seen.get(t);
              if (!existing || (PRIORITY[type] ?? 0) > (PRIORITY[existing.type] ?? 0)) {
                seen.set(t, { t, type, evt });
              }
            }

            const markers = Array.from(seen.values())
              .sort((a, b) => a.t - b.t)
              .map(({ t, type, evt }) => {
                if (type === 'DEPOSIT') {
                  return {
                    time: t as any,
                    position: 'aboveBar' as const,
                    color: '#22c55e',
                    shape: 'arrowUp' as const,
                    text: `+£${evt.credit.toFixed(2)}`,
                    size: 1,
                  };
                }
                if (type === 'WIN') {
                  return {
                    time: t as any,
                    position: 'inBar' as const,
                    color: '#818cf8',
                    shape: 'circle' as const,
                    text: '',
                    size: 0,
                  };
                }
                return {
                  time: t as any,
                  position: 'inBar' as const,
                  color: '#f87171',
                  shape: 'circle' as const,
                  text: '',
                  size: 0,
                };
              });

            createSeriesMarkers(equitySeries, markers);
          }
          // ──────────────────────────────────────────────────────────────────

          chart.timeScale().fitContent();
        }
      } catch (e) {
        console.error('[BalanceChart] Error setting chart data:', e);
      }

      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      };
      resizeHandlerRef.current = handleResize;
      window.addEventListener('resize', handleResize);
    });

    return () => {
      isMounted = false;
      const handler = resizeHandlerRef.current;
      if (handler) {
        window.removeEventListener('resize', handler);
        resizeHandlerRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };

  }, [equity, available, reserved, events, timeRange]);

  return <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />;
}
