// Native WebSocket client for Rust exchange
const getWSUrl = () => {
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws';
  
  // Check for environment variable first
  if (window.ENV?.RUST_WS_URL) return window.ENV.RUST_WS_URL;
  
  // Auto-detect for production
  if (window.location.hostname === 'gamefix.fun' || window.location.hostname === 'www.gamefix.fun') {
    return 'wss://ws.gamefix.fun/ws';
  }
  
  // Default to localhost
  return 'ws://localhost:3001/ws';
};

export type RustWSMessage = 
  | { type: 'Subscribe'; market_id: string }
  | { type: 'Unsubscribe'; market_id: string }
  | { type: 'Ping' }
  | { type: 'Pong' };

export type RustWSEvent =
  | { 
      type: 'Trade'; 
      trade_id: string;
      market_id: string;
      maker_order_id: string;
      taker_order_id: string;
      maker_user_id: string;
      taker_user_id: string;
      price_yes_pts: number;
      qty_micros: number;
      notional_pence: number;
      taker_side: string;
      maker_fee_pence: number;
      taker_fee_pence: number;
    }
  | { type: 'OrderbookSnapshot'; market_id: string; bids: any[]; asks: any[] }
  | { type: 'OrderbookDelta'; market_id: string; changes: any[] }
  | { type: 'Pong' };

export class WSClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: any) => void>>();
  private subscribedMarkets = new Set<string>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Rust WS] ℹ️ Already connected');
      return;
    }
    
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[Rust WS] ℹ️ Connection already in progress');
      return;
    }

    try {
      const wsUrl = getWSUrl();
      console.log('[Rust WS] 🔌 Creating new WebSocket connection to', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Rust WS] ✅ Connected to', wsUrl, 'ReadyState:', this.ws?.readyState);
        this.reconnectAttempts = 0;
        this.emit('connected', { url: wsUrl });
        
        // Use requestAnimationFrame to ensure WebSocket is fully open
        requestAnimationFrame(() => {
          // Resubscribe to all markets
          this.subscribedMarkets.forEach(marketId => {
            console.log('[Rust WS] 📡 Resubscribing to market:', marketId);
            const message = { type: 'subscribe', market_id: marketId };
            const payload = JSON.stringify(message);
            console.log('[Rust WS] 📤 Attempting to send from onopen:', payload, 'ReadyState:', this.ws?.readyState);
            
            try {
              if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(payload);
                console.log('[Rust WS] ✅ Message sent successfully');
              } else {
                console.error('[Rust WS] ❌ WebSocket not ready in onopen callback, state:', this.ws?.readyState);
              }
            } catch (error) {
              console.error('[Rust WS] ❌ Error sending message:', error);
            }
          });

          // Start ping/pong heartbeat
          this.startPingInterval();
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as RustWSEvent;
          console.log('[Rust WS] 📨 Message received:', message.type, message);

          if (message.type === 'trade') {
            // Convert Rust format to frontend format
            const trade = {
              id: message.trade_id,
              market_id: message.market_id,
              maker_order_id: message.maker_order_id,
              taker_order_id: message.taker_order_id,
              maker_id: message.maker_user_id,
              taker_id: message.taker_user_id,
              yes_pts: message.price_yes_pts,
              qty_micros: message.qty_micros,
              cost_pence: message.notional_pence,
              side: message.taker_side === 'BuyYes' ? 'BUY_YES' : 'SELL_YES',
              maker_fee_pence: message.maker_fee_pence,
              taker_fee_pence: message.taker_fee_pence,
              executed_at: new Date().toISOString(),
            };
            this.emit('trade', trade);
          } else if (message.type === 'orderbook_snapshot' || message.type === 'orderbook_delta') {
            console.log('[Rust WS] 📖 Orderbook update:', message.type, 'bids:', message.bids?.length, 'asks:', message.asks?.length);
            // Convert Rust orderbook format to frontend format
            const orderBook = {
              bids: message.bids?.map((bid: any) => ({
                pPts: bid.price_yes_pts,
                yesPts: bid.price_yes_pts,
                contractsMicros: bid.qty_micros, // Keep as micros for component
                contracts: bid.qty_micros / 1000000,
                orders: bid.num_orders || 1
              })) || [],
              asks: message.asks?.map((ask: any) => ({
                pPts: ask.price_yes_pts,
                yesPts: ask.price_yes_pts,
                contractsMicros: ask.qty_micros, // Keep as micros for component
                contracts: ask.qty_micros / 1000000,
                orders: ask.num_orders || 1
              })) || []
            };
            console.log('[Rust WS] 📊 Emitting book_update with', orderBook.bids.length, 'bids,', orderBook.asks.length, 'asks');
            this.emit('book_update', orderBook);
          } else if (message.type === 'pong') {
            // Heartbeat response
          } else {
            console.log('[Rust WS] ⚠️ Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('[Rust WS] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Rust WS] ❌ WebSocket Error:', error);
        console.error('[Rust WS] ❌ ReadyState:', this.ws?.readyState);
        console.error('[Rust WS] ❌ URL:', this.ws?.url);
      };

      this.ws.onclose = () => {
        console.log('[Rust WS] Disconnected');
        this.stopPingInterval();
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('[Rust WS] Connection failed:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Rust WS] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    console.log(`[Rust WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'Ping' });
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendMessage(message: RustWSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Convert to lowercase for Rust serde
      const payload = JSON.stringify({
        type: message.type.toLowerCase(),
        ...('market_id' in message && { market_id: message.market_id })
      });
      console.log('[Rust WS] 📤 Sending:', payload);
      this.ws.send(payload);
    } else {
      console.warn('[Rust WS] ⚠️ Cannot send message, WebSocket not open. State:', this.ws?.readyState);
    }
  }

  disconnect(): void {
    this.stopPingInterval();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedMarkets.clear();
    this.listeners.clear();
  }

  subscribe(topic: string): void {
    // Parse topic format: "book:marketId" or "trades:marketId"
    const marketId = topic.split(':')[1];
    if (!marketId) {
      console.warn('[Rust WS] ⚠️ Invalid topic format:', topic);
      return;
    }

    console.log('[Rust WS] 📡 Subscribe request for topic:', topic, '→ market:', marketId);
    
    if (!this.subscribedMarkets.has(marketId)) {
      this.subscribedMarkets.add(marketId);
      console.log('[Rust WS] ✉️ Sending Subscribe message to Rust for market:', marketId);
      this.sendMessage({ type: 'Subscribe', market_id: marketId });
    } else {
      console.log('[Rust WS] ℹ️ Already subscribed to market:', marketId);
    }
  }

  unsubscribe(topic: string): void {
    const marketId = topic.split(':')[1];
    if (!marketId) return;

    if (this.subscribedMarkets.has(marketId)) {
      this.subscribedMarkets.delete(marketId);
      console.log('[Rust WS] Unsubscribing from market:', marketId);
      this.sendMessage({ type: 'Unsubscribe', market_id: marketId });
    }
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (data: any) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsClientInstance: WSClient | null = null;

export function getWSClient(): WSClient {
  if (typeof window === 'undefined') {
    throw new Error('WSClient can only be used in the browser');
  }
  
  if (!wsClientInstance) {
    wsClientInstance = new WSClient();
  }
  
  return wsClientInstance;
}

// Export singleton for convenience
export const wsClient = typeof window !== 'undefined' ? getWSClient() : null as any;
