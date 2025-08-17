import { databaseManager } from './prisma';

// Enhanced Connection management utility for handling prepared statement errors
export class ConnectionManager {
  private static instance: ConnectionManager;
  private isResetting = false;
  private resetCount = 0;
  private lastResetTime = 0;
  private readonly RESET_COOLDOWN = 10000; // 10 seconds cooldown between resets

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2, // Reduced from 3 to prevent cascading failures
    operationName: string = 'database operation'
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get client (this will test connection if needed)
        await databaseManager.getClient();
        return await operation();
      } catch (error: any) {
        console.warn(`${operationName} attempt ${attempt} failed:`, error.message);
        
        throw error;
      }
    }
    
    throw new Error(`Failed to execute ${operationName} after all retries`);
  }


  private canReset(): boolean {
    const now = Date.now();
    if (now - this.lastResetTime < this.RESET_COOLDOWN) {
      console.log('Connection reset skipped due to cooldown period');
      return false;
    }
    return true;
  }

  private async resetConnection(): Promise<void> {
    if (this.isResetting) {
      console.log('Connection reset already in progress, skipping...');
      return; // Prevent multiple simultaneous resets
    }

    this.isResetting = true;
    this.resetCount++;
    this.lastResetTime = Date.now();
    
    try {
      console.log(`Resetting Prisma connection (attempt ${this.resetCount})...`);
      
      // Use the database manager to reset the connection
      await databaseManager.resetConnection();
      
      // If we've reset too many times, log a warning
      if (this.resetCount > 3) {
        console.warn(`Connection has been reset ${this.resetCount} times. Consider checking database health.`);
        this.resetCount = 0; // Reset counter after warning
      }
      
      console.log('Prisma connection reset completed');
    } catch (error) {
      console.error('Error resetting connection:', error);
    } finally {
      this.isResetting = false;
    }
  }

  // Get connection statistics for monitoring
  getConnectionStats() {
    return {
      resetCount: this.resetCount,
      lastResetTime: this.lastResetTime,
      isResetting: this.isResetting,
      canReset: this.canReset()
    };
  }
}

export const connectionManager = ConnectionManager.getInstance();
