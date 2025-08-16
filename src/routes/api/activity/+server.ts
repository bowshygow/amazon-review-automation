import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/db/services/database';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const db = new DatabaseService();
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const logs = await db.getActivityLogs(limit);

    return json({
      success: true,
      data: logs
    });

  } catch (error: any) {
    console.error('Get activity logs error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
