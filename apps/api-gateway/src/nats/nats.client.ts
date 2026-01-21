import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, NatsConnection, StringCodec } from 'nats';
import { Logger } from '@betting-exchange/shared-config';

@Injectable()
export class NatsClient implements OnModuleInit, OnModuleDestroy {
  private connection: NatsConnection | null = null;
  private readonly logger = new Logger('NatsClient');
  private readonly codec = StringCodec();

  async onModuleInit() {
    try {
      const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
      this.logger.info(`Connecting to NATS at ${natsUrl}...`);
      
      this.connection = await connect({ 
        servers: natsUrl,
        maxReconnectAttempts: -1,
      });
      
      this.logger.info('Successfully connected to NATS');
    } catch (error) {
      this.logger.error('Failed to connect to NATS', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.connection) {
      await this.connection.drain();
      this.logger.info('NATS connection closed');
    }
  }

  publish(subject: string, data: any): void {
    if (!this.connection) {
      throw new Error('NATS connection not established');
    }
    
    const payload = JSON.stringify(data);
    this.connection.publish(subject, this.codec.encode(payload));
    this.logger.debug(`Published to ${subject}`, { data });
  }

  async request(subject: string, data: any, timeout = 5000): Promise<any> {
    if (!this.connection) {
      throw new Error('NATS connection not established');
    }
    
    const payload = JSON.stringify(data);
    const response = await this.connection.request(
      subject,
      this.codec.encode(payload),
      { timeout }
    );
    
    return JSON.parse(this.codec.decode(response.data));
  }

  subscribe(subject: string, handler: (data: any) => void) {
    if (!this.connection) {
      throw new Error('NATS connection not established');
    }

    const subscription = this.connection.subscribe(subject);
    
    (async () => {
      for await (const msg of subscription) {
        try {
          const data = JSON.parse(this.codec.decode(msg.data));
          handler(data);
        } catch (error) {
          this.logger.error(`Error processing message from ${subject}`, error);
        }
      }
    })();

    return subscription;
  }

  getConnection(): NatsConnection {
    if (!this.connection) {
      throw new Error('NATS connection not established');
    }
    return this.connection;
  }
}
