import { io, Socket } from 'socket.io-client';

const WS_URL = typeof window !== 'undefined' 
  ? (window.ENV?.WS_URL || 'ws://localhost:3000')
  : 'ws://localhost:3000';

export type WSMessage = 
  | { type: 'subscribe'; topic: string }
  | { type: 'unsubscribe'; topic: string };

export type WSEvent =
  | { type: 'book_update'; data: any }
  | { type: 'trade'; data: any }
  | { type: 'order_accepted'; data: any }
  | { type: 'order_matched'; data: any }
  | { type: 'order_cancelled'; data: any };

export class WSClient {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<(data: any) => void>>();

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connected', (data) => {
      console.log('[WS] Connected:', data);
    });

    this.socket.on('subscribed', (data) => {
      console.log('[WS] Subscribed:', data.topic);
    });

    this.socket.on('unsubscribed', (data) => {
      console.log('[WS] Unsubscribed:', data.topic);
    });

    this.socket.on('error', (data) => {
      console.error('[WS] Error:', data);
    });

    this.socket.on('book_update', (data) => {
      this.emit('book_update', data);
    });

    this.socket.on('trade', (data) => {
      this.emit('trade', data);
    });

    this.socket.on('order_accepted', (data) => {
      this.emit('order_accepted', data);
    });

    this.socket.on('order_matched', (data) => {
      this.emit('order_matched', data);
    });

    this.socket.on('order_cancelled', (data) => {
      this.emit('order_cancelled', data);
    });

    this.socket.on('disconnect', () => {
      console.log('[WS] Disconnected');
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('[WS] Reconnected after', attemptNumber, 'attempts');
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  subscribe(topic: string): void {
    if (!this.socket) {
      console.warn('[WS] Not connected, cannot subscribe to', topic);
      return;
    }
    this.socket.emit('message', { type: 'subscribe', topic });
  }

  unsubscribe(topic: string): void {
    if (!this.socket) return;
    this.socket.emit('message', { type: 'unsubscribe', topic });
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
    return this.socket?.connected ?? false;
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
