import React, { useState, useEffect } from "react";
import type { ApexOptions } from "apexcharts";

const GlassCandleStick = () => {
  const [Chart, setChart] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Only render on client-side to avoid SSR issues
  useEffect(() => {
    setIsMounted(true);
    
    // Dynamic import of react-apexcharts to avoid SSR issues
    import("react-apexcharts").then((module) => {
      setChart(() => module.default);
    });
  }, []);

  // 1. Chart Configuration
  const chartOptions: ApexOptions = {
    chart: {
      type: "candlestick",
      height: 350,
      background: "transparent", // CRITICAL: Lets the glass blur show through
      toolbar: { show: false },   // Hide controls for a cleaner look
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 800, // Animation speed in ms
        animateGradually: {
          enabled: true,
          delay: 150,
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350,
        },
      },
    },
    theme: {
      mode: "dark", // Makes text/grid lines light to contrast with glass
    },
    grid: {
      borderColor: "rgba(255,255,255,0.1)", // Subtle grid lines
    },
    xaxis: {
      type: "datetime",
      labels: { style: { colors: "#ffffff" } }, // White text
    },
    yaxis: {
      tooltip: { enabled: true },
      labels: { style: { colors: "#ffffff" } }, // White text
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#00E396",   // Green for up
          downward: "#FF4560", // Red for down
        },
      },
    },
  };

  // 2. Mock Data (OHLC: Open, High, Low, Close)
  const chartSeries = [
    {
      data: [
        { x: new Date(2023, 1, 1), y: [51, 55, 48, 52] },
        { x: new Date(2023, 1, 2), y: [52, 54, 50, 51] },
        { x: new Date(2023, 1, 3), y: [51, 57, 49, 56] },
        { x: new Date(2023, 1, 4), y: [56, 61, 55, 59] },
        { x: new Date(2023, 1, 5), y: [59, 62, 58, 60] },
        { x: new Date(2023, 1, 6), y: [60, 65, 59, 64] },
      ],
    },
  ];

  // Don't render anything until client-side mount
  if (!isMounted || !Chart) {
    return (
      <div className="glass-card" style={{ width: "100%", maxWidth: "600px", padding: "2rem" }}>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.5', marginBottom: '1.5rem', color: '#c9d1d9' }}>
          Loading market trends...
        </p>
      </div>
    );
  }

  return (
    // Testimonial-style glass card with delayed animation
    <div className="glass-card" style={{ 
      width: "100%", 
      maxWidth: "700px", 
      padding: "2rem",
      animationDelay: '0.6s'
    }}>
      <p style={{ fontSize: '1.2rem', lineHeight: '1.5', marginBottom: '1.5rem', color: '#ffffff', fontStyle: 'italic' }}>
        "GameFix's real-time market data and transparent pricing give traders the edge they need. 
        The platform's glassmorphism design makes complex data beautiful and accessible."
      </p>
      
      {/* The Animated Chart */}
      <div className="chart-container" style={{ marginBottom: '1.5rem' }}>
        <Chart
          options={chartOptions}
          series={chartSeries}
          type="candlestick"
          height={280}
        />
      </div>

      {/* Author Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ 
          width: '48px', 
          height: '48px', 
          borderRadius: '50%', 
          background: 'linear-gradient(135deg, #58a6ff 0%, #3fb950 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          fontWeight: 700,
          color: 'white',
          boxShadow: '0 4px 12px rgba(88, 166, 255, 0.3)'
        }}>
          JD
        </div>
        
        <div>
          <strong style={{ display: 'block', fontSize: '1rem', color: '#ffffff', marginBottom: '4px' }}>John Doe</strong>
          <span style={{ fontSize: '0.875rem', color: '#8b949e' }}>Professional Trader</span>
        </div>
      </div>
    </div>
  );
};

export default GlassCandleStick;
