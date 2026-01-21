import { Module, Global } from '@nestjs/common';
import { NatsClient } from './nats.client';

@Global()
@Module({
  providers: [NatsClient],
  exports: [NatsClient],
})
export class NatsModule {}
