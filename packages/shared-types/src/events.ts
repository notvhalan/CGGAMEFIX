import { OrderSide } from './order';

// Event Types for NATS subjects
export enum EventType {
  // Order Events
  ORDER_SUBMITTED = 'ORDER_SUBMITTED',
  ORDER_ACCEPTED = 'ORDER_ACCEPTED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_PARTIALLY_MATCHED = 'ORDER_PARTIALLY_MATCHED',
  ORDER_MATCHED = 'ORDER_MATCHED',

  // Trade Events
  TRADE_EXECUTED = 'TRADE_EXECUTED',

  // Orderbook Events
  BOOK_DELTA = 'BOOK_DELTA',
  BOOK_SNAPSHOT = 'BOOK_SNAPSHOT',

  // Market Events
  MARKET_UPDATED = 'MARKET_UPDATED',
  MARKET_SETTLED = 'MARKET_SETTLED',
}

// Base Event
interface BaseEvent {
  eventId: string;
  eventType: EventType;
  timestamp: Date;
  marketId: string;
}

// Order Accepted Event
export interface OrderAcceptedEvent extends BaseEvent {
  eventType: EventType.ORDER_ACCEPTED;
  orderId: string;
  userId: string;
  side: OrderSide;
  price: number;
  size: number;
}

// Order Rejected Event
export interface OrderRejectedEvent extends BaseEvent {
  eventType: EventType.ORDER_REJECTED;
  orderId: string;
  userId: string;
  reason: string;
}

// Order Cancelled Event
export interface OrderCancelledEvent extends BaseEvent {
  eventType: EventType.ORDER_CANCELLED;
  orderId: string;
  userId: string;
  remainingSize: number;
}

// Trade Executed Event
export interface TradeExecutedEvent extends BaseEvent {
  eventType: EventType.TRADE_EXECUTED;
  tradeId: string;
  makerOrderId: string;
  takerOrderId: string;
  makerId: string;
  takerId: string;
  price: number;
  size: number;
  side: OrderSide; // Side of the taker
  makerFee: number;
  takerFee: number;
}

// Book Delta Event (for incremental updates)
export interface BookDeltaEvent extends BaseEvent {
  eventType: EventType.BOOK_DELTA;
  side: OrderSide;
  price: number;
  sizeDelta: number; // Positive = added, negative = removed
}

// Book Snapshot Event (for initial load)
export interface BookSnapshotEvent extends BaseEvent {
  eventType: EventType.BOOK_SNAPSHOT;
  backs: Array<{ price: number; size: number }>;
  lays: Array<{ price: number; size: number }>;
}

// Union type for all events
export type DomainEvent =
  | OrderAcceptedEvent
  | OrderRejectedEvent
  | OrderCancelledEvent
  | TradeExecutedEvent
  | BookDeltaEvent
  | BookSnapshotEvent;

// NATS Subjects
export const NATS_SUBJECTS = {
  ORDERS_SUBMIT: 'orders.submit',
  ORDERS_CANCEL: 'orders.cancel',
  
  EVENTS_ORDER_ACCEPTED: 'events.order.accepted',
  EVENTS_ORDER_REJECTED: 'events.order.rejected',
  EVENTS_ORDER_CANCELLED: 'events.order.cancelled',
  EVENTS_ORDER_MATCHED: 'events.order.matched',
  
  EVENTS_TRADE_EXECUTED: 'events.trade.executed',
  
  EVENTS_BOOK_DELTA: 'events.book.delta',
  EVENTS_BOOK_SNAPSHOT: 'events.book.snapshot',
  
  EVENTS_MARKET_UPDATED: 'events.market.updated',
  EVENTS_MARKET_SETTLED: 'events.market.settled',
} as const;
