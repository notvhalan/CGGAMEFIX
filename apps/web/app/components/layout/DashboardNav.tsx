import { Link, useLocation } from "@remix-run/react";
import { Icons, iconProps, activeIconProps } from "~/config/icons";
import "~/styles/components/dashboard-nav.css";

export function DashboardNav() {
  const location = useLocation();

  return (
    <nav className="header-nav">
      <Link
        to="/app/markets"
        className={`header-nav-link ${location.pathname.startsWith('/app/markets') || location.pathname.startsWith('/app/insurance') ? 'active' : 'inactive'}`}
      >
        <Icons.markets {...(location.pathname.startsWith('/app/markets') || location.pathname.startsWith('/app/insurance') ? activeIconProps : iconProps)} />
        Markets
      </Link>
      <Link
        to="/app/positions"
        className={`header-nav-link ${location.pathname === '/app/positions' ? 'active' : 'inactive'}`}
      >
        <Icons.portfolio {...(location.pathname === '/app/positions' ? activeIconProps : iconProps)} />
        Portfolio
      </Link>
      <Link
        to="/app/orders"
        className={`header-nav-link ${location.pathname === '/app/orders' ? 'active' : 'inactive'}`}
      >
        <Icons.orders {...(location.pathname === '/app/orders' ? activeIconProps : iconProps)} />
        Orders
      </Link>
    </nav>
  );
}
