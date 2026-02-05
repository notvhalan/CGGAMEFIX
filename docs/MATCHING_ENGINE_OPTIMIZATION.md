# Matching Engine Optimization Roadmap

## Current Performance: ~5-10 orders/second
**Target: 500+ orders/second (Phase 1)**

---

## Phase 1: Quick Wins (2 weeks)

### 1. Batch Database Writes
**Impact: 50x improvement**

```typescript
// Current: Await every DB operation
await this.db.updateOrderStatus(orderId, status);  // 10ms each

// Optimized: Batch every 100ms
class BatchWriter {
  private batch: Array<DBOperation> = [];
  private timer: NodeJS.Timer;
  
  constructor() {
    this.timer = setInterval(() => this.flush(), 100);
  }
  
  queue(operation: DBOperation) {
    this.batch.push(operation);
    if (this.batch.length >= 1000) this.flush();
  }
  
  async flush() {
    if (this.batch.length === 0) return;
    
    const ops = this.batch.splice(0);
    await this.db.transaction(async (tx) => {
      for (const op of ops) {
        await op.execute(tx);
      }
    });
  }
}
```

### 2. Replace Array-Based Orderbook with Heap
**Impact: 10x improvement**

```typescript
import { Heap } from 'heap-js';

class FastOrderbook {
  // Min heap for asks (lowest price first)
  private asks = new Heap<Order>((a, b) => {
    if (a.yesPts !== b.yesPts) return a.yesPts - b.yesPts;
    return a.timestamp - b.timestamp;
  });
  
  // Max heap for bids (highest price first)
  private bids = new Heap<Order>((a, b) => {
    if (a.yesPts !== b.yesPts) return b.yesPts - a.yesPts;
    return a.timestamp - b.timestamp;
  });
  
  addOrder(order: Order): Match[] {
    const matches: Match[] = [];
    
    if (order.side === 'FOR') {
      // Try to match with asks
      while (order.remaining > 0 && this.asks.size() > 0) {
        const bestAsk = this.asks.peek();
        if (order.yesPts >= bestAsk.yesPts) {
          const match = this.executeMatch(order, bestAsk);
          matches.push(match);
          
          if (bestAsk.remaining === 0) {
            this.asks.pop();
          }
        } else break;
      }
      
      if (order.remaining > 0) {
        this.bids.push(order);
      }
    }
    // ... similar for LAY
    
    return matches;
  }
}
```

### 3. Debounce Book Updates
**Impact: 10x reduction in NATS messages**

```typescript
class DebouncedPublisher {
  private pending = new Map<string, Orderbook>();
  private timer: NodeJS.Timer;
  
  constructor() {
    this.timer = setInterval(() => this.flush(), 100); // 10x/sec max
  }
  
  scheduleUpdate(marketId: string, book: Orderbook) {
    this.pending.set(marketId, book);
  }
  
  flush() {
    for (const [marketId, book] of this.pending) {
      this.publishBookDelta(marketId, book);
    }
    this.pending.clear();
  }
}
```

### 4. Parallel Market Processing
**Impact: Nx improvement (N = CPU cores)**

```typescript
import { Worker } from 'worker_threads';

class ParallelMatchingEngine {
  private workers = new Map<string, Worker>();
  
  async routeOrder(order: OrderCommand) {
    const marketId = order.marketId;
    
    let worker = this.workers.get(marketId);
    if (!worker) {
      worker = new Worker('./market-worker.js');
      this.workers.set(marketId, worker);
    }
    
    worker.postMessage({ type: 'ORDER', data: order });
  }
}

// market-worker.js
const { parentPort } = require('worker_threads');
const orderbook = new Orderbook(marketId);

parentPort.on('message', async (msg) => {
  if (msg.type === 'ORDER') {
    const matches = orderbook.addOrder(msg.data);
    parentPort.postMessage({ type: 'MATCHES', matches });
  }
});
```

---

## Phase 2: Rewrite in Rust (3 months)

### Why Rust?
- **No GC pauses** (Node.js can pause 10-100ms for garbage collection)
- **Zero-cost abstractions** (no runtime overhead)
- **Memory safety** without locks
- **SIMD support** (process 8 prices at once)

### Sample Rust Orderbook

```rust
use std::collections::BinaryHeap;
use std::cmp::Ordering;

#[derive(Copy, Clone)]
struct Order {
    id: u128,
    user_id: u128,
    yes_pts: u32,
    remaining_micros: u64,
    timestamp: u64,
}

impl PartialEq for Order {
    fn eq(&self, other: &Self) -> bool {
        self.yes_pts == other.yes_pts && self.timestamp == other.timestamp
    }
}

impl Eq for Order {}

impl PartialOrd for Order {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Order {
    fn cmp(&self, other: &Self) -> Ordering {
        // Max heap: highest price first, then oldest
        match other.yes_pts.cmp(&self.yes_pts) {
            Ordering::Equal => self.timestamp.cmp(&other.timestamp),
            other => other,
        }
    }
}

struct Orderbook {
    bids: BinaryHeap<Order>,
    asks: BinaryHeap<Order>,
}

impl Orderbook {
    fn add_order(&mut self, mut order: Order) -> Vec<Trade> {
        let mut trades = Vec::new();
        
        // Match loop
        while order.remaining_micros > 0 {
            if let Some(best_ask) = self.asks.peek_mut() {
                if order.yes_pts >= best_ask.yes_pts {
                    let qty = order.remaining_micros.min(best_ask.remaining_micros);
                    
                    trades.push(Trade {
                        price: best_ask.yes_pts,
                        qty_micros: qty,
                        maker_id: best_ask.id,
                        taker_id: order.id,
                    });
                    
                    order.remaining_micros -= qty;
                    best_ask.remaining_micros -= qty;
                    
                    if best_ask.remaining_micros == 0 {
                        drop(best_ask);
                        self.asks.pop();
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        
        if order.remaining_micros > 0 {
            self.bids.push(order);
        }
        
        trades
    }
}
```

**Performance:**
- ~10,000 orders/second on single core
- ~100,000 orders/second with 16 cores

---

## Benchmarking

Create performance tests:

```typescript
// benchmark.ts
async function benchmarkOrderProcessing() {
  const engine = new MatchingEngine();
  const orders = generateRandomOrders(10000);
  
  const start = Date.now();
  
  for (const order of orders) {
    await engine.processOrder(order);
  }
  
  const elapsed = Date.now() - start;
  const ordersPerSec = orders.length / (elapsed / 1000);
  
  console.log(`Processed ${orders.length} orders in ${elapsed}ms`);
  console.log(`Throughput: ${ordersPerSec.toFixed(0)} orders/sec`);
}
```

**Target Metrics:**
- Phase 1: 500 orders/sec
- Phase 2: 10,000 orders/sec
- Phase 3: 100,000+ orders/sec

---

## Monitoring

Add metrics:

```typescript
class MetricsCollector {
  private orderLatencies: number[] = [];
  private matchLatencies: number[] = [];
  
  recordOrderLatency(start: number) {
    this.orderLatencies.push(Date.now() - start);
  }
  
  getP99Latency(): number {
    const sorted = this.orderLatencies.sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)];
  }
  
  logMetrics() {
    console.log({
      p50: this.getPercentile(50),
      p99: this.getPercentile(99),
      p999: this.getPercentile(99.9),
      throughput: this.getThroughput(),
    });
  }
}
```

---

## Resources

### Libraries
- **Heap.js**: https://github.com/ignlg/heap-js
- **Node worker_threads**: https://nodejs.org/api/worker_threads.html
- **pg-promise** (batch operations): https://github.com/vitaly-t/pg-promise

### Learning
- "Flash Boys" by Michael Lewis (HFT overview)
- "Trading and Exchanges" by Larry Harris (market microstructure)
- Jane Street Tech Blog (OCaml trading systems)
- LMAX Disruptor pattern (low-latency event processing)

### Realistic Alternatives
Instead of building NASDAQ from scratch, consider:
1. **0x Protocol** (decentralized orderbook)
2. **Serum DEX** (Solana-based CLOB)
3. **dYdX v4** (off-chain orderbook, on-chain settlement)
