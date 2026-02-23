/**
 * Full Flow Test: Verify API Gateway → Matching Engine flow
 * Tests the complete path from user input to order matching
 */

const PRICE_SCALE = 10_000_000;
const CONTRACT_SCALE = 1_000_000;
const CONTRACT_PAYOUT_PENCE = 100;

// ==================== FRONTEND SIMULATION ====================
function simulateFrontendOrderTicket(side: 'FOR' | 'LAY', probabilityPercent: number, amountPounds: number) {
  console.log(`\n📱 FRONTEND: User enters ${side} order`);
  console.log(`   Input: ${side} ${probabilityPercent}% for £${amountPounds}`);
  
  const pPts = Math.round((probabilityPercent / 100) * PRICE_SCALE);
  const amountPence = Math.round(amountPounds * 100);
  
  let yesPts: number;
  if (side === 'FOR') {
    yesPts = pPts;
  } else {
    const qPts = pPts; // User entered NO probability
    yesPts = PRICE_SCALE - qPts;
  }
  
  console.log(`   Calculated: pPts=${pPts}, yesPts=${yesPts}`);
  console.log(`   Sends to API: { side: "${side}", pPts: ${pPts}, liabilityPence: ${amountPence} }`);
  
  return { side, pPts, liabilityPence: amountPence, yesPts };
}

// ==================== API GATEWAY SIMULATION ====================
function simulateAPIGateway(side: 'FOR' | 'LAY', pPts: number, liabilityPence: number) {
  console.log(`\n🔵 API GATEWAY: Processes order`);
  console.log(`   Received: { side: "${side}", pPts: ${pPts}, liabilityPence: ${liabilityPence} }`);
  
  let yesPts: number;
  if (side === 'FOR') {
    yesPts = pPts;
    console.log(`   FOR logic: yesPts = pPts = ${yesPts}`);
  } else {
    yesPts = PRICE_SCALE - pPts;
    console.log(`   LAY logic: yesPts = PRICE_SCALE - pPts = ${PRICE_SCALE} - ${pPts} = ${yesPts}`);
  }
  
  const yesPct = (yesPts / PRICE_SCALE * 100).toFixed(2);
  console.log(`   Result: yesPts=${yesPts} (${yesPct}% YES)`);
  console.log(`   Stores in DB: { side: "${side}", p_pts: ${pPts}, yes_pts: ${yesPts} }`);
  console.log(`   Publishes to matching engine: { side: "${side}", yesPts: ${yesPts} }`);
  
  return { side, pPts, yesPts, liabilityPence };
}

// ==================== MATCHING ENGINE SIMULATION ====================
function simulateMatchingEngine(orders: Array<{ side: 'FOR' | 'LAY', yesPts: number, id: string }>) {
  console.log(`\n⚙️  MATCHING ENGINE: Processing orders`);
  
  const bids: typeof orders = [];
  const asks: typeof orders = [];
  
  orders.forEach(order => {
    if (order.side === 'FOR') {
      bids.push(order);
      console.log(`   FOR order ${order.id}: yesPts=${order.yesPts} → BID queue`);
    } else {
      asks.push(order);
      console.log(`   LAY order ${order.id}: yesPts=${order.yesPts} → ASK queue`);
    }
  });
  
  // Sort bids (highest first) and asks (lowest first)
  bids.sort((a, b) => b.yesPts - a.yesPts);
  asks.sort((a, b) => a.yesPts - b.yesPts);
  
  console.log(`\n   Book state:`);
  console.log(`   BIDS (highest first): ${bids.map(b => `${(b.yesPts / PRICE_SCALE * 100).toFixed(1)}%`).join(', ') || 'empty'}`);
  console.log(`   ASKS (lowest first): ${asks.map(a => `${(a.yesPts / PRICE_SCALE * 100).toFixed(1)}%`).join(', ') || 'empty'}`);
  
  // Check for matches
  if (bids.length > 0 && asks.length > 0) {
    const bestBid = bids[0];
    const bestAsk = asks[0];
    const canMatch = bestBid.yesPts >= bestAsk.yesPts;
    
    console.log(`\n   Match check: BID ${(bestBid.yesPts / PRICE_SCALE * 100).toFixed(2)}% >= ASK ${(bestAsk.yesPts / PRICE_SCALE * 100).toFixed(2)}%?`);
    console.log(`   Result: ${canMatch ? '✅ CAN MATCH' : '❌ NO MATCH'}`);
    
    if (canMatch) {
      console.log(`   Execution price: ${(bestAsk.yesPts / PRICE_SCALE * 100).toFixed(2)}% (maker's price)`);
    }
  }
}

// ==================== TEST SCENARIOS ====================
console.log('═'.repeat(80));
console.log('FULL FLOW TEST: Frontend → API Gateway → Matching Engine');
console.log('═'.repeat(80));

// Test 1: FOR 55% should match LAY 67%
console.log('\n\n' + '━'.repeat(80));
console.log('TEST 1: FOR 55% YES vs LAY 67% NO');
console.log('━'.repeat(80));
console.log('Expected: Should match (buyer at 55% meets seller at 33% YES)');

const frontend1a = simulateFrontendOrderTicket('LAY', 67, 10);
const api1a = simulateAPIGateway(frontend1a.side, frontend1a.pPts, frontend1a.liabilityPence);

const frontend1b = simulateFrontendOrderTicket('FOR', 55, 10);
const api1b = simulateAPIGateway(frontend1b.side, frontend1b.pPts, frontend1b.liabilityPence);

simulateMatchingEngine([
  { side: api1a.side as any, yesPts: api1a.yesPts, id: 'order-1' },
  { side: api1b.side as any, yesPts: api1b.yesPts, id: 'order-2' }
]);

// Test 2: FOR 70% should match LAY 50%
console.log('\n\n' + '━'.repeat(80));
console.log('TEST 2: FOR 70% YES vs LAY 50% NO');
console.log('━'.repeat(80));
console.log('Expected: Should match (buyer at 70% meets seller at 50% YES)');

const frontend2a = simulateFrontendOrderTicket('LAY', 50, 10);
const api2a = simulateAPIGateway(frontend2a.side, frontend2a.pPts, frontend2a.liabilityPence);

const frontend2b = simulateFrontendOrderTicket('FOR', 70, 10);
const api2b = simulateAPIGateway(frontend2b.side, frontend2b.pPts, frontend2b.liabilityPence);

simulateMatchingEngine([
  { side: api2a.side as any, yesPts: api2a.yesPts, id: 'order-3' },
  { side: api2b.side as any, yesPts: api2b.yesPts, id: 'order-4' }
]);

// Test 3: FOR 45% should NOT match LAY 40%
console.log('\n\n' + '━'.repeat(80));
console.log('TEST 3: FOR 45% YES vs LAY 40% NO');
console.log('━'.repeat(80));
console.log('Expected: Should NOT match (buyer at 45% cannot meet seller at 60% YES)');

const frontend3a = simulateFrontendOrderTicket('LAY', 40, 10);
const api3a = simulateAPIGateway(frontend3a.side, frontend3a.pPts, frontend3a.liabilityPence);

const frontend3b = simulateFrontendOrderTicket('FOR', 45, 10);
const api3b = simulateAPIGateway(frontend3b.side, frontend3b.pPts, frontend3b.liabilityPence);

simulateMatchingEngine([
  { side: api3a.side as any, yesPts: api3a.yesPts, id: 'order-5' },
  { side: api3b.side as any, yesPts: api3b.yesPts, id: 'order-6' }
]);

// Test 4: Complex scenario with multiple orders
console.log('\n\n' + '━'.repeat(80));
console.log('TEST 4: Multiple orders at different prices');
console.log('━'.repeat(80));

const orders = [
  simulateAPIGateway('LAY', 7_000_000, 1000),  // LAY 70% NO = 30% YES
  simulateAPIGateway('LAY', 6_000_000, 1000),  // LAY 60% NO = 40% YES
  simulateAPIGateway('FOR', 5_000_000, 1000),  // FOR 50% YES
  simulateAPIGateway('FOR', 6_500_000, 1000),  // FOR 65% YES
];

simulateMatchingEngine(orders.map((o, i) => ({ 
  side: o.side as any, 
  yesPts: o.yesPts, 
  id: `order-${i + 7}` 
})));

console.log('\n\n' + '═'.repeat(80));
console.log('TEST COMPLETE');
console.log('═'.repeat(80));
console.log('\n✅ If all tests show correct matching behavior, the code is working as designed!');
console.log('❌ If mismatches occur, there may be a bug in the flow.\n');
