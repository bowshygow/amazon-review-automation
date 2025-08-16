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
        
        // Check if it's a prepared statement error
        if (this.isPreparedStatementError(error)) {
          if (attempt < maxRetries && !this.isResetting && this.canReset()) {
            console.log(`Attempting to reset connection for ${operationName}...`);
            await this.resetConnection();
            // Exponential backoff with shorter delays
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
            continue;
          }
        }
        
        // For other errors or max retries reached, throw
        throw error;
      }
    }
    
    throw new Error(`Failed to execute ${operationName} after all retries`);
  }

  private isPreparedStatementError(error: any): boolean {
    return error.message?.includes('prepared statement') || 
           error.message?.includes('does not exist') ||
           error.message?.includes('connection') ||
           error.message?.includes('timeout') ||
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
