import React, { useState, useEffect, useRef } from "react";
import type { ApexOptions } from "apexcharts";

const RealTimeGlassChart = () => {
  // CONFIG: Keep only the last 200 candles to maintain performance
  const MAX_DATA_POINTS = 200;
  
  const [Chart, setChart] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [series, setSeries] = useState([{ data: [] as any[] }]);
  
  // We use a ref for the last candle so the interval can access the latest value without dependencies
  const lastCandleRef = useRef({
    x: new Date().getTime(),
    y: [50, 55, 48, 52] // Initial [Open, High, Low, Close] - Probability values 0-100
  });

  // Only render on client-side to avoid SSR issues
  useEffect(() => {
    setIsMounted(true);
    
    // Dynamic import of react-apexcharts to avoid SSR issues
    import("react-apexcharts").then((module) => {
      setChart(() => module.default);
    });
  }, []);

  // Helper: Logic to generate realistic-looking random market moves
  const generateNextCandle = (prev: { x: number; y: number[] }) => {
    const prevClose = prev.y[3]; // Connect new Open to previous Close
    const timestamp = prev.x + 1000; // Increment time
    
    // Increased volatility for more dramatic swings
    const movement = (Math.random() - 0.5) * 8; // Larger movements for dramatic swings (was 3)
    const open = prevClose;
    let close = open + movement;
    
    // Ensure close stays within 0-100 bounds
    close = Math.max(0, Math.min(100, close));
    
    // Calculate High/Low with more varied wick lengths
    const wickVariation = Math.random() * 6; // Increased from 1.5 to 6 for longer wicks
    let high = Math.max(open, close) + wickVariation;
    let low = Math.min(open, close) - wickVariation * (0.5 + Math.random() * 0.5);
    
    // Clamp high/low to 0-100 range
    high = Math.max(0, Math.min(100, high));
    low = Math.max(0, Math.min(100, low));

    return {
      x: timestamp,
      y: [
        parseFloat(open.toFixed(2)), 
        parseFloat(high.toFixed(2)), 
        parseFloat(low.toFixed(2)), 
        parseFloat(close.toFixed(2))
      ]
    };
  };

  // 1. Initial Data Setup
  useEffect(() => {
    if (!isMounted) return;

    // Generate some history so the chart isn't empty on load
    const initialData = [];
    let current = { ...lastCandleRef.current };
    
    for (let i = 0; i < 150; i++) {
      current = generateNextCandle(current);
      initialData.push(current);
    }
    
    setSeries([{ data: initialData }]);
    lastCandleRef.current = current;
  }, [isMounted]);

  // 2. The 0.1s Loop (High Frequency Update)
  useEffect(() => {
    if (!isMounted) return;

    const interval = setInterval(() => {
      const nextCandle = generateNextCandle(lastCandleRef.current);
      lastCandleRef.current = nextCandle;

      setSeries((prevSeries) => {
        const currentData = prevSeries[0].data;
        // Optimization: Remove old data from the front, add new to the back
        const newData = [
          ...(currentData.length > MAX_DATA_POINTS ? currentData.slice(1) : currentData),
          nextCandle
        ];
        return [{ data: newData }];
      });
    }, 100); // 100ms = 0.1 seconds

    return () => clearInterval(interval);
  }, [isMounted]);

  const chartOptions: ApexOptions = {
    chart: {
      type: "candlestick",
      height: 350,
      background: "transparent",
      animations: {
        enabled: false // CRITICAL: Disable animations for high-speed updates
      },
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    theme: { mode: "dark" },
    // THE GLOW EFFECT
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#00f2ea",   // Cyan/Neon Blue
          downward: "#ff0055", // Neon Red/Pink
        },
        wick: { useFillColor: true },
      }
    },
    // Add Drop Shadow to simulate "Bloom"
    fill: {
      type: 'solid',
      opacity: 1
    },
    grid: {
      show: true,
      borderColor: "rgba(255,255,255,0.05)",
      strokeDashArray: 4,
    },
    xaxis: {
      type: "datetime",
      tooltip: { enabled: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { show: false } // Hide labels for a cleaner "widget" look
    },
    yaxis: {
      tooltip: { enabled: true },
      opposite: true, // Move Y-axis to right side like trading terminals
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: { 
        style: { colors: "#8b949e", fontFamily: 'monospace' },
        formatter: (value: number) => `${value.toFixed(0)}%`
      }
    },
    tooltip: {
      custom: function({ seriesIndex, dataPointIndex, w }: any) {
        const o = w.globals.seriesCandleO[seriesIndex][dataPointIndex];
        const h = w.globals.seriesCandleH[seriesIndex][dataPointIndex];
        const l = w.globals.seriesCandleL[seriesIndex][dataPointIndex];
        const c = w.globals.seriesCandleC[seriesIndex][dataPointIndex];
        
        return `<div style="padding: 8px;">
          <div style="margin-bottom: 4px; font-weight: bold; color: #00f2ea;">Probability</div>
          <div>Open: ${o?.toFixed(2)}%</div>
          <div>High: ${h?.toFixed(2)}%</div>
          <div>Low: ${l?.toFixed(2)}%</div>
          <div>Close: ${c?.toFixed(2)}%</div>
        </div>`;
      }
    }
  };

  // Don't render anything until client-side mount
  if (!isMounted || !Chart) {
    return (
      <div className="glass-card" style={{ width: "100%", maxWidth: "800px", padding: "2rem" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
          <div>
            <span style={{ color: '#00f2ea', fontWeight: 'bold', fontSize: '1.1rem' }}>P(Richter CAT 8 Tsunami before 29/11/2026)</span>
          </div>
          <div style={{ color: '#00f2ea', fontFamily: 'monospace' }}>
            Loading...
          </div>
        </div>
        <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
          Initializing live market data...
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card realtime-chart" style={{ width: '100%', maxWidth: '800px', animationDelay: '0.6s' }}>
       {/* Header mimicking a trading terminal */}
       <div style={{ 
         display: 'flex', 
         justifyContent: 'space-between', 
         marginBottom: '0.75rem', 
         borderBottom: '1px solid rgba(255,255,255,0.1)', 
         paddingBottom: '0.4rem' 
       }}>
          <div>
            <span style={{ color: '#00f2ea', fontWeight: 'bold', fontSize: '1.1rem' }}>P(Richter CAT 8 Tsunami before 29/11/2026)</span>
          </div>
          <div style={{ color: '#00f2ea', fontFamily: 'monospace', fontSize: '1.1rem' }}>
            {lastCandleRef.current.y[3].toFixed(2)}%
          </div>
       </div>

      <Chart
        options={chartOptions}
        series={series}
        type="candlestick"
        height={320}
      />
    </div>
  );
};

export default RealTimeGlassChart;
