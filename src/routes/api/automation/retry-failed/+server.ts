import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';

export const POST: RequestHandler = async () => {
  try {
    // Initialize Amazon service (handles both API and database operations)
    const amazonService = new AmazonService();

    // Retry failed requests
    const result = await amazonService.retryFailedReviewRequests();

    return json({
      success: result.success,
      retried: result.retried,
      successCount: result.successCount,
      message: `Retry completed. Retried: ${result.retried}, Successful: ${result.successCount}`
    });

  } catch (error: any) {
    console.error('Retry failed requests error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
