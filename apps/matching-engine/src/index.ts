import { MatchingEngine } from './engine';

// Environment variables
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/betting_exchange';

async function main() {
  try {
    // console.log('Starting Matching Engine...');
    
    // Create and start matching engine
    const engine = new MatchingEngine(NATS_URL, DATABASE_URL);
    await engine.start();
    
    // console.log('Matching Engine is running');
    
  } catch (error) {
    console.error('Failed to start matching engine:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
