# Logging Configuration

## Overview

All services use the centralized `Logger` class from `@betting-exchange/shared-config` for consistent logging across the platform.

## Log Levels

The following log levels are available (in order of priority):

1. **DEBUG** - Detailed diagnostic information
2. **INFO** - General informational messages (default)
3. **WARN** - Warning messages for potentially harmful situations
4. **ERROR** - Error messages for serious problems

## Configuration

### Setting Log Level

Control the minimum log level via the `LOG_LEVEL` environment variable:

```bash
# .env or environment variables
LOG_LEVEL=debug   # Show all logs (debug, info, warn, error)
LOG_LEVEL=info    # Show info, warn, error (default)
LOG_LEVEL=warn    # Show warn, error only
LOG_LEVEL=error   # Show error only
```

### Disabling All Logs

To completely disable logging across all services (useful for performance testing or production):

```bash
# .env or environment variables
DISABLE_LOGS=true
```

When `DISABLE_LOGS=true`, no logs will be output regardless of the `LOG_LEVEL` setting.

## Service-Specific Configuration

Each service respects these environment variables:

- **API Gateway**: Reads from `.env` or Docker environment
- **Matching Engine**: Reads from process environment
- **Wallet Service**: Reads from process environment
- **Market Data**: Reads from process environment
- **Settlement Service**: Reads from process environment

## Examples

### Development (Verbose)
```bash
LOG_LEVEL=debug
DISABLE_LOGS=false  # or omit (default)
```

### Production (Minimal)
```bash
LOG_LEVEL=warn
DISABLE_LOGS=false
```

### Performance Testing (No Logs)
```bash
DISABLE_LOGS=true
```

## Docker Compose

The logging configuration is automatically picked up from `.env` file when using docker-compose:

```yaml
# In your .env file
LOG_LEVEL=info
DISABLE_LOGS=false
```

## Programmatic Usage

Services using the shared logger automatically respect these settings:

```typescript
import { createLogger } from '@betting-exchange/shared-config';

const logger = createLogger('MyService', process.env.LOG_LEVEL);

logger.debug('Detailed debug info');  // Only shown if LOG_LEVEL=debug
logger.info('General information');   // Shown if LOG_LEVEL=info or debug
logger.warn('Warning message');       // Shown if LOG_LEVEL=warn, info, or debug
logger.error('Error occurred', err);  // Always shown unless DISABLE_LOGS=true
```

## Recently Re-enabled Services

The following services had logs disabled and are now re-enabled:

- ✅ **Wallet Service** - Now uses shared logger with configurable levels
- ✅ All services respect `DISABLE_LOGS` toggle

## Troubleshooting

If logs aren't appearing:

1. Check `DISABLE_LOGS` is not set to `true`
2. Verify `LOG_LEVEL` is set correctly (default: `info`)
3. Restart services after changing environment variables
4. For wallet service, ensure it's using the rebuilt version with new logger

## Quick Toggle Commands

### Linux/Mac (Bash)
```bash
# Enable all logs (verbose)
export DISABLE_LOGS=false
export LOG_LEVEL=debug

# Disable all logs
export DISABLE_LOGS=true

# Production-safe logging
export DISABLE_LOGS=false
export LOG_LEVEL=warn
```

### Windows (PowerShell)
```powershell
# Enable all logs (verbose)
$env:DISABLE_LOGS="false"
$env:LOG_LEVEL="debug"

# Disable all logs
$env:DISABLE_LOGS="true"

# Production-safe logging
$env:DISABLE_LOGS="false"
$env:LOG_LEVEL="warn"
```

### Permanent Configuration (All Platforms)

Instead of setting environment variables in the terminal, add them to your `.env` file:

```bash
# In .env file at project root
LOG_LEVEL=debug
DISABLE_LOGS=false
```

Then restart your services.
