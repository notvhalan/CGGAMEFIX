import { Form } from "@remix-run/react";
import { useState, useEffect } from "react";
import { percentageToPPts } from "~/lib/format";
import { ChevronDown, ChevronUp } from "lucide-react";

// Constants from shared-types
const PRICE_SCALE = 10_000_000;
const CONTRACT_SCALE = 1_000_000;
const CONTRACT_PAYOUT_PENCE = 100;

// Conversion functions (matching shared-types)
function stakeToContracts(stakePence: number, yesPts: number): number {
  return Math.floor((stakePence * CONTRACT_SCALE * PRICE_SCALE) / (yesPts * CONTRACT_PAYOUT_PENCE));
}

function liabilityToContracts(liabilityPence: number, yesPts: number): number {
  const qPts = PRICE_SCALE - yesPts;
  return Math.floor((liabilityPence * CONTRACT_SCALE * PRICE_SCALE) / (qPts * CONTRACT_PAYOUT_PENCE));
}

function contractsCost(contractsMicros: number, yesPts: number): number {
  return Math.floor((contractsMicros * CONTRACT_PAYOUT_PENCE * yesPts) / (PRICE_SCALE * CONTRACT_SCALE));
}

function calculateTakerFee(costPence: number): number {
  return Math.floor((costPence * 10) / 10000); // 0.1%
}

interface OrderTicketProps {
  marketId: string;
  wallet: any;
  selectedPrice?: number | null;
  bestBidPPts?: number | null;
  bestAskPPts?: number | null;
  lastTradePPts?: number | null;
  compact?: boolean;
}

export function OrderTicket({ 
  marketId, 
  wallet, 
  selectedPrice, 
  bestBidPPts,
  bestAskPPts,
  lastTradePPts,
  compact = false 
}: OrderTicketProps) {
  const [side, setSide] = useState<'FOR' | 'LAY'>('FOR');
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [probability, setProbability] = useState('50.00'); // Always YES percentage 0-100
  const [amount, setAmount] = useState('10.00'); // Max cost in pounds
  const [maxSlippagePercent, setMaxSlippagePercent] = useState('5.00'); // Default 5% slippage
  const [showDetails, setShowDetails] = useState(false);

  const isBuy = side === 'BUY_YES';

  const theme = isBuy
    ? {
        accentSolid: '#2ea043',
        accentSoft: 'rgba(46,160,67,0.18)',
        accentBorder: 'rgba(46,160,67,0.75)',
        accentGlow: 'rgba(46,160,67,0.18)',
        accentCTAFrom: 'rgba(46,160,67,0.95)',
        accentCTATo: 'rgba(35,134,54,0.95)',
      }
    : {
        accentSolid: '#f85149',
        accentSoft: 'rgba(248,81,73,0.18)',
        accentBorder: 'rgba(248,81,73,0.85)',
        accentGlow: 'rgba(248,81,73,0.22)',
        accentCTAFrom: 'rgba(248,81,73,0.95)',
        accentCTATo: 'rgba(218,54,51,0.95)',
      };

  // Auto-fill price when clicked from orderbook (using useEffect to avoid render-time state updates)
  useEffect(() => {
    if (selectedPrice && selectedPrice !== percentageToPPts(parseFloat(probability))) {
      const pricePercent = (selectedPrice / 100_000).toFixed(2);
      setProbability(pricePercent);
    }
  }, [selectedPrice]);

  // Calculate contracts and outcomes
  const amountValue = parseFloat(amount);
  const yesInputPPts = percentageToPPts(parseFloat(probability)); // User always inputs YES%
  const amountPence = Math.round(amountValue * 100);
  
  // Determine effective price based on order type
  const marketYesPPts = side === 'BUY_YES' ? bestAskPPts : bestBidPPts; // Buy YES takes asks, Sell YES takes bids
  const effectiveYesPPts = orderType === 'MARKET' && marketYesPPts ? marketYesPPts : yesInputPPts;
  
  // Price submitted to API (YES for FOR, NO for LAY)
  const pPtsSubmitted = side === 'BUY_YES' ? effectiveYesPPts : (PRICE_SCALE - effectiveYesPPts);
  
  // Time in force based on order type
  const timeInForce: 'GTC' | 'IOC' = orderType === 'MARKET' ? 'IOC' : 'GTC';
  
  // Convert slippage percentage to probability points (for market orders)
  const maxSlippagePPts = Math.round(parseFloat(maxSlippagePercent) * 100_000);
  
  let yesPts: number; // For preview calculations
  let contractsMicros: number;
  let costPence: number;
  let feePence: number;
  let potentialProfit: number;
  let maxLoss: number;
  
  if (side === 'BUY_YES') {
    // FOR (Buy YES): submit YES price as-is
    yesPts = effectiveYesPPts;
    contractsMicros = stakeToContracts(amountPence, yesPts);
    costPence = amountPence; // Cost is the max loss
    feePence = calculateTakerFee(costPence);
    
    // If YES wins: get £1 per contract, profit = payout - cost - fee
    const payoutPence = (contractsMicros * CONTRACT_PAYOUT_PENCE) / CONTRACT_SCALE;
    potentialProfit = (payoutPence / 100) - amountValue - (feePence / 100);
    maxLoss = amountValue; // Lose the cost
  } else {
    // LAY (Sell YES): submit NO price (inverted from YES input)
    yesPts = effectiveYesPPts; // Use YES price for preview calculations
    contractsMicros = liabilityToContracts(amountPence, yesPts);
    costPence = contractsCost(contractsMicros, yesPts);
    feePence = calculateTakerFee(costPence);
    
    // If NO wins (YES loses): collect the cost - fee
    potentialProfit = (costPence / 100) - (feePence / 100);
    maxLoss = amountValue; // Lose the cost
  }

  const contracts = (contractsMicros / CONTRACT_SCALE).toFixed(2);
  const clampPPts = (value: number) => Math.max(0, Math.min(PRICE_SCALE, value));
  const formatPctFromPPts = (pPts: number | null | undefined) => {
    if (pPts === null || pPts === undefined) return '--';
    return (pPts / 100_000).toFixed(2);
  };
  const formatMoney = (value: number) => {
    if (!Number.isFinite(value)) return '0.00';
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const clampPercent = (value: number) => Math.max(0.01, Math.min(99.99, value));
  const nudgeProbability = (delta: number) => {
    const current = Number.parseFloat(probability);
    const base = Number.isFinite(current) ? current : 50;
    const next = clampPercent(base + delta);
    setProbability(next.toFixed(2));
  };

  // Headline prices shown on the hero buttons.
  // ALWAYS show market prices (highest executable prices from orderbook)
  // - Buy YES shows the best ask (what you'd pay to buy YES)
  // - Sell YES shows the best bid (what you'd get for selling YES)
  const buyYesHeadlinePPts = bestAskPPts;
  const sellYesHeadlinePPts = bestBidPPts;

  const bookAskYesPPts = bestAskPPts ?? null;
  const bookBidYesPPts = bestBidPPts ?? null;

  const headlineLabel = orderType === 'MARKET' ? 'Market IOC' : 'Limit';
  const isMarket = orderType === 'MARKET';

  // Fill range (shown for Market mode)
  const fillRangeLowPPts = clampPPts(effectiveYesPPts - maxSlippagePPts);
  const fillRangeHighPPts = clampPPts(effectiveYesPPts + maxSlippagePPts);

  const canSubmit = Boolean(wallet) && (orderType === 'LIMIT' || marketYesPPts);
  const ctaLabel = side === 'BUY_YES' ? 'Buy YES' : 'Sell YES';

  const surfaceStyle: React.CSSProperties = compact
    ? { background: 'transparent' }
    : {
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 8,
        boxShadow: 'none',
      };

  const mutedText = '#8b949e';
  const primaryText = '#e6edf3';
  const panelBg = '#0d1117';
  const sectionBg = '#0f1419';
  const inputBg = '#0b1220';
  const borderColor = '#30363d';
  const radius = 8;

  const heavyInputBg = inputBg;
  const heavyInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.7rem',
    borderRadius: radius,
    border: 'none',
    fontSize: 20,
    fontWeight: 800,
    boxSizing: 'border-box',
    background: heavyInputBg,
    color: primaryText,
    outline: 'none',
    fontVariantNumeric: 'tabular-nums',
  };

  const sectionStyle: React.CSSProperties = {
    background: sectionBg,
    borderTop: `1px solid ${borderColor}`,
    padding: 12,
  };

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    height: 28,
    padding: '0 0.55rem',
    borderRadius: 6,
    border: selected ? `1px solid ${theme.accentBorder}` : `1px solid ${borderColor}`,
    background: 'transparent',
    color: primaryText,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums',
  });

  return (
    <>
      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <div style={surfaceStyle}>
      {!compact && (
        <div
          style={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 0.75rem',
            borderBottom: `1px solid ${borderColor}`,
            background: panelBg,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: primaryText }}>Place Order</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: mutedText,
              border: `1px solid ${borderColor}`,
              padding: '2px 6px',
              borderRadius: 999,
            }}
            title={orderType === 'MARKET' ? 'Immediate-or-Cancel' : 'Good-til-Cancelled'}
          >
            {orderType === 'MARKET' ? 'IOC' : 'GTC'}
          </span>
        </div>
      )}

      <div style={{ padding: compact ? '0.75rem' : 0 }}>
        {!wallet && (
          <div
            style={{
              ...sectionStyle,
              borderTop: compact ? `1px solid ${borderColor}` : 'none',
              background: 'rgba(187, 128, 9, 0.10)',
              color: '#fcd34d',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Please log in to place orders
          </div>
        )}

        <Form method="post">
        <input type="hidden" name="marketId" value={marketId} />
        <input type="hidden" name="side" value={side} />
        {orderType === 'MARKET' && <input type="hidden" name="maxSlippagePts" value={maxSlippagePPts} />}
        <input type="hidden" name="pPts" value={pPtsSubmitted} />
        <input type="hidden" name="liabilityPence" value={amountPence} />
        <input type="hidden" name="timeInForce" value={timeInForce} />

        {/* 1) Hero YES/NO buttons (headline price + label) */}
        <div style={{ ...sectionStyle, borderTop: compact ? `1px solid ${borderColor}` : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setSide('BUY_YES')}
            style={{
              height: 72,
              borderRadius: radius,
              border: side === 'BUY_YES' ? `2px solid ${theme.accentSolid}` : `1px solid ${borderColor}`,
              background: side === 'BUY_YES' ? theme.accentSolid : inputBg,
              color: side === 'BUY_YES' ? 'white' : primaryText,
              cursor: 'pointer',
              padding: '0.5rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 3,
              transition: 'all 0.15s',
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatPctFromPPts(buyYesHeadlinePPts)}%
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: side === 'FOR' ? 1 : 0.75 }}>
              Buy YES
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSide('SELL_YES')}
            style={{
              height: 72,
              borderRadius: radius,
              border: side === 'SELL_YES' ? `2px solid ${theme.accentSolid}` : `1px solid ${borderColor}`,
              background: side === 'SELL_YES' ? theme.accentSolid : inputBg,
              color: side === 'SELL_YES' ? 'white' : primaryText,
              cursor: 'pointer',
              padding: '0.5rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 3,
              transition: 'all 0.15s',
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatPctFromPPts(sellYesHeadlinePPts)}%
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: side === 'LAY' ? 1 : 0.75 }}>
              Sell YES
            </div>
          </button>
          </div>
        </div>

        {/* 2) Limit/Market small toggle + IOC pill */}
        <div style={sectionStyle}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              border: `1px solid ${borderColor}`,
              borderRadius: radius,
              overflow: 'hidden',
              background: inputBg,
            }}
          >
            <button
              type="button"
              onClick={() => setOrderType('LIMIT')}
              style={{
                height: 32,
                border: 'none',
                background: orderType === 'LIMIT' ? sectionBg : 'transparent',
                color: orderType === 'LIMIT' ? primaryText : mutedText,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderBottom: orderType === 'LIMIT' ? `2px solid ${theme.accentSolid}` : '2px solid transparent',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Limit
            </button>
            <button
              type="button"
              onClick={() => setOrderType('MARKET')}
              style={{
                height: 32,
                border: 'none',
                background: orderType === 'MARKET' ? sectionBg : 'transparent',
                color: orderType === 'MARKET' ? primaryText : mutedText,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderBottom: orderType === 'MARKET' ? `2px solid ${theme.accentSolid}` : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>Market</span>
              <span
                style={{
                  padding: '0.1rem 0.35rem',
                  borderRadius: 999,
                  border: `1px solid ${borderColor}`,
                  background: 'transparent',
                  color: mutedText,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                }}
                title="Market orders are IOC (immediate-or-cancel)"
              >
                IOC
              </span>
            </button>
          </div>
        </div>

        {/* Optional: compact limit price input (still needed for LIMIT orders) */}
        {orderType === 'LIMIT' && (
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: mutedText, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Limit price
              </div>
              <div style={{ fontSize: 11, color: mutedText, fontVariantNumeric: 'tabular-nums' }}>
                {lastTradePPts ? `Last ${formatPctFromPPts(lastTradePPts)}%` : ''}
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                min="0.01"
                max="99.99"
                step="0.01"
                required
                style={{
                  ...heavyInputStyle,
                  paddingLeft: '0.75rem',
                  paddingRight: '2.25rem',
                  textAlign: 'right',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: mutedText,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  pointerEvents: 'none',
                }}
              >
                %
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {[-2, -0.5, -0.1].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => nudgeProbability(delta)}
                  style={{
                    height: 28,
                    minWidth: 42,
                    padding: '0 0.5rem',
                    borderRadius: 6,
                    border: '1px solid rgba(248,81,73,0.25)',
                    background: 'rgba(248,81,73,0.06)',
                    color: '#f85149',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(248,81,73,0.12)';
                    e.currentTarget.style.borderColor = 'rgba(248,81,73,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(248,81,73,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(248,81,73,0.25)';
                  }}
                  title={`Decrease by ${Math.abs(delta)}%`}
                >
                  {delta}
                </button>
              ))}
              {[0.1, 0.5, 2].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => nudgeProbability(delta)}
                  style={{
                    height: 28,
                    minWidth: 42,
                    padding: '0 0.5rem',
                    borderRadius: 6,
                    border: '1px solid rgba(46,160,67,0.25)',
                    background: 'rgba(46,160,67,0.06)',
                    color: '#2ea043',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(46,160,67,0.12)';
                    e.currentTarget.style.borderColor = 'rgba(46,160,67,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(46,160,67,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(46,160,67,0.25)';
                  }}
                  title={`Increase by ${delta}%`}
                >
                  +{delta}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3) Amount main block */}
        <div
          style={sectionStyle}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: mutedText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Amount
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                const current = parseFloat(amount) || 0;
                const next = Math.max(0.01, current - 5);
                setAmount(next.toFixed(2));
              }}
              style={{
                height: 44,
                width: 44,
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                background: inputBg,
                color: primaryText,
                fontSize: 18,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Decrease by £5"
            >
              −
            </button>
            <div style={{ position: 'relative', flex: 1 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: mutedText,
                  fontSize: 14,
                  fontWeight: 700,
                  pointerEvents: 'none',
                }}
              >
                £
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                step="0.01"
                required
                style={{
                  ...heavyInputStyle,
                  paddingLeft: '2.4rem',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const current = parseFloat(amount) || 0;
                const next = current + 5;
                setAmount(next.toFixed(2));
              }}
              style={{
                height: 44,
                width: 44,
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                background: inputBg,
                color: primaryText,
                fontSize: 18,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Increase by £5"
            >
              +
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[5, 10, 25, 50].map((amt) => (
              (() => {
                const selected = Math.abs(Number.parseFloat(amount) - amt) < 0.0001;
                return (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt.toFixed(2))}
                style={chipStyle(selected)}
              >
                £{amt}
              </button>
                );
              })()
            ))}
            <button
              type="button"
              onClick={() => {
                const balance = typeof wallet?.balance === 'number' ? wallet.balance : 0;
                const maxAmount = Math.max(0, balance * 0.95);
                setAmount(maxAmount.toFixed(2));
              }}
              style={{ marginLeft: 'auto', ...chipStyle(false) }}
            >
              Max
            </button>
          </div>

          {wallet && (
            <div style={{ marginTop: '0.4rem', fontSize: 10.5, color: mutedText, fontVariantNumeric: 'tabular-nums' }}>
              Available £{formatMoney(wallet.balance)}
            </div>
          )}
        </div>

        {/* 4) Slippage: fine control with +/- buttons (Market only) */}
        {orderType === 'MARKET' && (
          <div style={sectionStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: mutedText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Slippage
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(maxSlippagePercent);
                  const next = Math.max(0.1, current - 0.5);
                  setMaxSlippagePercent(next.toFixed(2));
                }}
                style={{
                  height: 36,
                  width: 36,
                  borderRadius: 6,
                  border: `1px solid ${borderColor}`,
                  background: inputBg,
                  color: primaryText,
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Decrease slippage by 0.5%"
              >
                −
              </button>
              <input
                type="number"
                value={maxSlippagePercent}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val >= 0.1 && val <= 50) {
                    setMaxSlippagePercent(e.target.value);
                  }
                }}
                min="0.1"
                max="50"
                step="0.1"
                style={{
                  flex: 1,
                  height: 36,
                  padding: '0 0.75rem',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 16,
                  fontWeight: 800,
                  boxSizing: 'border-box',
                  background: inputBg,
                  color: primaryText,
                  outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: mutedText, minWidth: 14 }}>%</span>
              <button
                type="button"
                onClick={() => {
                  const current = parseFloat(maxSlippagePercent);
                  const next = Math.min(50, current + 0.5);
                  setMaxSlippagePercent(next.toFixed(2));
                }}
                style={{
                  height: 36,
                  width: 36,
                  borderRadius: 6,
                  border: `1px solid ${borderColor}`,
                  background: inputBg,
                  color: primaryText,
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Increase slippage by 0.5%"
              >
                +
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.45rem' }}>
              {[1, 2, 5, 10].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setMaxSlippagePercent(pct.toFixed(2))}
                  style={{
                    flex: 1,
                    height: 24,
                    padding: '0 0.4rem',
                    borderRadius: 4,
                    border: `1px solid ${borderColor}`,
                    background: Math.abs(parseFloat(maxSlippagePercent) - pct) < 0.0001 ? 'rgba(255,255,255,0.06)' : 'transparent',
                    color: mutedText,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <div style={{ marginTop: '0.45rem', fontSize: 10.5, color: mutedText, fontVariantNumeric: 'tabular-nums' }}>
              Fill range: {formatPctFromPPts(fillRangeLowPPts)}% – {formatPctFromPPts(fillRangeHighPPts)}%
            </div>
          </div>
        )}

        {/* 5) Compact summary row + expandable details */}
        <div style={{ ...sectionStyle, background: '#0a0e14' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: mutedText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Risk
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                £{formatMoney(maxLoss)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: mutedText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Win
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#3fb950', fontVariantNumeric: 'tabular-nums' }}>
                £{formatMoney(potentialProfit)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 0.6rem',
                borderRadius: radius,
                border: `1px solid ${borderColor}`,
                background: 'transparent',
                color: primaryText,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
              }}
            >
              Details
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {showDetails && (
            <div style={{ marginTop: '0.5rem', borderTop: `1px solid ${borderColor}`, paddingTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: mutedText, marginBottom: 4 }}>
                <span>Est. contracts</span>
                <span style={{ color: primaryText, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{contracts}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: mutedText, marginBottom: 4 }}>
                <span>Fee (0.10%)</span>
                <span style={{ color: primaryText, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>£{formatMoney(feePence / 100)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: mutedText }}>
                <span>{isMarket ? 'Worst-case (slippage)' : 'Limit price (YES)'}</span>
                <span style={{ color: primaryText, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {isMarket
                    ? side === 'FOR'
                      ? `${formatPctFromPPts(fillRangeHighPPts)}%`
                      : `${formatPctFromPPts(fillRangeLowPPts)}%`
                    : `${formatPctFromPPts(yesInputPPts)}%`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 6) CTA echoes selected side + amount */}
        <div style={{ padding: '12px 12px 12px 12px' }}>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '0.8rem 0.9rem',
              borderRadius: radius,
              border: 'none',
              background: canSubmit ? theme.accentSolid : 'rgba(255,255,255,0.06)',
              color: canSubmit ? 'white' : '#475569',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
              {ctaLabel} — £{formatMoney(amountValue)}
            </div>
            <div style={{ marginTop: 3, fontSize: 10, opacity: 0.7, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {orderType === 'MARKET'
                ? `Est ${formatPctFromPPts(effectiveYesPPts)}% • Slippage ${maxSlippagePercent}%`
                : `Limit ${formatPctFromPPts(yesInputPPts)}%`}
            </div>
          </button>
        </div>
        </Form>
      </div>
      </div>
    </>
  );
}
