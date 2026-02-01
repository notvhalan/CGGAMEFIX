import "~/styles/pages/positions.css";

export default function Positions() {
  return (
    <div className="positions-page">
      <h1 className="positions-title">📊 My Positions</h1>

      <div className="positions-card">
        <div className="positions-empty-icon">📊</div>
        <p className="positions-empty-text">No open positions</p>
      </div>
    </div>
  );
}
