import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logger';

export const GET: RequestHandler = async ({ url, request }) => {
  try {
    // Test different log levels and message types
    logger.debug('Debug message test', {
      test: 'debug',
      data: { nested: { value: 'test' } }
    });

    logger.info('Info message test', {
      test: 'info',
      user: { id: 123, name: 'Test User' },
      action: 'test_logging'
    });

    logger.warn('Warning message test', {
      test: 'warning',
      issue: 'This is a test warning',
      severity: 'medium'
    });

    // Test error logging with proper error object
    const testError = new Error('Test error for ECS logging');
    testError.name = 'TestError';
    
    logger.error('Error message test', {
      test: 'error',
      err: testError, // This will be automatically converted to ECS error fields
      context: 'test_endpoint'
    });

    // Test HTTP request/response logging
    logger.info('HTTP request test', {
      req: {
        method: 'GET',
        url: '/api/test-logging',
        headers: {
          'user-agent': request.headers.get('user-agent'),
          'accept': request.headers.get('accept')
        }
      },
      res: {
        statusCode: 200,
        headers: {
          'content-type': 'application/json'
        }
      }
    });

    return json({
      success: true,
      message: 'Logging test completed',
      timestamp: new Date().toISOString(),
      logs: [
        'debug message with nested data',
        'info message with user data',
        'warning message with severity',
        'error message with proper error object',
        'HTTP request/response logging'
      ]
    });

  } catch (error: any) {
    logger.error('Test logging endpoint failed', {
      err: error,
      endpoint: '/api/test-logging',
      method: 'GET'
    });
    
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
