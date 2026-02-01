import { Link, useLocation } from "@remix-run/react";
import "~/styles/components/dashboard-nav.css";

export function DashboardNav() {
  const location = useLocation();

  return (
    <nav className="header-nav">
      <Link
        to="/app/markets"
        className={`header-nav-link ${location.pathname.startsWith('/app/markets') ? 'active' : 'inactive'}`}
      >
        📈 Markets
      </Link>
      <Link
        to="/app/positions"
        className={`header-nav-link ${location.pathname === '/app/positions' ? 'active' : 'inactive'}`}
      >
        📊 Portfolio
      </Link>
      <Link
        to="/app/orders"
        className={`header-nav-link ${location.pathname === '/app/orders' ? 'active' : 'inactive'}`}
      >
        📋 Orders
      </Link>
    </nav>
  );
}
