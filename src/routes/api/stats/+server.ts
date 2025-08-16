import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/database';

export const GET: RequestHandler = async () => {
  try {
    const db = new DatabaseService();

    // Get dashboard stats
    const result = await db.getDashboardStats();

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
    console.error('Get stats error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
