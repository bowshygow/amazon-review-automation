import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';

export const POST: RequestHandler = async () => {
  try {
    // Initialize Amazon service (handles both API and database operations)
    const amazonService = new AmazonService();

    // Run daily automation
    const result = await amazonService.runDailyAutomation();

    return json({
      success: result.success,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      message: `Automation completed. Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}, Skipped: ${result.skipped}`
    });

  } catch (error: any) {
    console.error('Daily automation error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
