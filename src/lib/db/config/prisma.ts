import { PrismaClient } from '@prisma/client';
import './database-url'; // Import to set DATABASE_URL environment variable

declare global {
  var __prisma: PrismaClient | undefined;
}

// Enhanced Prisma client configuration following best practices
export const prisma = globalThis.__prisma || new PrismaClient({
  // Logging configuration
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn', 'info'] 
    : ['error', 'warn'],
  
  // Error formatting for better debugging
  errorFormat: 'pretty',
  
  // Connection management with better pooling
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  
  // Connection pool configuration optimized for prepared statements
  __internal: {
    engine: {
      connectionLimit: 5, // Reduced from 10 to avoid connection exhaustion
      pool: {
        min: 1,
        max: 5,
        acquireTimeoutMillis: 60000, // Increased timeout
        createTimeoutMillis: 60000,
        destroyTimeoutMillis: 10000,
        idleTimeoutMillis: 60000, // Increased idle timeout
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 500, // Increased retry interval
        // Add prepared statement handling
        statementCacheSize: 0, // Disable statement caching to avoid prepared statement issues
      }
    }
  }
});

// Connection pooling and health checks
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Enhanced connection reset with better error handling
export async function resetConnection() {
  try {
    console.log('Resetting Prisma connection...');
    await prisma.$disconnect();
    // Wait longer for connections to close properly
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    console.log('Prisma connection reset completed');
  } catch (error) {
    console.error('Error resetting connection:', error);
    // Even if reset fails, continue - the next query will create a new connection
  }
}

// Graceful shutdown handling
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Enhanced health check function with better retry mechanism
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use a simple query that doesn't require prepared statements
      await prisma.$queryRaw`SELECT 1 as health_check`;
      return { healthy: true };
    } catch (error: any) {
      lastError = error;
      
      // If it's a prepared statement error, try to reconnect
      if (error.message?.includes('prepared statement') || 
          error.message?.includes('does not exist') ||
          error.message?.includes('connection') ||
          error.message?.includes('timeout')) {
        console.warn(`Database health check attempt ${attempt} failed, retrying...`);
        if (attempt < maxRetries) {
          await resetConnection();
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          continue;
        }
      }
      
      // For other errors, don't retry
      break;
    }
  }
  
  return { healthy: false, error: lastError?.message };
}

// Connection pool monitoring with better error handling
export async function getConnectionInfo() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        count(*) as active_connections,
        max_connections,
        (max_connections - count(*)) as available_connections
      FROM pg_stat_activity 
      WHERE state = 'active'
    `;
    return result;
  } catch (error) {
    console.error('Failed to get connection info:', error);
    return null;
  }
}

// Performance monitoring with prepared statement cleanup
export async function getQueryStats() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements 
      ORDER BY total_time DESC 
      LIMIT 10
    `;
    return result;
  } catch (error) {
    console.error('Failed to get query stats:', error);
    return null;
  }
}

// Function to clean up prepared statements (useful for debugging)
export async function cleanupPreparedStatements() {
  try {
    await prisma.$queryRaw`
      DEALLOCATE ALL
    `;
    console.log('Prepared statements cleaned up');
  } catch (error) {
    console.error('Failed to cleanup prepared statements:', error);
  }
}

// Enhanced error handler for prepared statement issues
export function handlePreparedStatementError(error: any): boolean {
  if (error.message?.includes('prepared statement') || 
      error.message?.includes('does not exist') ||
      error.message?.includes('connection')) {
    console.warn('Prepared statement error detected, connection may need reset');
    return true;
  }
  return false;
}

export default prisma;
