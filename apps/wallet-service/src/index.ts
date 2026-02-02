import { connect } from 'nats';
import { NATS_SUBJECTS } from '@betting-exchange/shared-types';
import { createLogger } from '@betting-exchange/shared-config';
import { WalletService } from './ledger';

// Environment variables with defaults for development
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/betting_exchange';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Use shared logger
const logger = createLogger('WalletService', LOG_LEVEL);

const env = {
  NATS_URL,
  DATABASE_URL,
  LOG_LEVEL,
};

async function main() {
  try {
    logger.info('Starting Wallet Service...');
    
    // Connect to NATS
    const nats = await connect({ servers: NATS_URL });
    logger.info('Connected to NATS');
    
    // Initialize wallet service
    const walletService = new WalletService(nats, env, logger);
    await walletService.initialize();
    
    // DISABLED: api-gateway now handles all settlement/reservation via OrderEventsService + PositionLotsService
    // TODO: Remove wallet-service entirely or repurpose for read-only ledger queries
    
    logger.info('Wallet Service started (event processing DISABLED - api-gateway handles settlement)');
    
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await nats.drain();
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error('Failed to start Wallet Service', error);
    process.exit(1);
  }
}

main();
