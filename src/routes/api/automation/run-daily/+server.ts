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

    // Run daily automation
    const result = await amazonService.runDailyAutomation();

    const duration = Date.now() - startTime;
    
    logger.info('Daily automation completed successfully', {
      endpoint: '/api/automation/run-daily',
      duration,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      success: result.success
    });

    return json({
      success: result.success,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      message: `Automation completed. Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}, Skipped: ${result.skipped}`
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
