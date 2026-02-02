-- Trade Settlements Table
-- Prevents double-settlement when NATS redelivers TRADE_EXECUTED events

CREATE TABLE IF NOT EXISTS trade_settlements (
  trade_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trade_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_settlements_user_id ON trade_settlements(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_settlements_created_at ON trade_settlements(created_at);

COMMENT ON TABLE trade_settlements IS 'Idempotency tracking for trade settlement to prevent double-crediting/debiting';
COMMENT ON COLUMN trade_settlements.trade_id IS 'Unique trade identifier from matching engine';
COMMENT ON COLUMN trade_settlements.order_id IS 'Order ID that was settled (taker or maker)';
COMMENT ON COLUMN trade_settlements.user_id IS 'User whose wallet was updated';
