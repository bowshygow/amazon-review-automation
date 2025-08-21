import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { dataStartTime, dataEndTime } = body;

    // Validate input parameters
    if (!dataStartTime || !dataEndTime) {
      return json({ 
        success: false, 
        error: 'dataStartTime and dataEndTime are required' 
      }, { status: 400 });
    }

    logger.info('Starting returns report processing', {
      endpoint: '/api/automation/process-returns',
      method: 'POST',
      dataStartTime,
      dataEndTime
    });

    // Initialize Amazon service
    const amazonService = new AmazonService();

    // Process returns report
    const result = await amazonService.processReturnsReport(
      new Date(dataStartTime),
      new Date(dataEndTime)
    );

    const duration = Date.now() - startTime;
    
    logger.info('Returns report processing completed', {
      endpoint: '/api/automation/process-returns',
      duration,
      success: result.success,
      reportId: result.reportId,
      processedReturns: result.processedReturns,
      updatedOrders: result.updatedOrders,
      errors: result.errors
    });

    return json({
      success: result.success,
      reportId: result.reportId,
      processedReturns: result.processedReturns,
      updatedOrders: result.updatedOrders,
      errors: result.errors,
      message: `Returns processing completed. Processed: ${result.processedReturns}, Updated orders: ${result.updatedOrders}, Errors: ${result.errors}`
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Returns report processing failed', {
      error: { message: error.message, stack_trace: error.stack },
      endpoint: '/api/automation/process-returns',
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
