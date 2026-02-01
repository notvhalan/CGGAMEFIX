import "~/styles/pages/orders.css";

export default function Orders() {
  return (
    <div className="orders-page">
      <h1 className="orders-title">📋 My Orders</h1>

      <div className="orders-card">
        <div className="orders-tabs">
          <button className="orders-tab active">Open</button>
          <button className="orders-tab">Matched</button>
          <button className="orders-tab">Cancelled</button>
        </div>
        <div className="orders-empty">
          <div className="orders-empty-icon">📋</div>
          <p className="orders-empty-text">No open orders</p>
        </div>
      </div>
    </div>
  );
}
