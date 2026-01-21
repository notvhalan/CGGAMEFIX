import { validateEnv, BaseEnvSchema, createLogger } from '@betting-exchange/shared-config';
import { connect } from 'nats';
import { NATS_SUBJECTS } from '@betting-exchange/shared-types';
import { SettlementService } from './settler';

const env = validateEnv(BaseEnvSchema);
const logger = createLogger('settlement-service', env.LOG_LEVEL);

async function main() {
  try {
    logger.info('Starting Settlement Service...');
    
    // Connect to NATS
    const nats = await connect({ servers: env.NATS_URL });
    logger.info('Connected to NATS');
    
    // Initialize settlement service
    const settlementService = new SettlementService(nats, env, logger);
    await settlementService.initialize();
    
    // Subscribe to market settled events
    const marketSettledSub = nats.subscribe(NATS_SUBJECTS.EVENTS_MARKET_SETTLED);
    
    logger.info('Subscribed to settlement events');
    
    // Process market settlements
    (async () => {
      for await (const msg of marketSettledSub) {
        try {
          const event = JSON.parse(msg.string());
          await settlementService.handleMarketSettled(event);
        } catch (error) {
          logger.error('Failed to process market settlement', error);
        }
      }
    })();
    
    logger.info('Settlement Service started successfully');
    
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await nats.drain();
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error('Failed to start Settlement Service', error);
    process.exit(1);
  }
}

main();
