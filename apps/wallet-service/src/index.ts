import { validateEnv, WalletServiceEnvSchema, createLogger } from '@betting-exchange/shared-config';
import { connect } from 'nats';
import { NATS_SUBJECTS } from '@betting-exchange/shared-types';
import { WalletService } from './ledger';

const env = validateEnv(WalletServiceEnvSchema);
const logger = createLogger('wallet-service', env.LOG_LEVEL);

async function main() {
  try {
    logger.info('Starting Wallet Service...');
    
    // Connect to NATS
    const nats = await connect({ servers: env.NATS_URL });
    logger.info('Connected to NATS');
    
    // Initialize wallet service
    const walletService = new WalletService(nats, env, logger);
    await walletService.initialize();
    
    // Subscribe to trade executed events
    const tradeExecutedSub = nats.subscribe(NATS_SUBJECTS.EVENTS_TRADE_EXECUTED);
    
    // Subscribe to order accepted events (for reserving funds)
    const orderAcceptedSub = nats.subscribe(NATS_SUBJECTS.EVENTS_ORDER_ACCEPTED);
    
    // Subscribe to order cancelled events (for releasing funds)
    const orderCancelledSub = nats.subscribe(NATS_SUBJECTS.EVENTS_ORDER_CANCELLED);
    
    logger.info('Subscribed to wallet events');
    
    // Process trade settlements
    (async () => {
      for await (const msg of tradeExecutedSub) {
        try {
          const event = JSON.parse(msg.string());
          await walletService.handleTradeExecuted(event);
        } catch (error) {
          logger.error('Failed to process trade executed', error);
        }
      }
    })();
    
    // Process order reservations
    (async () => {
      for await (const msg of orderAcceptedSub) {
        try {
          const event = JSON.parse(msg.string());
          await walletService.handleOrderAccepted(event);
        } catch (error) {
          logger.error('Failed to process order accepted', error);
        }
      }
    })();
    
    // Process fund releases
    (async () => {
      for await (const msg of orderCancelledSub) {
        try {
          const event = JSON.parse(msg.string());
          await walletService.handleOrderCancelled(event);
        } catch (error) {
          logger.error('Failed to process order cancelled', error);
        }
      }
    })();
    
    logger.info('Wallet Service started successfully');
    
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
