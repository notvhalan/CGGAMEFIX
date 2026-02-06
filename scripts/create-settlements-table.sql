-- Create settlements table to track market resolution history
CREATE TABLE IF NOT EXISTS market_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  resolved_by_user_id UUID NOT NULL REFERENCES users(id),
  winning_outcome TEXT NOT NULL,
  settlement_reason TEXT,
  positions_settled INTEGER NOT NULL DEFAULT 0,
  orders_cancelled INTEGER NOT NULL DEFAULT 0,
  total_payout_gbp DECIMAL(18, 2) NOT NULL DEFAULT 0,
  winners_count INTEGER NOT NULL DEFAULT 0,
  losers_count INTEGER NOT NULL DEFAULT 0,
  settled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_market_settlements_market_id ON market_settlements(market_id);
CREATE INDEX IF NOT EXISTS idx_market_settlements_settled_at ON market_settlements(settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_settlements_resolved_by ON market_settlements(resolved_by_user_id);

-- Create user_settlements table to track individual user settlement details
CREATE TABLE IF NOT EXISTS user_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES market_settlements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  position_side TEXT NOT NULL, -- 'FOR' or 'LAY'
  contracts_settled BIGINT NOT NULL,
  entry_price_yes_pts INTEGER NOT NULL,
  is_winner BOOLEAN NOT NULL,
  payout_gbp DECIMAL(18, 2) NOT NULL DEFAULT 0,
  profit_loss_gbp DECIMAL(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_settlements_user_id ON user_settlements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settlements_settlement_id ON user_settlements(settlement_id);
CREATE INDEX IF NOT EXISTS idx_user_settlements_market_id ON user_settlements(market_id);

COMMENT ON TABLE market_settlements IS 'Tracks market resolution history including winner and settlement statistics';
COMMENT ON TABLE user_settlements IS 'Tracks individual user position settlements for transparency and history';
