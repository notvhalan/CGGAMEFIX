// Clear cancelled orders from Rust matching engine orderbook
const { connect, StringCodec } = require('nats');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'betting_exchange',
  user: 'postgres',
  password: 'postgres',
});

async function clearOrderbook() {
  const nc = await connect({ servers: 'localhost:4222' });
  const sc = StringCodec();
  
  console.log('Connected to NATS');
  
  // Get all cancelled orders for this market
  const result = await pool.query(
    `SELECT id, market_id 
     FROM orders 
     WHERE market_id = '550e8400-e29b-41d4-a716-446655440001' 
     AND status = 'CANCELLED'`
  );
  
  console.log(`Found ${result.rows.length} cancelled orders to clear from orderbook`);
  
  // Publish cancel command for each
  for (const order of result.rows) {
    const command = {
      orderId: order.id,
      marketId: order.market_id,
      reason: 'CLEAR_ORDERBOOK',
    };
    
    nc.publish('orders.cancel', sc.encode(JSON.stringify(command)));
  }
  
  console.log(`Published ${result.rows.length} cancel commands`);
  
  // Wait a bit for messages to send
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Send orderbook update
  nc.publish('market.book.updated', sc.encode(JSON.stringify({
    marketId: '550e8400-e29b-41d4-a716-446655440001',
    timestamp: Date.now(),
  })));
  
  console.log('Sent orderbook update broadcast');
  
  await nc.drain();
  await pool.end();
  
  console.log('Done!');
}

clearOrderbook().catch(console.error);
