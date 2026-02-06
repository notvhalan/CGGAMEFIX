-- Reset market 550e8400-e29b-41d4-a716-446655440001 back to ACTIVE
-- Use this when a settlement fails and the market needs to be re-settled

UPDATE markets 
SET status = 'ACTIVE',
    settlement_time = NULL,
    updated_at = NOW()
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- Verify the change
SELECT id, name, status, settlement_time 
FROM markets 
WHERE id = '550e8400-e29b-41d4-a716-446655440001';
