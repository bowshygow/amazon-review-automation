# Database Configuration Guide

This guide explains how to configure the database connection for the Amazon Review Automation application, with special focus on Supabase integration.

## Overview

The application uses Prisma ORM with PostgreSQL and is optimized for Supabase hosting. The configuration includes:

- **Connection Pooling**: Uses PgBouncer for efficient connection management
- **Dual Connection Strategy**: Separate URLs for queries and migrations
- **Prepared Statement Handling**: Automatic conflict resolution
- **Connection Limits**: Optimized for serverless environments

## Environment Variables

### Required Variables

```env
# Database Configuration
DB_HOST=your-database-host
DB_PORT=5432
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_NAME=your_database_name
```

### Supabase Configuration

For Supabase, use these settings:

```env
# Supabase Pooler (for queries)
DB_HOST=aws-0-us-east-1.pooler.supabase.com
DB_PORT=6543
DB_USERNAME=postgres.your-project-ref
DB_PASSWORD=your-password
DB_NAME=postgres

# The application automatically generates:
# DATABASE_URL=postgresql://postgres.your-project-ref:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=20&statement_timeout=30000&idle_in_transaction_session_timeout=30000&application_name=amazon-review-automation
# DIRECT_URL=postgresql://postgres.your-project-ref:password@db.your-project-ref.supabase.co:5432/postgres?connection_limit=1&pool_timeout=20&statement_timeout=30000&application_name=amazon-review-automation-migrations
```

### Optional Override

You can override the auto-generated URLs if needed:

```env
# Override auto-generated URLs
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true&connection_limit=10
DIRECT_URL=postgresql://user:password@host:port/database?connection_limit=1
```

## Connection Strategy

### 1. Pooled Connection (DATABASE_URL)
- Used for all application queries
- Connects through PgBouncer (Supabase pooler)
- Optimized for concurrent requests
- Connection limit: 10
- Pool timeout: 20 seconds

### 2. Direct Connection (DIRECT_URL)
- Used for Prisma migrations
- Bypasses connection pooling
- Single connection for schema changes
- Connection limit: 1
- Pool timeout: 20 seconds

## Prepared Statement Handling

The application automatically handles prepared statement conflicts that can occur with connection pooling:

### Automatic Resolution
- Detects prepared statement errors (s0, s1, s2, etc.)
- Automatically recreates Prisma client
- Retries failed operations
- Logs connection resets for monitoring

### Error Patterns Detected
- `prepared statement "s0" already exists`
- `prepared statement "s1" already exists`
- Connection timeouts
- Pool exhaustion

## Testing Connection

Run the connection test to verify your configuration:

```bash
# Test basic connection
node scripts/test-connection.js

# Test Supabase-specific configuration
node scripts/test-supabase-connection.js
```

## Troubleshooting

### Common Issues

1. **Prepared Statement Conflicts**
   ```
   ERROR: prepared statement "s0" already exists
   ```
   - **Solution**: The application automatically handles this. If persistent, restart the application.

2. **Connection Timeouts**
   ```
   Connection timeout after 20 seconds
   ```
   - **Solution**: Check your database is accessible and connection limits are appropriate.

3. **Migration Failures**
   ```
   Prisma Migrate failed to connect
   ```
   - **Solution**: Ensure DIRECT_URL is properly configured for direct database access.

### Debugging

Enable debug logging by setting:

```env
NODE_ENV=development
```

This will show detailed connection logs including:
- Connection attempts
- Prepared statement cleanup
- Client recreation events
- Health check results

## Performance Optimization

### Connection Limits
- **Application**: 10 concurrent connections
- **Migrations**: 1 connection
- **Pool Timeout**: 20 seconds
- **Statement Timeout**: 30 seconds

### Best Practices
1. Use connection pooling for production
2. Keep connection limits reasonable
3. Monitor connection usage
4. Use separate URLs for queries and migrations
5. Enable PgBouncer compatibility for Supabase

## Monitoring

The application provides connection monitoring:

```javascript
import { getConnectionInfo, getQueryStats } from '$lib/db/config/prisma';

// Get connection pool status
const connectionInfo = await getConnectionInfo();

// Get query performance stats
const queryStats = await getQueryStats();
```

## Security Considerations

1. **Environment Variables**: Never commit database credentials to version control
2. **Connection Encryption**: Use SSL for production connections
3. **Connection Limits**: Prevent connection exhaustion attacks
4. **Application Name**: Set unique application names for monitoring

## Migration from Other Databases

### From Standard PostgreSQL
1. Update environment variables
2. Run connection tests
3. Verify migrations work with DIRECT_URL
4. Monitor for prepared statement conflicts

### From Other ORMs
1. Export schema using Prisma introspection
2. Configure connection URLs
3. Test all database operations
4. Update application code to use Prisma Client
