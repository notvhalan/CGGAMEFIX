import { Orderbook, OrderbookOrder } from '../src/orderbook';

describe('Orderbook', () => {
  let orderbook: Orderbook;
  const marketId = 'test-market-123';

  beforeEach(() => {
    orderbook = new Orderbook(marketId);
  });

  describe('Full Fill Scenarios', () => {
    it('should fully match a BACK order with existing LAY order at same price', () => {
      // Add LAY order first (maker)
      const layOrder: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };
      
      const layMatches = orderbook.addOrder(layOrder);
      expect(layMatches).toHaveLength(0); // No matches yet
      
      // Add BACK order (taker)
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-2',
        side: 'BACK',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date('2024-01-01T10:00:01Z'),
      };
      
      const backMatches = orderbook.addOrder(backOrder);
      
      expect(backMatches).toHaveLength(1);
      expect(backMatches[0]).toMatchObject({
        makerOrder: expect.objectContaining({ id: 'lay-1' }),
        takerOrder: expect.objectContaining({ id: 'back-1' }),
        price: 2.0,
        size: 100,
      });
      
      // Both orders should be fully filled
      expect(backOrder.remainingSize).toBe(0);
      expect(layOrder.remainingSize).toBe(0);
      expect(orderbook.isEmpty()).toBe(true);
    });

    it('should fully match a LAY order with existing BACK order', () => {
      // Add BACK order first (maker)
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-1',
        side: 'BACK',
        price: 2.5,
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };
      
      orderbook.addOrder(backOrder);
      
      // Add LAY order (taker) at lower price - should match
      const layOrder: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-2',
        side: 'LAY',
        price: 2.3,
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:01Z'),
      };
      
      const matches = orderbook.addOrder(layOrder);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].price).toBe(2.5); // Maker price
      expect(matches[0].size).toBe(50);
      expect(orderbook.isEmpty()).toBe(true);
    });
  });

  describe('Partial Fill Scenarios', () => {
    it('should partially fill BACK order when LAY order is smaller', () => {
      // Add large LAY order
      const layOrder: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.0,
        remainingSize: 50,
        timestamp: new Date(),
      };
      
      orderbook.addOrder(layOrder);
      
      // Add larger BACK order
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-2',
        side: 'BACK',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date(),
      };
      
      const matches = orderbook.addOrder(backOrder);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].size).toBe(50);
      expect(backOrder.remainingSize).toBe(50); // 50 remaining
      expect(layOrder.remainingSize).toBe(0); // Fully filled
      expect(orderbook.size()).toBe(1); // BACK order still in book
    });

    it('should match multiple LAY orders with single large BACK order', () => {
      // Add multiple LAY orders
      const lay1: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.0,
        remainingSize: 30,
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };
      
      const lay2: OrderbookOrder = {
        id: 'lay-2',
        userId: 'user-2',
        side: 'LAY',
        price: 2.0,
        remainingSize: 40,
        timestamp: new Date('2024-01-01T10:00:01Z'),
      };
      
      orderbook.addOrder(lay1);
      orderbook.addOrder(lay2);
      
      // Add large BACK order that matches both
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-3',
        side: 'BACK',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date('2024-01-01T10:00:02Z'),
      };
      
      const matches = orderbook.addOrder(backOrder);
      
      expect(matches).toHaveLength(2);
      expect(matches[0].size).toBe(30); // First LAY order
      expect(matches[1].size).toBe(40); // Second LAY order
      expect(backOrder.remainingSize).toBe(30); // 30 remaining
      expect(orderbook.size()).toBe(1); // BACK order still in book
    });
  });

  describe('Price Crossing', () => {
    it('should match BACK order when price is higher than best LAY', () => {
      // Add LAY order at 2.0
      const layOrder: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date(),
      };
      
      orderbook.addOrder(layOrder);
      
      // Add BACK order at 2.5 - should match
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-2',
        side: 'BACK',
        price: 2.5,
        remainingSize: 100,
        timestamp: new Date(),
      };
      
      const matches = orderbook.addOrder(backOrder);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].price).toBe(2.0); // Maker (LAY) price
      expect(orderbook.isEmpty()).toBe(true);
    });

    it('should not match BACK order when price is lower than best LAY', () => {
      // Add LAY order at 2.5
      const layOrder: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.5,
        remainingSize: 100,
        timestamp: new Date(),
      };
      
      orderbook.addOrder(layOrder);
      
      // Add BACK order at 2.0 - should NOT match
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-2',
        side: 'BACK',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date(),
      };
      
      const matches = orderbook.addOrder(backOrder);
      
      expect(matches).toHaveLength(0);
      expect(orderbook.size()).toBe(2); // Both orders in book
    });
  });

  describe('Time Priority', () => {
    it('should match older LAY order first when prices are equal', () => {
      // Add LAY orders at same price
      const lay1: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.0,
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:00Z'), // Older
      };
      
      const lay2: OrderbookOrder = {
        id: 'lay-2',
        userId: 'user-2',
        side: 'LAY',
        price: 2.0,
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:01Z'), // Newer
      };
      
      orderbook.addOrder(lay1);
      orderbook.addOrder(lay2);
      
      // Add BACK order that matches first LAY
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-3',
        side: 'BACK',
        price: 2.0,
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:02Z'),
      };
      
      const matches = orderbook.addOrder(backOrder);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].makerOrder.id).toBe('lay-1'); // Older order matched first
      expect(orderbook.size()).toBe(1); // Only lay-2 remains
    });

    it('should match better priced LAY order before older higher priced order', () => {
      // Add LAY orders at different prices
      const lay1: OrderbookOrder = {
        id: 'lay-1',
        userId: 'user-1',
        side: 'LAY',
        price: 2.5, // Higher price
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:00Z'), // Older
      };
      
      const lay2: OrderbookOrder = {
        id: 'lay-2',
        userId: 'user-2',
        side: 'LAY',
        price: 2.0, // Better price
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:01Z'), // Newer
      };
      
      orderbook.addOrder(lay1);
      orderbook.addOrder(lay2);
      
      // Add BACK order
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-3',
        side: 'BACK',
        price: 2.5,
        remainingSize: 50,
        timestamp: new Date('2024-01-01T10:00:02Z'),
      };
      
      const matches = orderbook.addOrder(backOrder);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].makerOrder.id).toBe('lay-2'); // Better price matched first
      expect(matches[0].price).toBe(2.0);
    });
  });

  describe('Order Cancellation', () => {
    it('should successfully cancel an order', () => {
      const backOrder: OrderbookOrder = {
        id: 'back-1',
        userId: 'user-1',
        side: 'BACK',
        price: 2.0,
        remainingSize: 100,
        timestamp: new Date(),
      };
      
      orderbook.addOrder(backOrder);
      expect(orderbook.size()).toBe(1);
      
      const cancelled = orderbook.cancelOrder('back-1');
      
      expect(cancelled).toBe(true);
      expect(orderbook.isEmpty()).toBe(true);
    });

    it('should return false when cancelling non-existent order', () => {
      const cancelled = orderbook.cancelOrder('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('Orderbook Snapshot', () => {
    it('should return aggregated price levels', () => {
      // Add multiple orders at same price
      orderbook.addOrder({
        id: 'back-1',
        userId: 'user-1',
        side: 'BACK',
        price: 2.0,
        remainingSize: 50,
        timestamp: new Date(),
      });
      
      orderbook.addOrder({
        id: 'back-2',
        userId: 'user-2',
        side: 'BACK',
        price: 2.0,
        remainingSize: 30,
        timestamp: new Date(),
      });
      
      orderbook.addOrder({
        id: 'lay-1',
        userId: 'user-3',
        side: 'LAY',
        price: 2.5,
        remainingSize: 40,
        timestamp: new Date(),
      });
      
      const snapshot = orderbook.snapshotTopLevels(10);
      
      expect(snapshot.bids).toHaveLength(1);
      expect(snapshot.bids[0]).toMatchObject({ price: 2.0, size: 80 }); // 50 + 30
      expect(snapshot.asks).toHaveLength(1);
      expect(snapshot.asks[0]).toMatchObject({ price: 2.5, size: 40 });
    });
  });
});
