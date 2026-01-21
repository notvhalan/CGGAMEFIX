# Web Frontend Documentation

## Overview

The web frontend is built with **Remix 2.5** using React 18 and Vite. It provides a betting exchange interface with real-time order book updates via WebSockets.

---

## Information Architecture & Page Linking Map

```
PUBLIC ROUTES → AUTHENTICATED ROUTES → SETTINGS HUB
/               /app (Dashboard)      /app/settings (5 tabs)
/auth/login     /app/wallet           
/how-it-works   /app/orders           
/fees           /app/positions        
/legal          /app/trades           
                /markets              
```

See full navigation structure at end of document.

---

## Architecture

### Tech Stack
- **Framework**: Remix (full-stack React framework)
- **Build Tool**: Vite
- **WebSocket**: Socket.IO client
- **Styling**: Inline CSS (can be migrated to Tailwind/styled-components)
- **Type Safety**: TypeScript + shared-types package

### Key Directories

```
apps/web/
├── app/
│   ├── components/          # Reusable React components
│   │   ├── OrderBook.tsx
│   │   ├── OrderTicket.tsx
│   │   ├── TradesTape.tsx
│   │   ├── PriceChart.tsx
│   │   └── WalletPanel.tsx
│   ├── lib/                 # Utilities and clients
│   │   ├── api.server.ts    # Server-side API client
│   │   ├── ws.client.ts     # WebSocket client (browser)
│   │   └── format.ts        # Formatting helpers
│   ├── routes/              # File-based routing
│   │   ├── _index.tsx       # Landing page
│   │   ├── markets._index.tsx
│   │   ├── markets.$marketId.tsx
│   │   ├── auth.login.tsx
│   │   ├── auth.signup.tsx
│   │   ├── app._layout.tsx
│   │   ├── app._index.tsx   # Dashboard
│   │   ├── app.wallet.tsx
│   │   ├── app.orders.tsx
│   │   └── ...
│   ├── root.tsx             # HTML shell
│   ├── entry.client.tsx     # Browser entry
│   └── entry.server.tsx     # Server entry
├── public/                  # Static assets
├── vite.config.ts
└── package.json
```

## Core Patterns

### 1. Remix Loaders (Server-Side Data Fetching)

Loaders run on the server and fetch data before rendering:

```typescript
// app/routes/markets.$marketId.tsx
export async function loader({ params }: LoaderFunctionArgs) {
  const market = await getMarket(params.marketId!);
  const orderBook = await getMarketOrderBook(params.marketId!);
  const trades = await getMarketTrades(params.marketId!);
  const wallet = await getWallet(); // Optional: check user session
  
  return json({ market, orderBook, trades, wallet });
}
```

**When the page loads:**
1. Remix calls the loader function on the server
2. Data is fetched from the API Gateway
3. Server renders HTML with the data
4. Browser receives pre-rendered page (SSR)
5. React hydrates and becomes interactive

### 2. Remix Actions (Server-Side Mutations)

Actions handle form submissions:

```typescript
// app/routes/markets.$marketId.tsx
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const side = formData.get('side') as string;
  const odds = parseFloat(formData.get('odds') as string);
  const stake = parseFloat(formData.get('stake') as string);

  const result = await createOrder({
    marketId: params.marketId!,
    side: side as 'BACK' | 'LAY',
    odds,
    stake,
  });

  return json({ success: true, orderId: result.orderId });
}
```

**When a form is submitted:**
1. Remix intercepts the POST request
2. Calls the action function on the server
3. Action processes the mutation (creates order)
4. Returns response (JSON or redirect)
5. Loader re-runs automatically to fetch fresh data
6. UI updates with new state

### 3. WebSocket Real-Time Updates

WebSocket client handles live data streams:

```typescript
// app/lib/ws.client.ts
class WSClient {
  private socket: Socket | null = null;
  
  connect() {
    if (!this.socket) {
      this.socket = io(WS_URL, { path: '/ws' });
    }
  }
  
  subscribe(topic: string) {
    this.socket?.emit('subscribe', topic);
  }
  
  on(event: string, handler: (data: any) => void) {
    this.socket?.on(event, handler);
  }
}
```

**Component usage:**

```typescript
// app/components/OrderBook.tsx
export function OrderBook({ orderBook: initialOrderBook, marketId }) {
  const [orderBook, setOrderBook] = useState(initialOrderBook);

  useEffect(() => {
    const ws = getWSClient();
    ws.connect();
    ws.subscribe(`book:${marketId}`);

    const handler = (data) => {
      setOrderBook(data);  // Update state on WebSocket message
    };

    ws.on('book_update', handler);

    return () => {
      ws.off('book_update', handler);
      ws.unsubscribe(`book:${marketId}`);
    };
  }, [marketId]);

  // Render orderBook state...
}
```

**Real-time flow:**
1. Component mounts with initial data from loader
2. `useEffect` connects WebSocket and subscribes to topic
3. Backend publishes updates to `book_update` event
4. Handler receives data and updates React state
5. Component re-renders with new data
6. Cleanup on unmount (unsubscribe + disconnect)

## Data Flow Summary

### Initial Page Load (SSR)
```
Browser Request
  → Remix Loader (server)
    → API Gateway (REST)
      → Return JSON
  → Server Render HTML
  → Send to Browser
  → Hydrate React
```

### Form Submission
```
User submits <Form>
  → Remix Action (server)
    → API Gateway POST /v1/orders
      → NATS publish to matching-engine
      → Return { orderId }
  → Loader re-runs automatically
  → Fresh data fetched
  → UI updates
```

### Real-Time Updates
```
Backend Event (trade matched)
  → NATS publish
    → API Gateway EventsGateway
      → Socket.IO emit('trade', data)
        → Browser WebSocket handler
          → setState(data)
            → Component re-renders
```

## API Client (`api.server.ts`)

Server-only module for API Gateway communication:

```typescript
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export async function getMarkets() {
  const res = await fetch(`${API_BASE_URL}/v1/markets`);
  return res.json();
}

export async function createOrder(data: CreateOrderDto) {
  const res = await fetch(`${API_BASE_URL}/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

**Important:** This module ONLY runs on the server (in loaders/actions), never in the browser.

## WebSocket Client (`ws.client.ts`)

Browser-only singleton for Socket.IO:

```typescript
let wsClient: WSClient | null = null;

export function getWSClient(): WSClient {
  if (!wsClient) {
    wsClient = new WSClient();
  }
  return wsClient;
}
```

**Topics:**
- `book:<marketId>` - Order book updates
- `trades:<marketId>` - Recent trades
- `orders:<userId>` - User order updates

## Components

### OrderBook
- Displays bids (BACK) and asks (LAY) side-by-side
- Real-time updates via `book_update` event
- Shows top 10 levels with odds and size

### OrderTicket
- Form for placing BACK/LAY orders
- Calculates potential return/liability
- Validates against wallet balance
- Submits to action handler

### TradesTape
- Scrolling list of recent trades
- Real-time updates via `trade` event
- Shows last 50 trades with relative timestamps

### PriceChart
- Placeholder component for price visualization
- Can be replaced with Recharts, Chart.js, or similar

### WalletPanel
- Displays available and locked balance
- Formatted with currency symbol

## Routes

### Public Routes
- `/` - Landing page with hero and features
- `/markets` - Markets listing
- `/markets/:marketId` - Market detail with trading interface
- `/how-it-works` - Educational content
- `/fees` - Fee structure

### Auth Routes
- `/auth/login` - Login form (not yet implemented)
- `/auth/signup` - Signup form (not yet implemented)

### Protected Routes (under `/app` layout)
- `/app` - Dashboard with balance and activity
- `/app/wallet` - Deposit/withdraw
- `/app/orders` - Order history
- `/app/positions` - Open positions
- `/app/trades` - Trade history
- `/app/settings` - User preferences

## Environment Variables

Create `.env` file in `apps/web/`:

```bash
# API Gateway URL
API_BASE_URL=http://localhost:3000

# WebSocket URL (same as API Gateway)
WS_URL=http://localhost:3000
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
cd apps/web
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start
```

## Docker

```bash
# Build image
docker build -t betting-web -f apps/web/Dockerfile .

# Run container
docker run -p 3001:3001 \
  -e API_BASE_URL=http://api-gateway:3000 \
  -e WS_URL=http://api-gateway:3000 \
  betting-web
```

## Next Steps

1. **Authentication**: Implement JWT/session-based auth in login/signup routes
2. **Protected Routes**: Add middleware to check auth before loading app/* routes
3. **Error Handling**: Add error boundaries and toast notifications
4. **Styling**: Migrate inline styles to Tailwind CSS or CSS modules
5. **Testing**: Add Vitest unit tests and Playwright E2E tests
6. **Charts**: Implement price chart with real historical data
7. **Responsive Design**: Add mobile breakpoints and touch interactions
8. **Accessibility**: Add ARIA labels and keyboard navigation
9. **Performance**: Add React.lazy for code splitting
10. **PWA**: Add service worker for offline support

## API Gateway Integration

The frontend communicates with the API Gateway running at `localhost:3000`:

- **REST API**: `/v1/markets`, `/v1/orders`, `/v1/wallet`
- **WebSocket**: `/ws` path with Socket.IO protocol
- **CORS**: API Gateway should allow `http://localhost:3001` origin

## Shared Types

The frontend uses types from `packages/shared-types`:

```typescript
import type { Market, Order, Trade } from '@repo/shared-types';
```

This ensures type consistency between frontend and backend.

## Troubleshooting

### WebSocket not connecting
- Check API Gateway is running on port 3000
- Verify `WS_URL` environment variable
- Check browser console for Socket.IO errors

### API requests failing
- Verify `API_BASE_URL` is correct
- Check CORS settings in API Gateway
- Inspect network tab for error responses

### Build errors
- Run `pnpm install` to ensure dependencies are installed
- Check TypeScript errors with `pnpm run typecheck`
- Verify shared-types package is built

## Performance Considerations

- **SSR**: Initial page load is server-rendered for fast FCP
- **Code Splitting**: Remix automatically splits routes
- **WebSocket**: Single persistent connection for all subscriptions
- **Optimistic UI**: Can add optimistic updates for better UX
- **Caching**: Add HTTP caching headers for static assets
