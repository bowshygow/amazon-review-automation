import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DatabaseService } from '$lib/db/services/database';
import { logger } from '$lib/logger';

export const GET: RequestHandler = async ({ url, request }) => {
  const startTime = Date.now();
  
  try {
    logger.info('Fetching orders', {
      endpoint: '/api/orders',
      method: 'GET',
      query: url.search
    });

    const db = new DatabaseService();

    // Parse query parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;
    const status = url.searchParams.get('status')?.split(',') as any[] || undefined;
    const marketplaceId = url.searchParams.get('marketplaceId') || undefined;
    const isReturned = url.searchParams.get('isReturned') ? 
      url.searchParams.get('isReturned') === 'true' : undefined;
    const reviewRequestStatus = url.searchParams.get('reviewRequestStatus')?.split(',') as any[] || undefined;
    const search = url.searchParams.get('search') || undefined;
    const sortBy = url.searchParams.get('sortBy') || undefined;
    const sortOrder = (url.searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';

    // Build filters
    const filters = {
      dateFrom,
      dateTo,
      status,
      marketplaceId,
      isReturned,
      reviewRequestStatus,
      search
    };

    // Build pagination
    const pagination = {
      page,
      limit,
      sortBy,
      sortOrder
    };

    // Get orders
    const result = await db.getOrders(filters, pagination);

    const duration = Date.now() - startTime;
    
    logger.info('Orders fetched successfully', {
      endpoint: '/api/orders',
      duration,
      total: result.total,
      page,
      limit,
      filters
    });

    return json({
      success: true,
      data: result.data,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit)
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Failed to fetch orders', {
      error: { message: error.message, stack_trace: error.stack },
      endpoint: '/api/orders',
      method: 'GET',
      duration,
      query: url.search,
      userAgent: request.headers.get('user-agent')
    });
    
    return json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
};
