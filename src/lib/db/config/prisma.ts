import { PrismaClient } from '@prisma/client';
import './database-url'; // Import to set DATABASE_URL environment variable

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
    if (!this.isConnected) {
      await this.testConnection();
    }
    return this.prisma;
  }

  // Test connection without using prepared statements
  private async testConnection(): Promise<void> {
    try {
      console.log(`[${this.connectionId}] Testing database connection...`);
      
      // Use a simple query that doesn't create prepared statements
      await this.prisma.$queryRaw`SELECT 1`;
      
      this.isConnected = true;
      console.log(`[${this.connectionId}] Database connection successful`);
    } catch (error: any) {
      console.error(`[${this.connectionId}] Connection test failed:`, error.message);
      
      // If it's a prepared statement error, recreate the client
      if (this.isPreparedStatementError(error)) {
        console.log(`[${this.connectionId}] Prepared statement error detected, recreating client...`);
        await this.recreateClient();
        await this.testConnection(); // Retry once
      } else {
        throw error;
      }
    }
  }

  private isPreparedStatementError(error: any): boolean {
    return error.message?.includes('prepared statement') || 
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
           error.message?.includes('s20');
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
      console.log(`[${this.connectionId}] Prisma client recreated`);
    } catch (error) {
      console.error(`[${this.connectionId}] Error recreating client:`, error);
      throw error;
    }
  }

  // Reset connection (for manual intervention)
  public async resetConnection(): Promise<void> {
    console.log(`[${this.connectionId}] Resetting connection...`);
    await this.recreateClient();
    await this.testConnection();
    console.log(`[${this.connectionId}] Connection reset completed`);
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
      console.log(`[${this.connectionId}] Disconnecting from database...`);
      await this.prisma.$disconnect();
      this.isConnected = false;
      console.log(`[${this.connectionId}] Disconnected successfully`);
    } catch (error) {
      console.error(`[${this.connectionId}] Error disconnecting from database:`, error);
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
  } catch (error) {
    console.error('Failed to get connection info:', error);
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
  } catch (error) {
    console.error('Failed to get query stats:', error);
    return null;
  }
}

// Function to clean up prepared statements
export async function cleanupPreparedStatements() {
  try {
    const client = await databaseManager.getClient();
    await client.$queryRaw`DEALLOCATE ALL`;
    console.log('Prepared statements cleaned up');
  } catch (error) {
    console.error('Failed to cleanup prepared statements:', error);
  }
}

// Enhanced function to handle prepared statement conflicts
export async function handlePreparedStatementConflict() {
  try {
    console.log('Handling prepared statement conflict...');
    await databaseManager.resetConnection();
    console.log('Prepared statement conflict resolved');
  } catch (error) {
    console.error('Failed to handle prepared statement conflict:', error);
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
    console.warn('Prepared statement error detected, connection may need reset');
    return true;
  }
  return false;
}

export default databaseManager;

