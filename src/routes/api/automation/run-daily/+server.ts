import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AutomationService } from '$lib/automation-service';
import { DatabaseService } from '$lib/database';
import { AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN, AMAZON_MARKETPLACE_ID } from '$env/static/private';

export const POST: RequestHandler = async () => {
  try {
    // Get Amazon API config from database
    const db = new DatabaseService();
    const configResult = await db.getAmazonConfig();
    
    if (!configResult.success || !configResult.data) {
      return json({ 
        success: false, 
        error: 'Amazon API configuration not found' 
      }, { status: 400 });
    }

    const config = configResult.data;

    // Initialize automation service
    const automationService = new AutomationService({
      clientId: config.client_id,
      clientSecret: config.client_secret,
      refreshToken: config.refresh_token,
      marketplaceId: config.marketplace_id
    });

    // Run daily automation
    const result = await automationService.runDailyAutomation();

    return json({
      success: result.success,
      processed: result.processed,
      errors: result.errors,
      message: `Automation completed. Processed: ${result.processed}, Errors: ${result.errors.length}`
    });

  } catch (error: any) {
    console.error('Daily automation error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
