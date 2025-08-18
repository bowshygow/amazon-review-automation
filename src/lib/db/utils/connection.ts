import { databaseManager, checkDatabaseHealth, getConnectionInfo, getQueryStats } from '../config/prisma';

export class DatabaseConnectionUtils {
  /**
   * Test database connectivity
   */
  static async testConnection(): Promise<{ connected: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const client = await databaseManager.getClient();
      await client.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;
      
      return { connected: true, latency };
    } catch (error) {
      return { 
        connected: false, 
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get comprehensive database health status
   */
  static async getHealthStatus(): Promise<{
    healthy: boolean;
    database: { healthy: boolean; error?: string };
    connections: any;
    performance: any;
    timestamp: string;
  }> {
    try {
      const [dbHealth, connections, performance] = await Promise.all([
        checkDatabaseHealth(),
        getConnectionInfo(),
        getQueryStats()
      ]);

      const healthy = dbHealth.healthy;

      return {
        healthy,
        database: dbHealth,
        connections,
        performance,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        database: { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' },
        connections: null,
        performance: null,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get connection pool statistics
   */
  static async getConnectionPoolStats(): Promise<{
    active: number;
    idle: number;
    total: number;
    maxConnections: number;
    utilization: number;
  }> {
    try {
      const client = await databaseManager.getClient();
      const result = await client.$queryRaw`
        SELECT 
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) as total_connections,
          max_connections
        FROM pg_stat_activity, 
             (SELECT setting::int as max_connections FROM pg_settings WHERE name = 'max_connections') as max_conn
      `;

      const stats = (result as any)[0];
      const active = parseInt(stats.active_connections) || 0;
      const idle = parseInt(stats.idle_connections) || 0;
      const total = parseInt(stats.total_connections) || 0;
      const maxConnections = parseInt(stats.max_connections) || 100;
      const utilization = maxConnections > 0 ? (total / maxConnections) * 100 : 0;

      return {
        active,
        idle,
        total,
        maxConnections,
        utilization: Math.round(utilization * 100) / 100
      };
    } catch (error) {
      console.error('Failed to get connection pool stats:', error);
      return {
        active: 0,
        idle: 0,
        total: 0,
        maxConnections: 100,
        utilization: 0
      };
    }
  }

  /**
   * Get database performance metrics
   */
  static async getPerformanceMetrics(): Promise<{
    slowQueries: any[];
    queryStats: any;
    tableStats: any;
    indexStats: any;
  }> {
    try {
      const client = await databaseManager.getClient();
      const [slowQueries, queryStats, tableStats, indexStats] = await Promise.all([
        // Get slow queries (> 1000ms)
        client.$queryRaw`
          SELECT query, calls, total_time, mean_time, rows
          FROM pg_stat_statements 
          WHERE mean_time > 1000
          ORDER BY mean_time DESC 
          LIMIT 10
        `,
        // Get overall query statistics
        client.$queryRaw`
          SELECT 
            sum(calls) as total_calls,
            sum(total_time) as total_time,
            avg(mean_time) as avg_query_time,
            sum(rows) as total_rows
          FROM pg_stat_statements
        `,
        // Get table statistics
        client.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_rows,
            n_dead_tup as dead_rows
          FROM pg_stat_user_tables 
          ORDER BY n_live_tup DESC
        `,
        // Get index statistics
        client.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan as scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes 
          ORDER BY idx_scan DESC
        `
      ]);

      return {
        slowQueries,
        queryStats: (queryStats as any)[0],
        tableStats,
        indexStats
      };
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return {
        slowQueries: [],
        queryStats: {},
        tableStats: [],
        indexStats: []
      };
    }
  }

  /**
   * Check if database needs maintenance
   */
  static async checkMaintenanceNeeds(): Promise<{
    needsVacuum: boolean;
    needsAnalyze: boolean;
    needsReindex: boolean;
    recommendations: string[];
  }> {
    try {
      const client = await databaseManager.getClient();
      const [vacuumStats, analyzeStats, indexStats] = await Promise.all([
        // Check vacuum needs
        client.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            n_dead_tup as dead_rows,
            n_live_tup as live_rows,
            (n_dead_tup::float / NULLIF(n_live_tup, 0)) * 100 as dead_percentage
          FROM pg_stat_user_tables 
          WHERE n_dead_tup > 0
        `,
        // Check analyze needs
        client.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            last_analyze,
            last_autoanalyze,
            n_tup_ins + n_tup_upd + n_tup_del as changes_since_analyze
          FROM pg_stat_user_tables 
          WHERE last_analyze IS NULL 
             OR last_autoanalyze IS NULL
             OR (n_tup_ins + n_tup_upd + n_tup_del) > 1000
        `,
        // Check index fragmentation
        client.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan as scans,
            idx_tup_read as tuples_read
          FROM pg_stat_user_indexes 
          WHERE idx_scan = 0
        `
      ]);

      const recommendations: string[] = [];
      let needsVacuum = false;
      let needsAnalyze = false;
      let needsReindex = false;

      // Check vacuum needs
      for (const table of vacuumStats as any[]) {
        if (table.dead_percentage > 20) {
          needsVacuum = true;
          recommendations.push(`Table ${table.tablename} needs VACUUM (${Math.round(table.dead_percentage)}% dead rows)`);
        }
      }

      // Check analyze needs
      if ((analyzeStats as any[]).length > 0) {
        needsAnalyze = true;
        recommendations.push('Some tables need ANALYZE for updated statistics');
      }

      // Check reindex needs
      if ((indexStats as any[]).length > 0) {
        needsReindex = true;
        recommendations.push('Some indexes are unused and could be dropped');
      }

      return {
        needsVacuum,
        needsAnalyze,
        needsReindex,
        recommendations
      };
    } catch (error) {
      console.error('Failed to check maintenance needs:', error);
      return {
        needsVacuum: false,
        needsAnalyze: false,
        needsReindex: false,
        recommendations: ['Unable to check maintenance needs due to error']
      };
    }
  }

  /**
   * Gracefully close database connections
   */
  static async closeConnections(): Promise<void> {
    try {
      const client = await databaseManager.getClient();
      await client.$disconnect();
      console.log('Database connections closed successfully');
    } catch (error) {
      console.error('Error closing database connections:', error);
    }
  }

  /**
   * Reset connection pool (useful for troubleshooting)
   */
  static async resetConnectionPool(): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await databaseManager.getClient();
      await client.$disconnect();
      await client.$connect();
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}
