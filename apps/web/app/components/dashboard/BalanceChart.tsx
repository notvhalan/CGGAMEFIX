import { useEffect, useRef } from 'react';

interface BalancePoint {
  time: number;
  value: number;
}

interface BalanceChartProps {
  equity: BalancePoint[];
  available: BalancePoint[];
  reserved: BalancePoint[];
  timeRange?: '1D' | '1W' | '1M' | 'ALL';
}

export function BalanceChart({ equity, available, reserved, timeRange = '1D' }: BalanceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let isMounted = true;

    // Dynamically import lightweight-charts
    import('lightweight-charts').then((module) => {
      if (!isMounted || !chartContainerRef.current) return;

      console.log('[BalanceChart] Module loaded:', module);
      
      // Handle potential ESM vs CJS interop issues
      const createChart = module.createChart || (module.default && module.default.createChart);
      const ColorType = module.ColorType || (module.default && module.default.ColorType) || { Solid: 'solid' };
      const AreaSeries = module.AreaSeries || (module.default && module.default.AreaSeries);

      if (!createChart) {
        console.error('[BalanceChart] Could not find createChart function in module', module);
        return;
      }
      if (!AreaSeries) {
        console.error('[BalanceChart] AreaSeries not found in module', module);
        return;
      }

      // Clean up any existing chart before creating a new one
      if (chartRef.current) {
        chartRef.current.remove();
      }

      console.log('[BalanceChart] Creating chart in container:', {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight
      });

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
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
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        localization: {
          priceFormatter: (price: number) => {
            return '£' + price.toFixed(2);
          },
        },
        timeScale: {
          borderColor: 'transparent',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          vertLine: {
            color: '#e5e7eb',
            labelBackgroundColor: '#667eea',
          },
          horzLine: {
            color: '#e5e7eb',
            labelBackgroundColor: '#667eea',
          },
        },
      });

      chartRef.current = chart;
      console.log('[BalanceChart] Chart created:', chart);

      try {
        const equitySeries = chart.addSeries(AreaSeries, {
          lineColor: '#667eea',
          topColor: 'rgba(102, 126, 234, 0.4)',
          bottomColor: 'rgba(102, 126, 234, 0.05)',
          lineWidth: 2,
        });

        if (equity && equity.length > 0) {
          console.log('[BalanceChart] Setting data:', equity.length, 'points');
          console.log('[BalanceChart] First 3 data points:', equity.slice(0, 3));
          console.log('[BalanceChart] Value range:', {
            min: Math.min(...equity.map(d => d.value)),
            max: Math.max(...equity.map(d => d.value))
          });
          
          // Add explicit type checking/conversion if necessary
          const validData = equity.map((d) => {
            const time = d.time > 1_000_000_000_000 ? Math.floor(d.time / 1000) : d.time;
            return { time: time as any, value: d.value };
          });
          
          console.log('[BalanceChart] Transformed data sample:', validData.slice(0, 3));
          equitySeries.setData(validData);
          chart.timeScale().fitContent();
        } else {
             console.log('[BalanceChart] No equity data provided');
        }
      } catch (e) {
        console.error("Error adding series to chart:", e);
      }

      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ 
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight
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

  }, [equity, available, reserved, timeRange]);

  return <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />;
}
