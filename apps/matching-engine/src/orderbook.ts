import { Logger } from '@betting-exchange/shared-config';
import { OrderSide, PRICE_SCALE, contractsCost } from '@betting-exchange/shared-types';

const logger = new Logger('Orderbook');

export interface OrderbookOrder {
  id: string;
  userId: string;
  side: OrderSide; // FOR or LAY
  pPts: number; // Original probability points (1 to PRICE_SCALE-1)
  yesPts: number; // Canonical YES price in probability points
  remainingContractsMicros: bigint; // Remaining contracts in microcontracts
  timestamp: Date;
}

export interface Match {
  makerOrder: OrderbookOrder;
  takerOrder: OrderbookOrder;
  yesPricePts: number; // Canonical YES price
  contractsMicros: bigint; // Matched contracts in microcontracts
  costPence: number; // Cash exchanged
}

/**
 * Canonicalization helper: converts FOR/LAY orders into canonical YES-price space
 * 
 * FOR side: Buying YES at pPts => yesPts = pPts
 * LAY side: Buying NO (selling YES) => yesPts = PRICE_SCALE - pPts
 * 
 * This allows us to maintain a single book where:
 * - Bids = higher yesPts (better for buyers)
 * - Asks = lower yesPts (better for sellers)
 */
export function canonicalizePrice(side: OrderSide, pPts: number): number {
  if (side === OrderSide.FOR) {
    return pPts;
  } else { // OrderSide.LAY
    return PRICE_SCALE - pPts;
  }
}

/**
 * In-memory orderbook for a single market using probability point pricing.
 * 
 * All orders are converted to canonical YES-price space:
 * - FOR orders: yesPts = pPts (buying YES)
 * - LAY orders: yesPts = PRICE_SCALE - pPts (selling YES, buying NO)
 * 
 * Matching rules (after canonicalization):
 * - Bids (higher yesPts) match with asks (lower yesPts)
 * - Match occurs when bid.yesPts >= ask.yesPts
 * 
 * Priority: Price-Time
 * - Bids sorted by highest yesPts first, then oldest timestamp
 * - Asks sorted by lowest yesPts first, then oldest timestamp
 * 
 * All math uses integers (pence for stakes, probability points for prices).
 */
export class Orderbook {
  private bids: OrderbookOrder[] = []; // Higher yesPts (buying YES at better prices)
  private asks: OrderbookOrder[] = []; // Lower yesPts (selling YES at better prices)
  private orderMap: Map<string, OrderbookOrder> = new Map();

  constructor(_marketId: string) {
    logger.debug(`Created orderbook for market ${_marketId}`);
  }

  /**
   * Add an order to the orderbook and attempt to match it.
   * Returns array of matches (trades).
   * 
   * Algorithm:
   * 1. Convert order to canonical YES-price (yesPts)
   * 2. Determine if it's a bid (higher yesPts) or ask (lower yesPts)
   * 3. Try to match with opposite side
   * 4. Add remainder to appropriate side
   */
  addOrder(order: OrderbookOrder): Match[] {
    const matches: Match[] = [];
    
    logger.debug(`Adding order ${order.id}: ${order.side} pPts=${order.pPts} yesPts=${order.yesPts} remaining=${order.remainingContractsMicros} contracts`);
    logger.debug(`Book state before: ${this.bids.length} bids, ${this.asks.length} asks`);
    
    // Determine if this is a bid or ask based on side
    const isBid = this.isBid(order);
    
    if (isBid) {
      // This order is a BID (FOR): try to match with asks (LAY)
      while (order.remainingContractsMicros > 0n && this.asks.length > 0) {
        const bestAsk = this.asks[0];
        
        logger.debug(`Checking BID yesPts=${order.yesPts} >= ASK yesPts=${bestAsk.yesPts}: ${order.yesPts >= bestAsk.yesPts}`);
        
        // Match when bid.yesPts >= ask.yesPts
        if (order.yesPts >= bestAsk.yesPts) {
          // Match size in contracts (smaller of the two)
          const matchContractsMicros = order.remainingContractsMicros < bestAsk.remainingContractsMicros
            ? order.remainingContractsMicros
            : bestAsk.remainingContractsMicros;
          
          // Execution price is maker's price (ask price)
          const executionYesPts = bestAsk.yesPts;
          
          // Calculate cash exchanged
          const costPence = contractsCost(matchContractsMicros, executionYesPts);
          
          matches.push({
            makerOrder: bestAsk,
            takerOrder: order,
            yesPricePts: executionYesPts,
            contractsMicros: matchContractsMicros,
            costPence,
          });
          
          logger.debug(`MATCH: ${matchContractsMicros} contracts @ yesPts=${executionYesPts}, cost=${costPence}p`);
          
          // Update remaining contracts
          order.remainingContractsMicros -= matchContractsMicros;
          bestAsk.remainingContractsMicros -= matchContractsMicros;
          
          // Remove maker if fully filled
          if (bestAsk.remainingContractsMicros === 0n) {
            this.asks.shift();
            this.orderMap.delete(bestAsk.id);
          }
        } else {
          break; // No more matches possible
        }
      }
      
      // Add remaining to bids if any
      if (order.remainingContractsMicros > 0n) {
        this.bids.push(order);
        this.orderMap.set(order.id, order);
        this.sortBids();
      }
    } else {
      // This order is an ASK (LAY): try to match with bids (FOR)
      while (order.remainingContractsMicros > 0n && this.bids.length > 0) {
        const bestBid = this.bids[0];
        
        logger.debug(`Checking ASK yesPts=${order.yesPts} with BID yesPts=${bestBid.yesPts}: ${bestBid.yesPts >= order.yesPts}`);
        
        // Match when bid.yesPts >= ask.yesPts
        if (bestBid.yesPts >= order.yesPts) {
          // Match size in contracts (smaller of the two)
          const matchContractsMicros = order.remainingContractsMicros < bestBid.remainingContractsMicros
            ? order.remainingContractsMicros
            : bestBid.remainingContractsMicros;
          
          // Execution price is maker's price (bid price)
          const executionYesPts = bestBid.yesPts;
          
          // Calculate cash exchanged
          const costPence = contractsCost(matchContractsMicros, executionYesPts);
          
          matches.push({
            makerOrder: bestBid,
            takerOrder: order,
            yesPricePts: executionYesPts,
            contractsMicros: matchContractsMicros,
            costPence,
          });
          
          logger.debug(`MATCH: ${matchContractsMicros} contracts @ yesPts=${executionYesPts}, cost=${costPence}p`);
          
          // Update remaining contracts
          order.remainingContractsMicros -= matchContractsMicros;
          bestBid.remainingContractsMicros -= matchContractsMicros;
          
          // Remove maker if fully filled
          if (bestBid.remainingContractsMicros === 0n) {
            this.bids.shift();
            this.orderMap.delete(bestBid.id);
          }
        } else {
          break; // No more matches possible
        }
      }
      
      // Add remaining to asks if any
      if (order.remainingContractsMicros > 0n) {
        this.asks.push(order);
        this.orderMap.set(order.id, order);
        this.sortAsks();
      }
    }
    
    logger.debug(`Order ${order.id} processed: ${matches.length} matches, remaining: ${order.remainingContractsMicros} contracts`);
    logger.debug(`Book state after: ${this.bids.length} bids, ${this.asks.length} asks`);
    return matches;
  }

  /**
   * Determine if an order is a bid (buying YES) or ask (selling YES).
   * 
   * Correct rule based on user intent:
   * - FOR side: User wants to buy YES → BID
   * - LAY side: User wants to sell YES (buy NO) → ASK
   * 
   * This is based on the original side, NOT the canonicalized yesPts.
   */
  private isBid(order: OrderbookOrder): boolean {
    // FOR orders are always bids (buying YES)
    // LAY orders are always asks (selling YES)
    return order.side === OrderSide.FOR;
  }

  /**
   * Cancel an order by removing it from the orderbook.
   * Returns true if order was found and removed.
   */
  cancelOrder(orderId: string): boolean {
    const order = this.orderMap.get(orderId);
    if (!order) {
      return false;
    }
    
    // Remove from appropriate side based on bid/ask classification
    const isBidOrder = this.isBid(order);
    if (isBidOrder) {
      this.bids = this.bids.filter(o => o.id !== orderId);
    } else {
      this.asks = this.asks.filter(o => o.id !== orderId);
    }
    
    this.orderMap.delete(orderId);
    logger.debug(`Order ${orderId} cancelled from orderbook`);
    return true;
  }

  /**
   * Get top levels of the orderbook for snapshot.
   * Returns aggregated levels by yesPts.
   */
  snapshotTopLevels(depth: number = 20): {
    bids: Array<{ yesPts: number; contractsMicros: bigint }>;
    asks: Array<{ yesPts: number; contractsMicros: bigint }>;
  } {
    const aggregateLevels = (orders: OrderbookOrder[]) => {
      const levels = new Map<number, bigint>();
      for (const order of orders) {
        levels.set(order.yesPts, (levels.get(order.yesPts) || 0n) + order.remainingContractsMicros);
      }
      return Array.from(levels.entries())
        .map(([yesPts, contractsMicros]) => ({ yesPts, contractsMicros }))
        .slice(0, depth);
    };
    
    return {
      bids: aggregateLevels(this.bids),
      asks: aggregateLevels(this.asks),
    };
  }

  /**
   * Check if orderbook is empty.
   */
  isEmpty(): boolean {
    return this.bids.length === 0 && this.asks.length === 0;
  }

  /**
   * Get number of orders in the book.
   */
  size(): number {
    return this.bids.length + this.asks.length;
  }

  private sortBids(): void {
    // Sort by yesPts DESC (highest first), then by timestamp ASC (oldest first)
    this.bids.sort((a, b) => {
      if (a.yesPts !== b.yesPts) {
        return b.yesPts - a.yesPts; // Higher yesPts first
      }
      return a.timestamp.getTime() - b.timestamp.getTime(); // Older first
    });
  }

  private sortAsks(): void {
    // Sort by yesPts ASC (lowest first), then by timestamp ASC (oldest first)
    this.asks.sort((a, b) => {
      if (a.yesPts !== b.yesPts) {
        return a.yesPts - b.yesPts; // Lower yesPts first
      }
      return a.timestamp.getTime() - b.timestamp.getTime(); // Older first
    });
  }
}
