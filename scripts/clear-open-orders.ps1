# Clear open orders and return reserved balances
# Run this with: powershell -ExecutionPolicy Bypass -File .\scripts\clear-open-orders.ps1

$connectionString = "Host=localhost;Port=5432;Database=betting_exchange;Username=postgres;Password=postgres"

# Load Npgsql assembly (assuming it's installed with .NET SDK)
Add-Type -Path "C:\Program Files\dotnet\shared\Microsoft.NETCore.App\*\System.Data.dll" -ErrorAction SilentlyContinue

# Create connection
$connection = New-Object Npgsql.NpgsqlConnection($connectionString)

try {
    $connection.Open()
    Write-Host "Connected to database"
    
    # Start transaction
    $transaction = $connection.BeginTransaction()
    
    # Count orders before
    $cmd = $connection.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM orders WHERE status = 'OPEN'"
    $cmd.Transaction = $transaction
    $countBefore = $cmd.ExecuteScalar()
    Write-Host "Found $countBefore open orders"
    
    # Create temp table with reserved amounts
    $cmd.CommandText = @"
CREATE TEMP TABLE user_reserves AS
SELECT user_id, SUM(liability_pence) as total_reserved
FROM orders
WHERE status = 'OPEN'
GROUP BY user_id
"@
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "Created temp table with user reserves"
    
    # Return reserved amounts to available balance
    $cmd.CommandText = @"
UPDATE wallets w
SET pence_reserved = pence_reserved - ur.total_reserved,
    pence_available = pence_available + ur.total_reserved
FROM user_reserves ur
WHERE w.user_id = ur.user_id
"@
    $affected = $cmd.ExecuteNonQuery()
    Write-Host "Updated $affected user wallets"
    
    # Delete all open orders
    $cmd.CommandText = "DELETE FROM orders WHERE status = 'OPEN'"
    $deleted = $cmd.ExecuteNonQuery()
    Write-Host "Deleted $deleted open orders"
    
    # Commit transaction
    $transaction.Commit()
    Write-Host "✅ Successfully cleared all open orders and returned reserved balances"
    
    # Verify cleanup
    $cmd.CommandText = "SELECT COUNT(*) FROM orders WHERE status = 'OPEN'"
    $countAfter = $cmd.ExecuteScalar()
    Write-Host "Remaining open orders: $countAfter"
    
    $cmd.CommandText = "SELECT COALESCE(SUM(pence_reserved), 0) FROM wallets"
    $totalReserved = $cmd.ExecuteScalar()
    Write-Host "Total reserved pence: $totalReserved"
    
} catch {
    if ($transaction) {
        $transaction.Rollback()
        Write-Host "❌ Transaction rolled back due to error"
    }
    Write-Error "Error: $_"
} finally {
    $connection.Close()
    Write-Host "Connection closed"
}
