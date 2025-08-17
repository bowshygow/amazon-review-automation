import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/db/services/database';
import { logger } from '$lib/logger';

export const GET: RequestHandler = async ({ request }) => {
  const startTime = Date.now();
  
  try {
    logger.info('Fetching dashboard stats', {
      endpoint: '/api/stats',
      method: 'GET'
    });

    const db = new DatabaseService();
    const stats = await db.getDashboardStats();

    const duration = Date.now() - startTime;
    
    logger.info('Dashboard stats fetched successfully', {
      endpoint: '/api/stats',
      duration,
      statsKeys: Object.keys(stats)
    });

    return json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Failed to fetch dashboard stats', {
      error: { message: error.message, stack_trace: error.stack },
      endpoint: '/api/stats',
      method: 'GET',
      duration,
      userAgent: request.headers.get('user-agent')
    });
    
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
