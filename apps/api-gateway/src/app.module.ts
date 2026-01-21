import { Module } from '@nestjs/common';
import { NatsModule } from './nats/nats.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { MarketsController } from './controllers/markets.controller';
import { OrdersController } from './controllers/orders.controller';
import { WalletController } from './controllers/wallet.controller';
import { EventsGateway } from './gateways/events.gateway';

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
  ],
  providers: [EventsGateway],
})
export class AppModule {}
