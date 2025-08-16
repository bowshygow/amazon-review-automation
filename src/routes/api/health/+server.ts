import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkDatabaseHealth, getConnectionInfo, getQueryStats } from '$lib/db/config/prisma';

export const GET: RequestHandler = async () => {
  try {
    const startTime = Date.now();
    
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    // Get connection information
    const connectionInfo = await getConnectionInfo();
    
    // Get query performance stats
    const queryStats = await getQueryStats();
    
    const responseTime = Date.now() - startTime;
    
    const healthData = {
      status: dbHealth.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      database: {
        status: dbHealth.healthy ? 'connected' : 'disconnected',
        error: dbHealth.error,
        connectionInfo,
        queryStats: queryStats && Array.isArray(queryStats) ? queryStats.slice(0, 5) : null // Top 5 queries
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      checks: {
        database: dbHealth.healthy,
        connection: !!connectionInfo,
        performance: !!queryStats
      }
    };

    const statusCode = dbHealth.healthy ? 200 : 503;
    
    return json(healthData, { status: statusCode });

  } catch (error: any) {
    console.error('Health check error:', error);
    
    return json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message || 'Health check failed',
      checks: {
        database: false,
        connection: false,
        performance: false
      }
    }, { status: 503 });
  }
};
