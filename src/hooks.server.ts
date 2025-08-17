import type { Handle } from '@sveltejs/kit';
import { loggerMiddleware } from '$lib/middleware/logger';
import { logger } from '$lib/logger';

export const handle: Handle = loggerMiddleware;

// Handle errors globally
export const handleError = ({ error, event }) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  logger.error('Unhandled error in request', {
    error: { message: errorMessage, stack_trace: errorStack },
    url: event.url.pathname,
    method: event.request.method,
    userAgent: event.request.headers.get('user-agent'),
    ip: event.getClientAddress()
  });

  return {
    message: 'Internal Server Error'
  };
};
