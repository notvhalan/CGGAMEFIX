// Icon configuration using Feather icons (react-icons/fi)
// Thin, consistent stroke icons for dark trading-terminal UI
import {
  FiActivity,
  FiHome,
  FiBarChart2,
  FiPieChart,
  FiClipboard,
  FiRefreshCw,
  FiDollarSign,
  FiSettings,
  FiSearch,
  FiUser,
  FiDownload,
  FiTrendingUp,
  FiZap,
  FiStar,
} from "react-icons/fi";

export const Icons = {
  // Brand
  brand: FiActivity,
  brandAlt: FiZap,

  // Top nav tabs
  markets: FiBarChart2,
  portfolio: FiPieChart,
  orders: FiClipboard,
  trade: FiTrendingUp,
  
  // Actions
  search: FiSearch,
  live: FiActivity,
  deposit: FiDownload,
  user: FiUser,

  // Sidebar navigation
  home: FiHome,
  refresh: FiRefreshCw,
  money: FiDollarSign,
  wallet: FiDollarSign,
  settings: FiSettings,
  trades: FiRefreshCw,

  // Panel/feature icons
  openOrders: FiClipboard,
  watchlist: FiStar,
  positions: FiPieChart,
};

// Default icon props for consistent styling
export const iconProps = {
  size: 18,
  style: { opacity: 0.85 } as const,
};

// Active state icon props
export const activeIconProps = {
  size: 18,
  style: { opacity: 1 } as const,
};
