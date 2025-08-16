import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/database';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const db = new DatabaseService();

    // Parse query parameters
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // Get activity logs
    const result = await db.getActivityLogs(limit);

    if (!result.success) {
      return json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }

    return json({
      success: true,
      data: result.data
    });

  } catch (error: any) {
    console.error('Get activity logs error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
