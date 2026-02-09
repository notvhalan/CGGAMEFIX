-- 100ms price bars (trade-based) for fast charting
-- Stores open/close and volume per 100ms bucket

CREATE TABLE IF NOT EXISTS price_bars_100ms (
  market_id UUID NOT NULL REFERENCES markets(id),
  bucket_start TIMESTAMP NOT NULL,
  open_yes_pts BIGINT NOT NULL CHECK (open_yes_pts > 0 AND open_yes_pts < 10000000),
  close_yes_pts BIGINT NOT NULL CHECK (close_yes_pts > 0 AND close_yes_pts < 10000000),
  volume_micros BIGINT NOT NULL DEFAULT 0 CHECK (volume_micros >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_price_bars_100ms_market_time
  ON price_bars_100ms (market_id, bucket_start DESC);
