import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@betting-exchange/shared-config';
import { NatsClient } from '../nats/nats.client';
import { NATS_SUBJECTS } from '../nats/subjects';
import { PositionLotsService } from '../services/position-lots.service';

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe';
  topic: string;
}

interface ExtendedSocket extends Socket {
  subscribedTopics: Set<string>;
  userId?: string;
}

@WebSocketGateway({
  path: '/ws',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger('EventsGateway');
  private clients: Map<string, ExtendedSocket> = new Map();

  constructor(
    private readonly natsClient: NatsClient,
    private readonly positionLotsService: PositionLotsService,
  ) {}

  afterInit() {
    this.logger.info('WebSocket Gateway initialized');
    // Wait for NATS connection before setting up subscriptions
    setTimeout(() => {
      try {
        this.setupNatsSubscriptions();
      } catch (error) {
        this.logger.error('Failed to setup NATS subscriptions', error);
      }
    }, 2000);
  }

  handleConnection(client: ExtendedSocket) {
    this.logger.debug(`Client connected: ${client.id}`);
    client.subscribedTopics = new Set();
    this.clients.set(client.id, client);

    // Send welcome message
    client.emit('connected', {
      message: 'Connected to betting exchange',
      clientId: client.id,
    });
  }

  handleDisconnect(client: ExtendedSocket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
    this.clients.delete(client.id);
  }

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: WebSocketMessage,
    @ConnectedSocket() client: ExtendedSocket,
  ) {
    try {
      const { type, topic } = data;

      if (type === 'subscribe') {
        this.handleSubscribe(client, topic);
      } else if (type === 'unsubscribe') {
        this.handleUnsubscribe(client, topic);
      } else {
        client.emit('error', { message: 'Unknown message type' });
      }
    } catch (error) {
      this.logger.error('Error handling message', error);
      client.emit('error', { message: 'Failed to process message' });
    }
  }

  private handleSubscribe(client: ExtendedSocket, topic: string) {
    if (client.subscribedTopics.has(topic)) {
      client.emit('info', { message: `Already subscribed to ${topic}` });
      return;
    }

    client.subscribedTopics.add(topic);
    client.join(topic);
    this.logger.debug(`Client ${client.id} subscribed to ${topic}`);
    
    client.emit('subscribed', { topic });
  }

  private handleUnsubscribe(client: ExtendedSocket, topic: string) {
    if (!client.subscribedTopics.has(topic)) {
      client.emit('info', { message: `Not subscribed to ${topic}` });
      return;
    }

    client.subscribedTopics.delete(topic);
    client.leave(topic);
    this.logger.debug(`Client ${client.id} unsubscribed from ${topic}`);
    
    client.emit('unsubscribed', { topic });
  }

  private setupNatsSubscriptions() {
    // Subscribe to orderbook updates
    this.natsClient.subscribe(NATS_SUBJECTS.MARKET_BOOK_UPDATED, (data) => {
      const { marketId, ...bookData } = data;
      const topic = `book:${marketId}`;
      this.server.to(topic).emit('book_update', bookData);
    });

    // Subscribe to trade executions
    this.natsClient.subscribe('events.trade.executed', async (data) => {
      const { marketId, yesPricePts, sizePence, executedAt, ...rest } = data;
      
      // Process position lots (FIFO consumption)
      try {
        await this.positionLotsService.processTrade(data);
      } catch (error) {
        this.logger.error('Failed to process position lots', error);
      }
      
      // Normalize field names to match DB schema (snake_case)
      const normalizedTrade = {
        ...rest,
        yes_pts: yesPricePts,
        cost_pence: sizePence,
        executed_at: executedAt,
      };
      
      const topic = `trades:${marketId}`;
      this.server.to(topic).emit('trade', normalizedTrade);
    });

    // Subscribe to order updates
    this.natsClient.subscribe(NATS_SUBJECTS.ORDERS_ACCEPTED, (data) => {
      const { userId, ...orderData } = data;
      const topic = `orders:${userId}`;
      this.server.to(topic).emit('order_accepted', orderData);
    });

    this.natsClient.subscribe(NATS_SUBJECTS.ORDERS_MATCHED, (data) => {
      const { userId, ...orderData } = data;
      const topic = `orders:${userId}`;
      this.server.to(topic).emit('order_matched', orderData);
    });

    this.natsClient.subscribe(NATS_SUBJECTS.ORDERS_CANCELLED, (data) => {
      const { userId, ...orderData } = data;
      const topic = `orders:${userId}`;
      this.server.to(topic).emit('order_cancelled', orderData);
    });

    this.logger.info('NATS subscriptions established for WebSocket broadcasting');
  }

  // Method to broadcast mock data for testing
  broadcastMockUpdate(topic: string, data: any) {
    this.server.to(topic).emit('update', data);
  }
}
