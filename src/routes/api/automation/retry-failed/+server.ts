import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AutomationService } from '$lib/automation-service';
import { DatabaseService } from '$lib/database';

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

    // Retry failed requests
    const result = await automationService.retryFailedRequests();

    return json({
      success: result.success,
      retried: result.retried,
      errors: result.errors,
      message: `Retry completed. Retried: ${result.retried}, Errors: ${result.errors.length}`
    });

  } catch (error: any) {
    console.error('Retry failed requests error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
