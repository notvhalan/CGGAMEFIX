// Add many subcategories (condition_names) across all 6 insurance categories
// Each subcategory gets 6 maturity contracts (1 mo, 2 mo, 3 mo, 6 mo, 9 mo, 12 mo)
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres:postgres@localhost:5432/betting_exchange';

/* ── Subcategories per category ──────────────────────────────────────────── */
const SUBCATEGORIES = {
  life: [
    // Keep existing one, add more
    {
      conditionName: 'Paralysis Cure',
      question: (d) => `Will a clinically approved cure for paralysis be publicly available by ${d}?`,
      name: (d) => `Paralysis Cure · ${d}`,
      baseYes: 5,
    },
    {
      conditionName: 'Alzheimer\'s Breakthrough',
      question: (d) => `Will an FDA-approved disease-modifying Alzheimer's treatment achieve >50% efficacy by ${d}?`,
      name: (d) => `Alzheimer's Treatment · ${d}`,
      baseYes: 8,
    },
    {
      conditionName: 'Cancer Mortality Rate',
      question: (d) => `Will global cancer mortality drop below 8 million annually by ${d}?`,
      name: (d) => `Cancer Mortality Rate · ${d}`,
      baseYes: 4,
    },
    {
      conditionName: 'Life Expectancy Milestone',
      question: (d) => `Will average life expectancy in developed nations exceed 85 years by ${d}?`,
      name: (d) => `Life Expectancy Milestone · ${d}`,
      baseYes: 6,
    },
    {
      conditionName: 'Gene Therapy Approval',
      question: (d) => `Will a single-injection gene therapy for a hereditary disease gain FDA approval by ${d}?`,
      name: (d) => `Gene Therapy FDA Approval · ${d}`,
      baseYes: 15,
    },
    {
      conditionName: 'Antibiotic Resistance Crisis',
      question: (d) => `Will WHO declare a global antibiotic resistance emergency by ${d}?`,
      name: (d) => `Antibiotic Resistance Crisis · ${d}`,
      baseYes: 12,
    },
  ],

  health: [
    {
      conditionName: 'A&E Wait Threshold',
      question: (d) => `Will UK A&E waiting times exceed 12h average nationally by ${d}?`,
      name: (d) => `A&E Wait Threshold · ${d}`,
      baseYes: 18,
    },
    {
      conditionName: 'NHS Waiting List',
      question: (d) => `Will NHS England waiting list exceed 8 million patients by ${d}?`,
      name: (d) => `NHS Waiting List · ${d}`,
      baseYes: 22,
    },
    {
      conditionName: 'Pandemic Declaration',
      question: (d) => `Will WHO declare a new pandemic (non-COVID) by ${d}?`,
      name: (d) => `New Pandemic Declaration · ${d}`,
      baseYes: 7,
    },
    {
      conditionName: 'Flu Season Severity',
      question: (d) => `Will UK flu hospitalizations exceed 50,000 in a single week by ${d}?`,
      name: (d) => `Flu Season Severity · ${d}`,
      baseYes: 14,
    },
    {
      conditionName: 'Mental Health Crisis',
      question: (d) => `Will UK IAPT referrals exceed 2 million annually by ${d}?`,
      name: (d) => `Mental Health Crisis · ${d}`,
      baseYes: 25,
    },
  ],

  climate: [
    {
      conditionName: 'Cat-4+ US Landfall',
      question: (d) => `Will a Category 4+ hurricane make US mainland landfall by ${d}?`,
      name: (d) => `Cat-4+ US Landfall · ${d}`,
      baseYes: 10,
    },
    {
      conditionName: 'Global Temperature Record',
      question: (d) => `Will global mean temperature exceed 1.5°C above pre-industrial levels by ${d}?`,
      name: (d) => `Global Temp Record · ${d}`,
      baseYes: 30,
    },
    {
      conditionName: 'Arctic Ice Minimum',
      question: (d) => `Will Arctic sea ice extent hit a record minimum (<3M km²) by ${d}?`,
      name: (d) => `Arctic Ice Record Min · ${d}`,
      baseYes: 15,
    },
    {
      conditionName: 'UK Flooding Event',
      question: (d) => `Will the UK experience a 1-in-100-year flood event by ${d}?`,
      name: (d) => `UK Major Flood · ${d}`,
      baseYes: 12,
    },
    {
      conditionName: 'Wildfire Carbon Emissions',
      question: (d) => `Will global wildfire CO₂ emissions exceed 8 Gt in a calendar year by ${d}?`,
      name: (d) => `Wildfire Carbon Surge · ${d}`,
      baseYes: 9,
    },
    {
      conditionName: 'European Heatwave',
      question: (d) => `Will a European heatwave exceed 48°C anywhere on the continent by ${d}?`,
      name: (d) => `European Heatwave Record · ${d}`,
      baseYes: 11,
    },
  ],

  agriculture: [
    {
      conditionName: 'UK Wheat Yield Shortfall',
      question: (d) => `Will UK wheat yield fall below 7.5 t/ha nationally by ${d}?`,
      name: (d) => `UK Wheat Yield Shortfall · ${d}`,
      baseYes: 10,
    },
    {
      conditionName: 'Global Food Price Spike',
      question: (d) => `Will the FAO Food Price Index exceed 160 points by ${d}?`,
      name: (d) => `Global Food Price Spike · ${d}`,
      baseYes: 18,
    },
    {
      conditionName: 'US Corn Harvest Failure',
      question: (d) => `Will US corn production fall more than 20% below the 5-year average by ${d}?`,
      name: (d) => `US Corn Harvest Failure · ${d}`,
      baseYes: 7,
    },
    {
      conditionName: 'Coffee Price Surge',
      question: (d) => `Will Arabica coffee futures exceed $4.00/lb by ${d}?`,
      name: (d) => `Coffee Price Surge · ${d}`,
      baseYes: 14,
    },
    {
      conditionName: 'Livestock Disease Outbreak',
      question: (d) => `Will a major livestock disease outbreak (bird flu/swine fever) hit 3+ EU nations by ${d}?`,
      name: (d) => `Livestock Disease Outbreak · ${d}`,
      baseYes: 16,
    },
  ],

  liability: [
    {
      conditionName: 'UK Auto Liability Threshold',
      question: (d) => `Will aggregate UK auto liability claims exceed £500M by ${d}?`,
      name: (d) => `UK Auto Liability Threshold · ${d}`,
      baseYes: 12,
    },
    {
      conditionName: 'Cyber Breach Payout',
      question: (d) => `Will a single cyber insurance claim exceed £100M in the UK by ${d}?`,
      name: (d) => `Mega Cyber Breach Payout · ${d}`,
      baseYes: 8,
    },
    {
      conditionName: 'D&O Class Action',
      question: (d) => `Will a FTSE 100 company face a D&O class action settlement >£200M by ${d}?`,
      name: (d) => `D&O Class Action · ${d}`,
      baseYes: 6,
    },
    {
      conditionName: 'Product Recall',
      question: (d) => `Will a global product recall exceed 10 million units in a single incident by ${d}?`,
      name: (d) => `Major Product Recall · ${d}`,
      baseYes: 15,
    },
    {
      conditionName: 'Environmental Liability',
      question: (d) => `Will an environmental liability judgment exceed £500M against a UK company by ${d}?`,
      name: (d) => `Environmental Liability · ${d}`,
      baseYes: 5,
    },
  ],

  travel: [
    {
      conditionName: 'LHR-JFK Cancellation Rate',
      question: (d) => `Will LHR–JFK cancellation rate exceed 15% weekly by ${d}?`,
      name: (d) => `LHR–JFK Cancellations · ${d}`,
      baseYes: 10,
    },
    {
      conditionName: 'Airline Bankruptcy',
      question: (d) => `Will a major European airline (>30M pax/yr) file for bankruptcy by ${d}?`,
      name: (d) => `Major Airline Bankruptcy · ${d}`,
      baseYes: 6,
    },
    {
      conditionName: 'UK Airport Closure',
      question: (d) => `Will a UK top-5 airport close for >48 hours due to weather/strike by ${d}?`,
      name: (d) => `UK Airport Major Closure · ${d}`,
      baseYes: 14,
    },
    {
      conditionName: 'Cruise Ship Incident',
      question: (d) => `Will a major cruise ship incident (grounding/fire/health) affect >1,000 passengers by ${d}?`,
      name: (d) => `Cruise Ship Incident · ${d}`,
      baseYes: 9,
    },
    {
      conditionName: 'Global Travel Ban',
      question: (d) => `Will 5+ G7 nations simultaneously impose travel bans on any country by ${d}?`,
      name: (d) => `Global Travel Ban · ${d}`,
      baseYes: 7,
    },
  ],
};

// 6 maturity offsets: 1 mo, 2 mo, 3 mo, 6 mo, 9 mo, 12 mo
const MATURITY_OFFSETS_DAYS = [30, 60, 90, 180, 270, 365];

async function run() {
  const client = new Client(DB_URL);
  await client.connect();
  console.log('Connected to database\n');

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const [category, subcats] of Object.entries(SUBCATEGORIES)) {
    console.log(`\n── ${category.toUpperCase()} ──────────────────────────────────────`);

    for (const sub of subcats) {
      // Check if contracts already exist for this condition_name in this category
      const existing = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM markets
         WHERE market_category = 'INSURANCE'
           AND insurance_category = $1
           AND condition_name = $2`,
        [category, sub.conditionName]
      );

      if (existing.rows[0].cnt > 0) {
        console.log(`  ⏭  "${sub.conditionName}" — ${existing.rows[0].cnt} contracts already exist, skipping`);
        totalSkipped += existing.rows[0].cnt;
        continue;
      }

      const created = [];
      for (let i = 0; i < MATURITY_OFFSETS_DAYS.length; i++) {
        const days = MATURITY_OFFSETS_DAYS[i];
        const maturity = new Date('2026-03-29');
        maturity.setDate(maturity.getDate() + days);
        const maturityStr = maturity.toISOString();
        const dateLabel = maturity.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const shortDate = maturity.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

        // Scale base YES probability with maturity
        const t = days / 365;
        const yesPts = Math.min(95, Math.max(1, Math.round(sub.baseYes + (sub.baseYes * 1.8) * t)));

        const name = sub.name(shortDate);
        const question = sub.question(dateLabel);

        const result = await client.query(
          `INSERT INTO markets (
             name, description, type, status, event_id, outcomes,
             start_time, end_time, min_stake, max_stake,
             market_category, insurance_category, condition_name, question,
             maturity_date, settlement_source, oracle, base_yes_pts, sort_order
           ) VALUES (
             $1, $2, 'BINARY', 'ACTIVE', uuid_generate_v4(), '{YES,NO}',
             NOW(), $3::timestamptz, 1.00, 1000.00,
             'INSURANCE', $4, $5, $6,
             $3::timestamptz, 'GameFix Resolution Council', 'GameFix Resolution Council + 3-oracle quorum',
             $7, $8
           ) RETURNING id`,
          [name, question, maturityStr, category, sub.conditionName, question, yesPts, i + 1]
        );
        created.push(result.rows[0].id);
      }

      console.log(`  ✓ "${sub.conditionName}" — created ${created.length} contracts`);
      totalCreated += created.length;
    }
  }

  // ── Assign all new markets to ladder groups ──
  console.log('\n\n── Assigning new markets to ladder groups ──');
  const updateResult = await client.query(`
    UPDATE markets m
    SET market_group_id = mg.id,
        contract_type = 'maturity',
        sort_key = COALESCE(m.sort_order, 0)
    FROM market_groups mg
    WHERE m.market_category = 'INSURANCE'
      AND m.insurance_category IS NOT NULL
      AND mg.slug = m.insurance_category
      AND m.market_group_id IS NULL
    RETURNING m.id, m.insurance_category, m.condition_name
  `);
  console.log(`  ✓ Assigned ${updateResult.rowCount} new markets to ladder groups`);

  // ── Summary ──
  console.log('\n\n── Summary ──');
  console.log(`  Created:  ${totalCreated} new contracts`);
  console.log(`  Skipped:  ${totalSkipped} (already existed)`);

  const summary = await client.query(`
    SELECT m.insurance_category AS cat,
           m.condition_name,
           COUNT(*) AS cnt
    FROM markets m
    WHERE m.market_category = 'INSURANCE'
    GROUP BY m.insurance_category, m.condition_name
    ORDER BY m.insurance_category, m.condition_name
  `);

  console.log('\n── All subcategories ──');
  let currentCat = '';
  for (const row of summary.rows) {
    if (row.cat !== currentCat) {
      currentCat = row.cat;
      console.log(`\n  ${currentCat.toUpperCase()}`);
    }
    console.log(`    ${row.condition_name}: ${row.cnt} contracts`);
  }

  await client.end();
  console.log('\n✅ Done!');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
