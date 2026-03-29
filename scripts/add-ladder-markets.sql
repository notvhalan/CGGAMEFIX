-- ============================================================
-- Ladder Markets + Interval Trading — Schema Migration
-- ============================================================

-- 1. Market Groups (ladder parent)
CREATE TABLE IF NOT EXISTS market_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    group_type      TEXT NOT NULL DEFAULT 'event_time_ladder',
    event_key       TEXT UNIQUE NOT NULL,
    category        TEXT NOT NULL DEFAULT 'INSURANCE',
    description     TEXT,
    resolution_source TEXT,
    oracle_spec     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_groups_event_key ON market_groups(event_key);
CREATE INDEX IF NOT EXISTS idx_market_groups_slug      ON market_groups(slug);

-- 2. Link markets to their parent group
ALTER TABLE markets
    ADD COLUMN IF NOT EXISTS market_group_id UUID REFERENCES market_groups(id),
    ADD COLUMN IF NOT EXISTS contract_type   TEXT DEFAULT 'standalone',
    ADD COLUMN IF NOT EXISTS sort_key        BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS instrument_symbol TEXT;

CREATE INDEX IF NOT EXISTS idx_markets_group_id ON markets(market_group_id);
CREATE INDEX IF NOT EXISTS idx_markets_symbol   ON markets(instrument_symbol);

-- 3. Event resolutions (one row per real-world event)
CREATE TABLE IF NOT EXISTS event_resolutions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_key       TEXT UNIQUE NOT NULL,
    occurred        BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at     TIMESTAMPTZ,
    source          TEXT,
    source_url      TEXT,
    notes           TEXT,
    resolved_by     UUID,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_resolutions_key ON event_resolutions(event_key);

-- 4. Synthetic orders (interval spread parent)
CREATE TABLE IF NOT EXISTS synthetic_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL,
    market_group_id     UUID NOT NULL REFERENCES market_groups(id),
    synthetic_type      TEXT NOT NULL DEFAULT 'interval',
    direction           TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    start_maturity      TIMESTAMPTZ,
    end_maturity        TIMESTAMPTZ NOT NULL,
    requested_qty_micros BIGINT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','LEG1_FILLED','FILLED','PARTIAL','FAILED','CANCELLED')),
    net_price_pts       INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synthetic_orders_user   ON synthetic_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_synthetic_orders_group  ON synthetic_orders(market_group_id);
CREATE INDEX IF NOT EXISTS idx_synthetic_orders_status ON synthetic_orders(status);

-- 5. Synthetic order legs (child orders submitted to engine)
CREATE TABLE IF NOT EXISTS synthetic_order_legs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    synthetic_order_id  UUID NOT NULL REFERENCES synthetic_orders(id) ON DELETE CASCADE,
    leg_index           SMALLINT NOT NULL,
    market_id           UUID NOT NULL,
    side                TEXT NOT NULL,
    qty_micros          BIGINT NOT NULL,
    limit_price_pts     INTEGER,
    engine_order_id     UUID,
    status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SUBMITTED','FILLED','PARTIAL','FAILED','CANCELLED')),
    filled_qty_micros   BIGINT DEFAULT 0,
    avg_fill_price_pts  INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synth_legs_parent ON synthetic_order_legs(synthetic_order_id);
CREATE INDEX IF NOT EXISTS idx_synth_legs_engine ON synthetic_order_legs(engine_order_id);
