import { Logger } from '@betting-exchange/shared-config';
import { OrderSide } from '@betting-exchange/shared-types';

interface Order {
  orderId: string;
  userId: string;
  side: string;
  price: number;
  size: number;
  remainingSize?: number;
  timestamp: Date;
}

interface PriceLevel {
  price: number;
  orders: Order[];
}

/**
 * In-memory orderbook with price-time priority matching
 * Single-threaded, single-writer per market
 */
export class Orderbook {
  private backs: Map<number, PriceLevel> = new Map(); // Sorted descending
  private lays: Map<number, PriceLevel> = new Map();  // Sorted ascending
  private orders: Map<string, Order> = new Map();
  
  constructor(
    private marketId: string,
    private logger: Logger
  ) {}
  
  /**
   * Add order and attempt matching
   * Returns array of executed trades
   */
  addOrder(order: Order): any[] {
    const matches: any[] = [];
    order.remainingSize = order.size;
    
    // Attempt matching against opposite side
    if (order.side === OrderSide.BACK) {
      // Match BACK order against LAY orders
      matches.push(...this.matchOrder(order, this.lays, 'ascending'));
    } else {
      // Match LAY order against BACK orders
      matches.push(...this.matchOrder(order, this.backs, 'descending'));
    }
    
    // If order has remaining size, add to orderbook
    if (order.remainingSize > 0) {
      this.addToBook(order);
    }
    
    return matches;
  }
  
  /**
   * Cancel an order
   */
  cancelOrder(orderId: string): Order | null {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }
    
    // Remove from orderbook
    const side = order.side === OrderSide.BACK ? this.backs : this.lays;
    const level = side.get(order.price);
    
    if (level) {
      level.orders = level.orders.filter((o) => o.orderId !== orderId);
      if (level.orders.length === 0) {
        side.delete(order.price);
      }
    }
    
    this.orders.delete(orderId);
    return order;
  }
  
  private matchOrder(order: Order, oppositeSide: Map<number, PriceLevel>, sortOrder: 'ascending' | 'descending'): any[] {
    const matches: any[] = [];
    
    // Sort price levels
    const sortedPrices = Array.from(oppositeSide.keys()).sort((a, b) => 
      sortOrder === 'ascending' ? a - b : b - a
    );
    
    for (const price of sortedPrices) {
      // Check if price crosses
      const crosses = order.side === OrderSide.BACK 
        ? order.price >= price  // BACK willing to pay >= LAY asking
        : order.price <= price; // LAY willing to offer <= BACK bidding
      
      if (!crosses) {
        break; // No more matches possible
      }
      
      const level = oppositeSide.get(price);
      if (!level || level.orders.length === 0) {
        continue;
      }
      
      // Match against orders at this price level (FIFO)
      for (const makerOrder of [...level.orders]) {
        if (order.remainingSize === 0) {
          break;
        }
        
        const matchSize = Math.min(order.remainingSize, makerOrder.remainingSize!);
        
        // Create trade
        matches.push({
          makerOrderId: makerOrder.orderId,
          takerOrderId: order.orderId,
          makerId: makerOrder.userId,
          takerId: order.userId,
          price,
          size: matchSize,
          side: order.side,
        });
        
        // Update sizes
        order.remainingSize -= matchSize;
        makerOrder.remainingSize! -= matchSize;
        
        // Remove maker order if fully matched
        if (makerOrder.remainingSize === 0) {
          level.orders = level.orders.filter((o) => o.orderId !== makerOrder.orderId);
          this.orders.delete(makerOrder.orderId);
        }
      }
      
      // Clean up empty price level
      if (level.orders.length === 0) {
        oppositeSide.delete(price);
      }
    }
    
    return matches;
  }
  
  private addToBook(order: Order) {
    const side = order.side === OrderSide.BACK ? this.backs : this.lays;
    
    let level = side.get(order.price);
    if (!level) {
      level = { price: order.price, orders: [] };
      side.set(order.price, level);
    }
    
    level.orders.push(order);
    this.orders.set(order.orderId, order);
  }
  
  /**
   * Get orderbook snapshot
   */
  getSnapshot() {
    const backs = Array.from(this.backs.values())
      .map((level) => ({
        price: level.price,
        size: level.orders.reduce((sum, o) => sum + o.remainingSize!, 0),
      }))
      .sort((a, b) => b.price - a.price);
    
    const lays = Array.from(this.lays.values())
      .map((level) => ({
        price: level.price,
        size: level.orders.reduce((sum, o) => sum + o.remainingSize!, 0),
      }))
      .sort((a, b) => a.price - b.price);
    
    return { marketId: this.marketId, backs, lays, timestamp: new Date() };
  }
}
