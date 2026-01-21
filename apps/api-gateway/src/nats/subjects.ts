// NATS Subject constants
export const NATS_SUBJECTS = {
  // Order commands
  ORDERS_SUBMIT: 'orders.submit',
  ORDERS_CANCEL: 'orders.cancel',
  
  // Order events
  ORDERS_ACCEPTED: 'orders.accepted',
  ORDERS_REJECTED: 'orders.rejected',
  ORDERS_MATCHED: 'orders.matched',
  ORDERS_CANCELLED: 'orders.cancelled',
  
  // Market events
  MARKET_BOOK_UPDATED: 'market.book.updated',
  MARKET_TRADE_EXECUTED: 'market.trade.executed',
  
  // Wallet events
  WALLET_DEPOSIT: 'wallet.deposit',
  WALLET_WITHDRAW: 'wallet.withdraw',
} as const;

export type NatsSubject = typeof NATS_SUBJECTS[keyof typeof NATS_SUBJECTS];
