const { Client } = require('pg');

async function clearAllData() {
    const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'betting_exchange',
        user: 'betting_user',
        password: 'betting123',
    });

    try {
        await client.connect();
        console.log('Connected to database');

        await client.query('BEGIN');
        
        // Delete all data in correct order (respecting foreign keys)
        await client.query('DELETE FROM trades');
        console.log('Deleted all trades');
        
        await client.query('DELETE FROM position_lots');
        console.log('Deleted all position_lots');
        
        await client.query('DELETE FROM orders');
        console.log('Deleted all orders');
        
        await client.query('DELETE FROM fee_revenue');
        console.log('Deleted all fee_revenue');
        
        await client.query('COMMIT');
        console.log('Transaction committed');

        // Verify
        const ordersResult = await client.query('SELECT COUNT(*) FROM orders');
        const tradesResult = await client.query('SELECT COUNT(*) FROM trades');
        const positionLotsResult = await client.query('SELECT COUNT(*) FROM position_lots');
        
        console.log(`\n✅ Database cleared successfully!`);
        console.log(`Remaining orders: ${ordersResult.rows[0].count}`);
        console.log(`Remaining trades: ${tradesResult.rows[0].count}`);
        console.log(`Remaining position_lots: ${positionLotsResult.rows[0].count}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        try {
            await client.end();
        } catch (endError) {
            // Ignore cleanup errors
        }
    }
}

clearAllData();
