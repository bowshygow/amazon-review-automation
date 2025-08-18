import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/logger';

export const loggerMiddleware: Handle = async ({ event, resolve }) => {
  const startTime = Date.now();
  const { method, url } = event.request;
  
  try {
    // Process the request
    const response = await resolve(event);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log the API request
    const level = response.status >= 400 ? 'error' : 'info';
    logger.log(level, `${method} ${url.pathname} - ${response.status} (${responseTime}ms)`, {
      http: {
        request: {
          method,
          url: url.pathname
        },
        response: {
          status_code: response.status
        }
      },
      event: {
        duration: responseTime
      },
      userAgent: event.request.headers.get('user-agent'),
      ip: event.getClientAddress(),
      query: url.search,
      headers: Object.fromEntries(event.request.headers.entries())
    });
    
    return response;
  } catch (error) {
    // Calculate response time for errors
    const responseTime = Date.now() - startTime;
    
    // Log the error
    logger.error(`${method} ${url.pathname} - 500 (${responseTime}ms)`, {
      http: {
        request: {
          method,
          url: url.pathname
        },
        response: {
          status_code: 500
        }
      },
      event: {
        duration: responseTime
      },
      error: { 
        message: error instanceof Error ? error.message : 'Unknown error',
        stack_trace: error instanceof Error ? error.stack : undefined
      },
      userAgent: event.request.headers.get('user-agent'),
      ip: event.getClientAddress(),
      query: url.search
    });
    
    throw error;
  }
};
