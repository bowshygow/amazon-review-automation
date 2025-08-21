import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();
  
  try {
    logger.info('Starting daily automation process', {
      endpoint: '/api/automation/run-daily',
      method: 'POST'
    });

    // Initialize Amazon service (handles both API and database operations)
    const amazonService = new AmazonService();

    // Run enhanced daily automation (includes returns processing)
    const result = await amazonService.runEnhancedDailyAutomation();

    const duration = Date.now() - startTime;
    
    logger.info('Enhanced daily automation completed successfully', {
      endpoint: '/api/automation/run-daily',
      duration,
      returnsProcessed: result.returnsProcessed,
      ordersUpdated: result.ordersUpdated,
      reviewRequestsProcessed: result.reviewRequestsProcessed,
      reviewRequestsSent: result.reviewRequestsSent,
      reviewRequestsFailed: result.reviewRequestsFailed,
      reviewRequestsSkipped: result.reviewRequestsSkipped,
      // Backward compatibility
      processed: result.reviewRequestsProcessed,
      sent: result.reviewRequestsSent,
      failed: result.reviewRequestsFailed,
      skipped: result.reviewRequestsSkipped,
      success: result.success
    });

    return json({
      success: result.success,
      // Enhanced automation properties
      returnsProcessed: result.returnsProcessed,
      ordersUpdated: result.ordersUpdated,
      reviewRequestsProcessed: result.reviewRequestsProcessed,
      reviewRequestsSent: result.reviewRequestsSent,
      reviewRequestsFailed: result.reviewRequestsFailed,
      reviewRequestsSkipped: result.reviewRequestsSkipped,
      // Backward compatibility properties for frontend
      processed: result.reviewRequestsProcessed,
      sent: result.reviewRequestsSent,
      failed: result.reviewRequestsFailed,
      skipped: result.reviewRequestsSkipped,
      message: `Enhanced automation completed. Returns processed: ${result.returnsProcessed}, Orders updated: ${result.ordersUpdated}, Review requests processed: ${result.reviewRequestsProcessed}, Sent: ${result.reviewRequestsSent}, Failed: ${result.reviewRequestsFailed}, Skipped: ${result.reviewRequestsSkipped}`
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Daily automation failed', {
      error: { message: error.message, stack_trace: error.stack },
      endpoint: '/api/automation/run-daily',
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
