import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/db/services/database';

export const GET: RequestHandler = async () => {
  try {
    const db = new DatabaseService();
    const stats = await db.getDashboardStats();

    return json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    console.error('Get stats error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
