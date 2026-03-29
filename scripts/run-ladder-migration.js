// Run ladder migration + insert market_groups + assign child markets
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:postgres@localhost:5432/betting_exchange';

async function run() {
  const client = new Client(DB_URL);
  await client.connect();
  console.log('Connected to database');

  // ── Step 1: Create ladder tables ──
  console.log('\n=== Step 1: Creating ladder tables ===');
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS market_groups (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug          TEXT NOT NULL UNIQUE,
      title         TEXT NOT NULL,
      group_type    TEXT NOT NULL DEFAULT 'ladder',
      event_key     TEXT,
      category      TEXT,
      description   TEXT,
      resolution_source TEXT,
      oracle_spec   JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ market_groups table created');

  await client.query(`
    CREATE TABLE IF NOT EXISTS event_resolutions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      market_group_id UUID NOT NULL REFERENCES market_groups(id),
      occurred_at     TIMESTAMPTZ NOT NULL,
      resolved_by     UUID,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ event_resolutions table created');

  await client.query(`
    CREATE TABLE IF NOT EXISTS synthetic_orders (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      market_group_id UUID NOT NULL REFERENCES market_groups(id),
      user_id         UUID NOT NULL,
      direction       TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
      lower_date      TIMESTAMPTZ NOT NULL,
      upper_date      TIMESTAMPTZ NOT NULL,
      contracts       BIGINT NOT NULL,
      premium_cents   BIGINT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ synthetic_orders table created');

  await client.query(`
    CREATE TABLE IF NOT EXISTS synthetic_order_legs (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      synthetic_order_id UUID NOT NULL REFERENCES synthetic_orders(id),
      market_id         UUID NOT NULL REFERENCES markets(id),
      side              TEXT NOT NULL CHECK (side IN ('YES','NO')),
      order_id          UUID,
      fill_price        BIGINT,
      fill_qty          BIGINT,
      status            TEXT NOT NULL DEFAULT 'pending',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  ✓ synthetic_order_legs table created');

  // Add columns to markets table (IF NOT EXISTS via DO blocks)
  const columnsToAdd = [
    { name: 'market_group_id', type: 'UUID REFERENCES market_groups(id)' },
    { name: 'contract_type', type: "TEXT DEFAULT 'standalone'" },
    { name: 'sort_key', type: 'BIGINT DEFAULT 0' },
    { name: 'instrument_symbol', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE markets ADD COLUMN ${col.name} ${col.type};
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log(`  ✓ markets.${col.name} column ensured`);
  }

  // Create indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_markets_group_id ON markets(market_group_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_markets_group_sort ON markets(market_group_id, sort_key);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_mg_slug ON market_groups(slug);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_er_group ON event_resolutions(market_group_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_so_group ON synthetic_orders(market_group_id, user_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sol_order ON synthetic_order_legs(synthetic_order_id);`);
  console.log('  ✓ All indexes created');

  // ── Step 2: Insert market_groups for each insurance category ──
  console.log('\n=== Step 2: Inserting market_groups for insurance categories ===');

  const groups = [
    {
      slug: 'life',
      title: 'Paralysis Cure by Date',
      event_key: 'insurance_life',
      category: 'INSURANCE',
      description: 'Probability of paralysis cure approval by each maturity date',
      resolution_source: 'FDA / WHO approval announcement',
    },
    {
      slug: 'health',
      title: 'A&E Wait Time Breach by Date',
      event_key: 'insurance_health',
      category: 'INSURANCE',
      description: 'Probability of A&E 4-hour wait time breach by each maturity date',
      resolution_source: 'NHS England A&E statistics',
    },
    {
      slug: 'climate',
      title: 'Cat-4+ Hurricane by Date',
      event_key: 'insurance_climate',
      category: 'INSURANCE',
      description: 'Probability of Category 4+ hurricane making US landfall by each maturity date',
      resolution_source: 'NOAA / NHC official reports',
    },
    {
      slug: 'agriculture',
      title: 'Wheat Yield Shortfall by Date',
      event_key: 'insurance_agriculture',
      category: 'INSURANCE',
      description: 'Probability of wheat yield dropping below 3.2 tonnes/ha by each maturity date',
      resolution_source: 'USDA NASS crop reports',
    },
    {
      slug: 'liability',
      title: 'Auto Claims Surge by Date',
      event_key: 'insurance_liability',
      category: 'INSURANCE',
      description: 'Probability of auto claims exceeding 120% of baseline by each maturity date',
      resolution_source: 'Insurance industry claims data',
    },
    {
      slug: 'travel',
      title: 'LHR-JFK Cancellations Spike by Date',
      event_key: 'insurance_travel',
      category: 'INSURANCE',
      description: 'Probability of LHR-JFK cancellation rate exceeding 15% by each maturity date',
      resolution_source: 'FAA / Eurocontrol flight data',
    },
  ];

  for (const g of groups) {
    const res = await client.query(
      `INSERT INTO market_groups (slug, title, group_type, event_key, category, description, resolution_source)
       VALUES ($1, $2, 'ladder', $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, resolution_source = EXCLUDED.resolution_source
       RETURNING id, slug`,
      [g.slug, g.title, g.event_key, g.category, g.description, g.resolution_source]
    );
    console.log(`  ✓ market_group '${res.rows[0].slug}' → ${res.rows[0].id}`);
  }

  // ── Step 3: Assign child markets to groups ──
  console.log('\n=== Step 3: Assigning child markets to ladder groups ===');

  const updateResult = await client.query(`
    UPDATE markets m
    SET market_group_id = mg.id,
        contract_type = 'maturity',
        sort_key = COALESCE(m.sort_order, 0)
    FROM market_groups mg
    WHERE m.market_category = 'INSURANCE'
      AND m.insurance_category IS NOT NULL
      AND mg.slug = m.insurance_category
    RETURNING m.id, m.insurance_category, m.question
  `);
  console.log(`  ✓ Updated ${updateResult.rowCount} markets with market_group_id`);
  if (updateResult.rowCount > 0) {
    for (const row of updateResult.rows.slice(0, 10)) {
      console.log(`    - [${row.insurance_category}] ${row.question}`);
    }
    if (updateResult.rowCount > 10) {
      console.log(`    ... and ${updateResult.rowCount - 10} more`);
    }
  }

  // ── Verify ──
  console.log('\n=== Verification ===');
  const groupCounts = await client.query(`
    SELECT mg.slug, mg.title, COUNT(m.id) as market_count
    FROM market_groups mg
    LEFT JOIN markets m ON m.market_group_id = mg.id
    GROUP BY mg.slug, mg.title
    ORDER BY mg.slug
  `);
  console.log('Market groups and their child market counts:');
  for (const row of groupCounts.rows) {
    console.log(`  ${row.slug}: ${row.title} → ${row.market_count} markets`);
  }

  await client.end();
  console.log('\n✅ Migration complete!');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
