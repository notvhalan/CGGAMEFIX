-- ══════════════════════════════════════════════════════════════
-- Migration: Insurance market metadata
-- Date: 2026-03-16
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Extend markets table ────────────────────────────────────
-- market_category: PREDICTION (default) or INSURANCE
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS market_category    VARCHAR(20)  NOT NULL DEFAULT 'PREDICTION',
  ADD COLUMN IF NOT EXISTS insurance_category VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS condition_name     VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS question           TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS maturity_date      TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS settlement_source  TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS oracle             TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags               TEXT[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS base_yes_pts       SMALLINT     DEFAULT NULL
    CHECK (base_yes_pts IS NULL OR (base_yes_pts BETWEEN 1 AND 99)),
  ADD COLUMN IF NOT EXISTS sort_order         INT          DEFAULT 0;

-- ── 2. Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_markets_category
  ON markets (market_category);

CREATE INDEX IF NOT EXISTS idx_markets_insurance_category
  ON markets (insurance_category)
  WHERE insurance_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_markets_maturity_date
  ON markets (maturity_date)
  WHERE maturity_date IS NOT NULL;

-- ── 3. Insurance category catalogue ───────────────────────────
CREATE TABLE IF NOT EXISTS insurance_categories (
  slug              VARCHAR(30)  PRIMARY KEY,
  icon              VARCHAR(10)  NOT NULL,
  title             VARCHAR(100) NOT NULL,
  description       TEXT         NOT NULL,
  question_template TEXT         NOT NULL,   -- {date} replaced at runtime
  condition_name    VARCHAR(255) NOT NULL,
  settlement_source TEXT         NOT NULL,
  oracle            TEXT         NOT NULL DEFAULT 'GameFix Resolution Council',
  base_yes_pts      SMALLINT     NOT NULL CHECK (base_yes_pts BETWEEN 1 AND 99),
  max_yes_pts       SMALLINT     NOT NULL CHECK (max_yes_pts BETWEEN 1 AND 99),
  curve_shape       VARCHAR(10)  NOT NULL DEFAULT 'slow'
                                          CHECK (curve_shape IN ('slow','fast','linear')),
  tags              TEXT[]       NOT NULL DEFAULT '{}',
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 4. Seed catalogue ──────────────────────────────────────────
INSERT INTO insurance_categories
  (slug, icon, title, description, question_template, condition_name,
   settlement_source, oracle, base_yes_pts, max_yes_pts, curve_shape, tags)
VALUES
  ('life', '🫀', 'Life',
   'Survival, mortality, and longevity contracts written on synthetic cohorts across defined maturity dates.',
   'Will a clinically approved cure for paralysis be publicly available by {date}?',
   'Paralysis Cure',
   'FDA / EMA / MHRA public approval registry',
   'GameFix Resolution Council + 3-oracle quorum',
   2, 28, 'slow',
   ARRAY['Survival','Cohort mortality','Longevity','Cure by date']),

  ('health', '🏥', 'Health',
   'Diagnosis, hospitalisation, and recovery event markets across standardised risk cohorts.',
   'Will UK A&E waiting times exceed 12 h average nationally by {date}?',
   'A&E Wait Threshold',
   'NHS England weekly A&E statistics',
   'GameFix Resolution Council',
   8, 62, 'fast',
   ARRAY['Diagnosis by date','Hospitalisation','Recovery']),

  ('climate', '🌧️', 'Climate / Catastrophe',
   'Weather-triggered and natural catastrophe event markets: hurricane, flood, rainfall, and wind thresholds.',
   'Will a Category 4+ hurricane make US mainland landfall by {date}?',
   'Cat-4+ US Landfall',
   'NOAA National Hurricane Center best-track data',
   'GameFix Resolution Council',
   4, 72, 'fast',
   ARRAY['Hurricane','Flood','Rainfall','Temperature']),

  ('agriculture', '🌾', 'Agriculture',
   'Crop yield failure, rainfall shortfall, and seasonal threshold contracts by region and crop type.',
   'Will UK wheat yield fall below 7.5 t/ha nationally by {date}?',
   'UK Wheat Yield Shortfall',
   'AHDB / DEFRA final harvest estimate',
   'GameFix Resolution Council',
   5, 38, 'linear',
   ARRAY['Crop yield','Rainfall shortfall','Seasonal']),

  ('liability', '⚖️', 'Liability',
   'Claim filing, judgment, and loss-threshold contracts referenced to industry cohorts and policy pools.',
   'Will aggregate UK auto liability claims exceed £500M by {date}?',
   'UK Auto Liability Threshold',
   'Association of British Insurers (ABI) motor statistics',
   'GameFix Resolution Council',
   3, 44, 'slow',
   ARRAY['Claim filed','Judgment by date','Loss threshold']),

  ('travel', '✈️', 'Travel',
   'Flight delay, cancellation, and disruption event markets across routes and time windows.',
   'Will LHR-JFK cancellation rate exceed 15% weekly by {date}?',
   'LHR-JFK Cancellation Rate',
   'FlightAware / OAG scheduled vs. operated data',
   'GameFix Resolution Council',
   6, 55, 'fast',
   ARRAY['Flight delay','Cancellation','Route disruption'])
ON CONFLICT (slug) DO UPDATE
  SET icon              = EXCLUDED.icon,
      title             = EXCLUDED.title,
      description       = EXCLUDED.description,
      question_template = EXCLUDED.question_template,
      condition_name    = EXCLUDED.condition_name,
      settlement_source = EXCLUDED.settlement_source,
      oracle            = EXCLUDED.oracle,
      base_yes_pts      = EXCLUDED.base_yes_pts,
      max_yes_pts       = EXCLUDED.max_yes_pts,
      curve_shape       = EXCLUDED.curve_shape,
      tags              = EXCLUDED.tags,
      updated_at        = NOW();

-- ── 5. updated_at trigger for insurance_categories ─────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_insurance_categories_updated_at ON insurance_categories;
CREATE TRIGGER update_insurance_categories_updated_at
  BEFORE UPDATE ON insurance_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 6. FK constraint: markets.insurance_category → catalogue ──
-- (allows NULL for prediction markets)
ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS fk_markets_insurance_category;

ALTER TABLE markets
  ADD CONSTRAINT fk_markets_insurance_category
  FOREIGN KEY (insurance_category)
  REFERENCES insurance_categories (slug)
  ON UPDATE CASCADE ON DELETE SET NULL;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'markets'
ORDER BY ordinal_position;

SELECT slug, title, base_yes_pts, max_yes_pts, curve_shape FROM insurance_categories ORDER BY slug;
