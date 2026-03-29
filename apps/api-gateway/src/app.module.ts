import { Module } from '@nestjs/common';
import { NatsModule } from './nats/nats.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { MarketsController } from './controllers/markets.controller';
import { OrdersController } from './controllers/orders.controller';
import { WalletController } from './controllers/wallet.controller';
import { PositionsController } from './controllers/positions.controller';
import { CashoutController } from './controllers/cashout.controller';
import { AdminController } from './controllers/admin.controller';
import { SettlementsController } from './controllers/settlements.controller';
import { InsuranceController } from './controllers/insurance.controller';
import { LadderController } from './modules/ladder/ladder.controller';
import { SyntheticOrdersController } from './modules/synthetic-orders/synthetic-orders.controller';
import { EventsGateway } from './gateways/events.gateway';
import { OrderBookBroadcastService } from './services/orderbook-broadcast.service';
import { LiquidityBotsService } from './services/liquidity-bots.service';
import { PositionLotsService } from './services/position-lots.service';
import { RustExchangeService } from './services/rust-exchange.service';
import { LadderService } from './modules/ladder/ladder.service';
import { LadderSettlementService } from './modules/ladder/ladder-settlement.service';
import { SyntheticOrdersService } from './modules/synthetic-orders/synthetic-orders.service';

@Module({
  imports: [
    NatsModule,
    DatabaseModule,
    AuthModule,
  ],
  controllers: [
    MarketsController,
    OrdersController,
    WalletController,
    PositionsController,
    CashoutController,
    AdminController,
    SettlementsController,
    InsuranceController,
    LadderController,
    SyntheticOrdersController,
  ],
  providers: [
    EventsGateway,
    OrderBookBroadcastService,
    LiquidityBotsService,
    PositionLotsService,
    RustExchangeService,
    LadderService,
    LadderSettlementService,
    SyntheticOrdersService,
  ],
})
export class AppModule {}
