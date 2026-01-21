# API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All API requests (except health check) require JWT authentication.

**Header:**
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Health Check

#### GET /health
Check API Gateway health status.

**Response:**
```json
{
  "status": "ok",
  "service": "api-gateway"
}
```

---

### Orders

#### POST /api/orders
Submit a new order to the orderbook.

**Request Body:**
```json
{
  "marketId": "uuid",
  "side": "BACK" | "LAY",
  "type": "LIMIT" | "MARKET",
  "price": 2.5,
  "stake": 100.00
}
```

**Response (202 Accepted):**
```json
{
  "orderId": "uuid",
  "status": "PENDING",
  "message": "Order submitted for processing"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Missing or invalid JWT
- `500 Internal Server Error` - Processing failed

---

#### DELETE /api/orders/:id
Cancel an existing order.

**Request Body:**
```json
{
  "marketId": "uuid"
}
```

**Response (202 Accepted):**
```json
{
  "orderId": "uuid",
  "message": "Order cancellation submitted"
}
```

---

### Markets

#### GET /api/markets
List all active markets.

**Response:**
```json
{
  "markets": [
    {
      "id": "uuid",
      "name": "Match Winner",
      "type": "MATCH_ODDS",
      "status": "ACTIVE",
      "totalVolume": 50000.00,
      "bestBackPrice": 2.50,
      "bestLayPrice": 2.55
    }
  ]
}
```

---

#### GET /api/markets/:id
Get market details.

**Response:**
```json
{
  "id": "uuid",
  "name": "Match Winner",
  "description": "Win market for the match",
  "type": "MATCH_ODDS",
  "status": "ACTIVE",
  "outcomes": ["Team A", "Team B", "Draw"],
  "startTime": "2026-01-21T15:00:00Z",
  "minStake": 10.00,
  "maxStake": 10000.00
}
```

---

#### GET /api/markets/:id/book
Get current orderbook snapshot.

**Response:**
```json
{
  "marketId": "uuid",
  "backs": [
    { "price": 2.50, "totalSize": 1000.00, "orderCount": 5 },
    { "price": 2.45, "totalSize": 500.00, "orderCount": 3 }
  ],
  "lays": [
    { "price": 2.55, "totalSize": 800.00, "orderCount": 4 },
    { "price": 2.60, "totalSize": 1200.00, "orderCount": 6 }
  ],
  "timestamp": "2026-01-20T10:30:00Z"
}
```

---

## WebSocket API

### Connection
```
ws://localhost:3001
```

### Messages

#### Connect
Client receives on connection:
```json
{
  "type": "connected",
  "clientId": "ws-123456",
  "timestamp": "2026-01-20T10:30:00Z"
}
```

#### Subscribe to Market
Client sends:
```json
{
  "type": "subscribe",
  "marketId": "uuid"
}
```

Server responds:
```json
{
  "type": "subscribed",
  "marketId": "uuid",
  "timestamp": "2026-01-20T10:30:00Z"
}
```

#### Unsubscribe from Market
Client sends:
```json
{
  "type": "unsubscribe",
  "marketId": "uuid"
}
```

#### Book Delta Update
Server pushes (real-time):
```json
{
  "type": "book_delta",
  "data": {
    "marketId": "uuid",
    "side": "BACK",
    "price": 2.50,
    "sizeDelta": 100.00,
    "timestamp": "2026-01-20T10:30:01Z"
  }
}
```

#### Trade Executed
Server pushes (real-time):
```json
{
  "type": "trade",
  "data": {
    "marketId": "uuid",
    "tradeId": "uuid",
    "price": 2.50,
    "size": 100.00,
    "side": "BACK",
    "timestamp": "2026-01-20T10:30:02Z"
  }
}
```

#### Ping/Pong
Client sends:
```json
{
  "type": "ping"
}
```

Server responds:
```json
{
  "type": "pong",
  "timestamp": "2026-01-20T10:30:03Z"
}
```

---

## Rate Limiting

- **Orders**: 10 requests per second per user
- **Markets**: 100 requests per second per user
- **WebSocket**: Max 50 concurrent connections per user

---

## Error Codes

| Code | Description |
|------|-------------|
| 400  | Bad Request - Invalid input |
| 401  | Unauthorized - Invalid or missing JWT |
| 403  | Forbidden - Insufficient permissions |
| 404  | Not Found - Resource doesn't exist |
| 429  | Too Many Requests - Rate limit exceeded |
| 500  | Internal Server Error |
| 503  | Service Unavailable |

---

## Example Usage

### cURL

```bash
# Submit order
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "uuid",
    "side": "BACK",
    "type": "LIMIT",
    "price": 2.5,
    "stake": 100
  }'

# Get orderbook
curl http://localhost:3000/api/markets/uuid/book
```

### JavaScript

```javascript
// WebSocket connection
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // Subscribe to market
  ws.send(JSON.stringify({
    type: 'subscribe',
    marketId: 'uuid'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```
