import { validateEnv, MatchingEngineEnvSchema, createLogger } from '@betting-exchange/shared-config';
import { connect } from 'nats';
import { NATS_SUBJECTS } from '@betting-exchange/shared-types';
import { MatchingEngine } from './engine';

const env = validateEnv(MatchingEngineEnvSchema);
const logger = createLogger('matching-engine', env.LOG_LEVEL);

async function main() {
  try {
    logger.info('Starting Matching Engine...');
    
    // Connect to NATS
    const nats = await connect({ servers: env.NATS_URL });
    logger.info('Connected to NATS');
    
    // Initialize matching engine
    const engine = new MatchingEngine(nats, env, logger);
    await engine.initialize();
    
    // Subscribe to order commands
    const orderSubmitSub = nats.subscribe(NATS_SUBJECTS.ORDERS_SUBMIT);
    const orderCancelSub = nats.subscribe(NATS_SUBJECTS.ORDERS_CANCEL);
    
    logger.info('Subscribed to order commands');
    
    // Process order submissions
    (async () => {
      for await (const msg of orderSubmitSub) {
        try {
          const command = JSON.parse(msg.string());
          await engine.handleOrderSubmit(command);
        } catch (error) {
          logger.error('Failed to process order submit', error);
        }
      }
    })();
    
    // Process order cancellations
    (async () => {
      for await (const msg of orderCancelSub) {
        try {
          const command = JSON.parse(msg.string());
          await engine.handleOrderCancel(command);
        } catch (error) {
          logger.error('Failed to process order cancel', error);
        }
      }
    })();
    
    logger.info('Matching Engine started successfully');
    
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await nats.drain();
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error('Failed to start Matching Engine', error);
    process.exit(1);
  }
}

main();
