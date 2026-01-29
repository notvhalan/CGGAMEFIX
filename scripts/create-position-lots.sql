-- Position Lots Table
-- Tracks open position inventory with FIFO lot consumption
-- Each fill creates a lot with remaining contracts that can be partially/fully closed

CREATE TABLE IF NOT EXISTS position_lots (
  lot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  market_id UUID NOT NULL,
  
  -- Side: FOR = long YES (positive contracts), LAY = short YES (negative contracts)
  -- We store this as a string for clarity, but contracts are already signed
  side VARCHAR(10) NOT NULL CHECK (side IN ('FOR', 'LAY')),
  
  -- Entry price in probability points (0.00001% precision)
  entry_yes_pts INTEGER NOT NULL CHECK (entry_yes_pts >= 0 AND entry_yes_pts <= 10000000),
  
  -- Trade that opened this lot
  opened_from_trade_id UUID NOT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Contracts (unsigned, always positive)
  -- Use side field to determine direction
  opened_contracts_micros BIGINT NOT NULL CHECK (opened_contracts_micros > 0),
  remaining_contracts_micros BIGINT NOT NULL CHECK (remaining_contracts_micros >= 0),
  
  -- Realized P&L from partial/full closes of this lot
  realized_pnl_pence INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Foreign keys
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
  
  -- Constraints
  CHECK (remaining_contracts_micros <= opened_contracts_micros)
);

-- Indexes for fast lookups
CREATE INDEX idx_position_lots_user_market ON position_lots(user_id, market_id);
CREATE INDEX idx_position_lots_user_market_side ON position_lots(user_id, market_id, side);
CREATE INDEX idx_position_lots_user_market_entry ON position_lots(user_id, market_id, entry_yes_pts);
CREATE INDEX idx_position_lots_remaining ON position_lots(remaining_contracts_micros) WHERE remaining_contracts_micros > 0;
CREATE INDEX idx_position_lots_opened_at ON position_lots(user_id, market_id, opened_at); -- For FIFO

-- Optional: Positions Snapshot Table (fast read model, can be rebuilt from lots)
CREATE TABLE IF NOT EXISTS positions_snapshot (
  user_id UUID NOT NULL,
  market_id UUID NOT NULL,
  
  -- Net position (signed contracts)
  net_contracts_micros BIGINT NOT NULL DEFAULT 0,
  
  -- Weighted average entry price (across all open lots)
  avg_entry_yes_pts INTEGER NOT NULL DEFAULT 0,
  
  -- Accumulated realized P&L from all closed lots
  realized_pnl_pence INTEGER NOT NULL DEFAULT 0,
  
  -- Total fees paid on this market
  fees_paid_pence INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Primary key
  PRIMARY KEY (user_id, market_id),
  
  -- Foreign keys
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
);

-- Index for fast user portfolio queries
CREATE INDEX idx_positions_snapshot_user ON positions_snapshot(user_id);
CREATE INDEX idx_positions_snapshot_nonzero ON positions_snapshot(net_contracts_micros) WHERE net_contracts_micros != 0;

-- Comments for documentation
COMMENT ON TABLE position_lots IS 'Open position inventory with FIFO lot tracking. Each fill creates a lot that can be partially closed.';
COMMENT ON COLUMN position_lots.side IS 'FOR = long YES (positive), LAY = short YES (negative)';
COMMENT ON COLUMN position_lots.remaining_contracts_micros IS 'Remaining open contracts. Lot is fully closed when this reaches 0.';
COMMENT ON COLUMN position_lots.realized_pnl_pence IS 'Accumulated realized P&L from partial/full closes of this specific lot';

COMMENT ON TABLE positions_snapshot IS 'Fast read model for current positions. Can be rebuilt from position_lots + trades.';
COMMENT ON COLUMN positions_snapshot.net_contracts_micros IS 'Signed net position. Positive = long YES, negative = short YES.';
