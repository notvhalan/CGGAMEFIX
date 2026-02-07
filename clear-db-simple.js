const { Client } = require('pg');

async function clearAllData() {
    const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'betting_exchange',
        user: 'postgres',
        password: 'postgres',
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // Delete in one transaction
        const result = await client.query(`
            BEGIN;
            DELETE FROM trades;
            DELETE FROM position_lots;
            DELETE FROM orders;
            DELETE FROM fee_revenue;
            COMMIT;
        `);
        
        console.log('✅ All data deleted successfully!');
        
        // Quick exit without cleanup
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

clearAllData();
