import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/db/services/database';
import { AmazonService } from '$lib/db/services/amazon';
import { handlePreparedStatementConflict } from '$lib/db/config/prisma';

export const GET: RequestHandler = async () => {
  try {
    const db = new DatabaseService();
    const amazonService = new AmazonService();

    // Check database health
    const dbHealth = await db.getDashboardStats();
    
    // Check Amazon API health
    let amazonApiHealth: any = null;
    try {
      const isConfigured = await amazonService.isApiConfigured();
      amazonApiHealth = {
        configured: isConfigured,
        message: isConfigured ? 'API is configured' : 'API is not configured'
      };
      
      if (isConfigured) {
        // Try to initialize the API to test connectivity
        try {
          const api = await (amazonService as any).initializeApi();
          amazonApiHealth.initialized = true;
          amazonApiHealth.message = 'API initialized successfully';
        } catch (initError: any) {
          amazonApiHealth.initialized = false;
          amazonApiHealth.error = initError.message;
          amazonApiHealth.message = 'API initialization failed';
        }
      }
    } catch (amazonError: any) {
      amazonApiHealth = {
        configured: false,
        error: amazonError.message,
        message: 'Amazon API check failed'
      };
    }

    return json({
      success: true,
      data: {
        database: dbHealth,
        amazonApi: amazonApiHealth,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Health check error:', error);
    
    // Handle prepared statement conflicts specifically
    if (error.message?.includes('prepared statement') || 
        error.message?.includes('s0') || 
        error.message?.includes('s1') || 
        error.message?.includes('s2') || 
        error.message?.includes('s3') || 
        error.message?.includes('s4') || 
        error.message?.includes('s5') || 
        error.message?.includes('s6') || 
        error.message?.includes('s7') || 
        error.message?.includes('s8') || 
        error.message?.includes('s9') || 
        error.message?.includes('s10') || 
        error.message?.includes('s11') || 
        error.message?.includes('s12') || 
        error.message?.includes('s13')) {
      try {
        console.log('Attempting to resolve prepared statement conflict...');
        await handlePreparedStatementConflict();
        
        // Retry the health check once after resolving the conflict
        const db = new DatabaseService();
        const dbHealth = await db.getDashboardStats();
        
        return json({
          success: true,
          data: {
            database: dbHealth,
            amazonApi: { configured: false, message: 'Amazon API check skipped due to connection reset' },
            timestamp: new Date().toISOString(),
            note: 'Connection was reset due to prepared statement conflict'
          }
        });
      } catch (retryError: any) {
        console.error('Failed to resolve prepared statement conflict:', retryError);
        return json({ 
          success: false, 
          error: 'Database connection issue - prepared statement conflict could not be resolved',
          details: retryError.message
        }, { status: 500 });
      }
    }
    
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
