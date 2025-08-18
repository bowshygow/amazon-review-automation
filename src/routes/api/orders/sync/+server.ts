import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';

export const POST: RequestHandler = async () => {
  try {
    // Initialize Amazon service (handles both API and database operations)
    const amazonService = new AmazonService();

    // Sync orders from Amazon
    const result = await amazonService.syncOrders();

    return json({
      success: result.success,
      existingOrders: result.existingOrders,
      newOrders: result.newOrders,
      updatedOrders: result.updatedOrders,
      errors: result.errors,
      totalProcessed: result.totalProcessed,
      message: `Order sync completed. New: ${result.newOrders}, Updated: ${result.updatedOrders}, Errors: ${result.errors}`
    });

  } catch (error: any) {
    console.error('Order sync error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
