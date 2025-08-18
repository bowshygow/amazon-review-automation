import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();
  
  try {
    logger.info('Starting retry failed requests process', {
      endpoint: '/api/automation/retry-failed',
      method: 'POST'
    });

    // Initialize Amazon service (handles both API and database operations)
    const amazonService = new AmazonService();

    // Retry failed requests
    const result = await amazonService.retryFailedReviewRequests();

    const duration = Date.now() - startTime;
    
    logger.info('Retry failed requests completed successfully', {
      endpoint: '/api/automation/retry-failed',
      duration,
      retried: result.retried,
      successCount: result.successCount,
      success: result.success
    });

    return json({
      success: result.success,
      retried: result.retried,
      successCount: result.successCount,
      message: `Retry completed. Retried: ${result.retried}, Successful: ${result.successCount}`
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Retry failed requests failed', {
      error: { message: error.message, stack_trace: error.stack },
      endpoint: '/api/automation/retry-failed',
      method: 'POST',
      duration,
      userAgent: request.headers.get('user-agent')
    });
    
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
