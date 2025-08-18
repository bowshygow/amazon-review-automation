import { PrismaClient } from '@prisma/client';
import './database-url'; // Import to set DATABASE_URL environment variable
import { logger } from '$lib/logger';

declare global {
  var __prisma: PrismaClient | undefined;
}

// Simplified Database Manager that avoids prepared statement conflicts
class DatabaseManager {
  private static instance: DatabaseManager;
  private prisma: PrismaClient;
  private connectionId: string;
  private isConnected = false;

  private constructor() {
    this.connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Creating new Prisma client instance', {
      connectionId: this.connectionId,
      environment: process.env.NODE_ENV
    });
    
    // Always create a fresh Prisma client to avoid prepared statement conflicts
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['error', 'warn']
        : ['error', 'warn'],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      }
    });

    // Store in global for development hot reloading
    if (process.env.NODE_ENV !== 'production') {
      globalThis.__prisma = this.prisma;
    }
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  // Get the Prisma client instance
  public async getClient(): Promise<PrismaClient> {
    return this.prisma;
  }

  private async recreateClient(): Promise<void> {
    try {
      // Disconnect the current client
      await this.prisma.$disconnect();
      
      // Clear global instance
      if (globalThis.__prisma) {
        globalThis.__prisma = undefined;
      }
      
      // Create a new Prisma client
      this.prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' 
          ? ['error', 'warn']
          : ['error', 'warn'],
        errorFormat: 'pretty',
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        }
      });
      
      if (process.env.NODE_ENV !== 'production') {
        globalThis.__prisma = this.prisma;
      }
      
      this.isConnected = false;
      logger.info('Prisma client recreated', { connectionId: this.connectionId });
    } catch (error: any) {
      logger.error('Failed to recreate Prisma client', {
        error: { message: error.message, stack_trace: error.stack },
        connectionId: this.connectionId,
        operation: 'recreateClient'
      });
      throw error;
    }
  }

  // Reset connection (for manual intervention)
  public async resetConnection(): Promise<void> {
    logger.info('Resetting database connection', { connectionId: this.connectionId });
    await this.recreateClient();
    logger.info('Connection reset completed', { connectionId: this.connectionId });
  }

  // Health check
  public async checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const client = await this.getClient();
      await client.$queryRaw`SELECT 1 as health_check`;
      return { healthy: true };
    } catch (error: any) {
      return { healthy: false, error: error.message };
    }
  }

  // Graceful shutdown
  public async disconnect(): Promise<void> {
    try {
      logger.info('Disconnecting from database', { connectionId: this.connectionId });
      await this.prisma.$disconnect();
      this.isConnected = false;
      logger.info('Disconnected successfully', { connectionId: this.connectionId });
    } catch (error: any) {
      logger.error('Failed to disconnect from database', {
        error: { message: error.message, stack_trace: error.stack },
        connectionId: this.connectionId,
        operation: 'disconnect'
      });
    }
  }

  // Get connection info for debugging
  public getConnectionInfo() {
    return {
      connectionId: this.connectionId,
      isConnected: this.isConnected
    };
  }
}

// Create singleton instance
const databaseManager = DatabaseManager.getInstance();

// Graceful shutdown handling
process.on('beforeExit', async () => {
  await databaseManager.disconnect();
});

process.on('SIGINT', async () => {
  await databaseManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await databaseManager.disconnect();
  process.exit(0);
});

// Export the database manager and convenience functions
export { databaseManager };

// Convenience exports for backward compatibility
export const prisma = databaseManager.getClient();
export const resetConnection = () => databaseManager.resetConnection();
export const checkDatabaseHealth = () => databaseManager.checkDatabaseHealth();

// Connection pool monitoring
export async function getConnectionInfo() {
  try {
    const client = await databaseManager.getClient();
    const result = await client.$queryRaw`
      SELECT 
        count(*) as active_connections,
        max_connections,
        (max_connections - count(*)) as available_connections
      FROM pg_stat_activity 
      WHERE state = 'active'
    `;
    return result;
  } catch (error: any) {
    logger.error('Failed to get connection info', {
      error: { message: error.message, stack_trace: error.stack },
      operation: 'getConnectionInfo'
    });
    return null;
  }
}

// Performance monitoring
export async function getQueryStats() {
  try {
    const client = await databaseManager.getClient();
    const result = await client.$queryRaw`
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
  } catch (error: any) {
    logger.error('Failed to get query stats', {
      error: { message: error.message, stack_trace: error.stack },
      operation: 'getQueryStats'
    });
    return null;
  }
}

// Function to clean up prepared statements
export async function cleanupPreparedStatements() {
  try {
    const client = await databaseManager.getClient();
    await client.$queryRaw`DEALLOCATE ALL`;
    logger.info('Prepared statements cleaned up');
  } catch (error: any) {
    logger.error('Failed to cleanup prepared statements', {
      error: { message: error.message, stack_trace: error.stack },
      operation: 'cleanupPreparedStatements'
    });
  }
}

// Enhanced function to handle prepared statement conflicts
export async function handlePreparedStatementConflict() {
  try {
    logger.info('Handling prepared statement conflict');
    await databaseManager.resetConnection();
    logger.info('Prepared statement conflict resolved');
  } catch (error: any) {
    logger.error('Failed to handle prepared statement conflict', {
      error: { message: error.message, stack_trace: error.stack },
      operation: 'handlePreparedStatementConflict'
    });
    throw error;
  }
}

// Enhanced error handler for prepared statement issues
export function handlePreparedStatementError(error: any): boolean {
  if (error.message?.includes('prepared statement') || 
      error.message?.includes('already exists') ||
      error.message?.includes('s0') ||
      error.message?.includes('s1') ||
      error.message?.includes('s2') ||
      error.message?.includes('s3') ||
      error.message?.includes('s4') ||
      error.message?.includes('s5') ||
      error.message?.includes('s6') ||
      error.message?.includes('s7') ||
      error.message?.includes('s8') ||
      error.message?.includes('s9') ||
      error.message?.includes('s10') ||
      error.message?.includes('s11') ||
      error.message?.includes('s12') ||
      error.message?.includes('s13') ||
      error.message?.includes('s14') ||
      error.message?.includes('s15') ||
      error.message?.includes('s16') ||
      error.message?.includes('s17') ||
      error.message?.includes('s18') ||
      error.message?.includes('s19') ||
      error.message?.includes('s20')) {
    logger.warn('Prepared statement error detected, connection may need reset', {
      error: { message: error.message }
    });
    return true;
  }
  return false;
}

export default databaseManager;

