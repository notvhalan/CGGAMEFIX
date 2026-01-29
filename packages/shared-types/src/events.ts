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
  pPts: number; // Probability points
  stakePence: number; // Stake in pence
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
  remainingContractsMicros: string; // Remaining contracts as string (was remainingSize: number)
}

// Trade Executed Event
export interface TradeExecutedEvent extends BaseEvent {
  eventType: EventType.TRADE_EXECUTED;
  tradeId: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string; // Renamed from makerId
  takerUserId: string; // Renamed from takerId
  priceYesPts: number; // Renamed from yesPricePts for consistency
  qtyMicros: string; // Renamed from contractsMicros - Quantity traded in microcontracts (BigInt as string)
  notionalPence: number; // Renamed from sizePence - Notional value in pence
  takerSide: OrderSide; // Renamed from side - Side of the taker (aggressor)
  makerFeePence: number; // Maker fee in pence
  takerFeePence: number; // Taker fee in pence
}

// Book Delta Event (for incremental updates)
export interface BookDeltaEvent extends BaseEvent {
  eventType: EventType.BOOK_DELTA;
  side: OrderSide;
  yesPricePts: number; // Canonical YES price in probability points
  sizeDeltaPence: number; // Size delta in pence (positive = added, negative = removed)
}

// Cashout Quote Request
export interface CashoutQuoteRequest {
  marketId: string;
  userId: string;
  netContractsMicros: bigint; // Signed: negative = short YES / long NO
}

// Cashout Quote Response
export interface CashoutQuoteResponse {
  success: boolean;
  error?: string;
  marketId: string;
  userId: string;
  netContractsMicros: bigint;
  bookFillContractsMicros: bigint; // How much filled from orderbook
  internalFillContractsMicros: bigint; // How much filled internally (LP)
  avgYesPts: number; // Blended average YES price (weighted by fills)
  cashoutValuePence: number; // Net cashout value (can be negative)
  estimatedFeePence: number;
  quoteTimestamp: number; // For validation on execute
}

// Cashout Execute Request
export interface CashoutExecuteRequest {
  marketId: string;
  userId: string;
  netContractsMicros: bigint;
  expectedAvgYesPts: number; // From quote
  maxSlippagePts: number; // Max allowed deviation from quote
  quoteTimestamp: number; // Must match recent quote
}

// Cashout Execute Response
export interface CashoutExecuteResponse {
  success: boolean;
  error?: string;
  marketId: string;
  userId: string;
  actualAvgYesPts: number;
  actualCashoutValuePence: number;
  actualFeePence: number;
  trades: Array<{
    tradeId: string;
    isSynthetic: boolean;
    contractsMicros: bigint;
    yesPricePts: number;
    premiumPence: number;
  }>;
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
  
  CASHOUT_QUOTE: 'cashout.quote',
  CASHOUT_EXECUTE: 'cashout.execute',
  
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
