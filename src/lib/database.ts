import { supabase, TABLES, handleSupabaseError } from './supabase';
import type { 
  AmazonOrder, 
  ReviewRequest, 
  DashboardStats, 
  OrderFilters, 
  PaginationParams 
} from './types';
import { addDays, format, parseISO } from 'date-fns';

export class DatabaseService {
  // Helper methods to map between database (snake_case) and TypeScript (camelCase)
  private mapOrderFromDb(dbOrder: any): AmazonOrder {
    return {
      id: dbOrder.id,
      amazonOrderId: dbOrder.amazon_order_id,
      purchaseDate: dbOrder.purchase_date,
      deliveryDate: dbOrder.delivery_date,
      orderStatus: dbOrder.order_status,
      orderTotal: dbOrder.order_total,
      marketplaceId: dbOrder.marketplace_id,
      buyerInfo: dbOrder.buyer_info,
      items: dbOrder.items,
      isReturned: dbOrder.is_returned,
      returnDate: dbOrder.return_date,
      reviewRequestSent: dbOrder.review_request_sent,
      reviewRequestDate: dbOrder.review_request_date,
      reviewRequestStatus: dbOrder.review_request_status,
      reviewRequestError: dbOrder.review_request_error,
      createdAt: dbOrder.created_at,
      updatedAt: dbOrder.updated_at
    };
  }

  private mapOrderToDb(order: Partial<AmazonOrder>): any {
    const dbOrder: any = {};
    if (order.amazonOrderId !== undefined) dbOrder.amazon_order_id = order.amazonOrderId;
    if (order.purchaseDate !== undefined) dbOrder.purchase_date = order.purchaseDate;
    if (order.deliveryDate !== undefined) dbOrder.delivery_date = order.deliveryDate;
    if (order.orderStatus !== undefined) dbOrder.order_status = order.orderStatus;
    if (order.orderTotal !== undefined) dbOrder.order_total = order.orderTotal;
    if (order.marketplaceId !== undefined) dbOrder.marketplace_id = order.marketplaceId;
    if (order.buyerInfo !== undefined) dbOrder.buyer_info = order.buyerInfo;
    if (order.items !== undefined) dbOrder.items = order.items;
    if (order.isReturned !== undefined) dbOrder.is_returned = order.isReturned;
    if (order.returnDate !== undefined) dbOrder.return_date = order.returnDate;
    if (order.reviewRequestSent !== undefined) dbOrder.review_request_sent = order.reviewRequestSent;
    if (order.reviewRequestDate !== undefined) dbOrder.review_request_date = order.reviewRequestDate;
    if (order.reviewRequestStatus !== undefined) dbOrder.review_request_status = order.reviewRequestStatus;
    if (order.reviewRequestError !== undefined) dbOrder.review_request_error = order.reviewRequestError;
    return dbOrder;
  }

  private mapReviewRequestFromDb(dbRequest: any): ReviewRequest {
    return {
      id: dbRequest.id,
      orderId: dbRequest.order_id,
      amazonOrderId: dbRequest.amazon_order_id,
      status: dbRequest.status,
      sentAt: dbRequest.sent_at,
      errorMessage: dbRequest.error_message,
      retryCount: dbRequest.retry_count,
      createdAt: dbRequest.created_at,
      updatedAt: dbRequest.updated_at
    };
  }

  private mapReviewRequestToDb(request: Partial<ReviewRequest>): any {
    const dbRequest: any = {};
    if (request.orderId !== undefined) dbRequest.order_id = request.orderId;
    if (request.amazonOrderId !== undefined) dbRequest.amazon_order_id = request.amazonOrderId;
    if (request.status !== undefined) dbRequest.status = request.status;
    if (request.sentAt !== undefined) dbRequest.sent_at = request.sentAt;
    if (request.errorMessage !== undefined) dbRequest.error_message = request.errorMessage;
    if (request.retryCount !== undefined) dbRequest.retry_count = request.retryCount;
    return dbRequest;
  }

  // Orders
  async createOrder(order: Omit<AmazonOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: AmazonOrder; error?: string }> {
    try {
      // Map camelCase to snake_case for database
      const dbOrder = {
        amazon_order_id: order.amazonOrderId,
        purchase_date: order.purchaseDate,
        delivery_date: order.deliveryDate,
        order_status: order.orderStatus,
        order_total: order.orderTotal,
        marketplace_id: order.marketplaceId,
        buyer_info: order.buyerInfo,
        items: order.items,
        is_returned: order.isReturned,
        return_date: order.returnDate,
        review_request_sent: order.reviewRequestSent,
        review_request_date: order.reviewRequestDate,
        review_request_status: order.reviewRequestStatus,
        review_request_error: order.reviewRequestError,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(TABLES.ORDERS)
        .insert(dbOrder)
        .select()
        .single();

      if (error) throw error;

      // Map snake_case back to camelCase for TypeScript
      const mappedData = this.mapOrderFromDb(data);
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async getOrders(filters: OrderFilters = {}, pagination: PaginationParams = { page: 1, limit: 20 }): Promise<{ success: boolean; data?: AmazonOrder[]; error?: string; total?: number }> {
    try {
      let query = supabase
        .from(TABLES.ORDERS)
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.dateFrom) {
        query = query.gte('delivery_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('delivery_date', filters.dateTo);
      }
      if (filters.status && filters.status.length > 0) {
        query = query.in('order_status', filters.status);
      }
      if (filters.marketplaceId) {
        query = query.eq('marketplace_id', filters.marketplaceId);
      }
      if (filters.isReturned !== undefined) {
        query = query.eq('is_returned', filters.isReturned);
      }
      if (filters.reviewRequestStatus && filters.reviewRequestStatus.length > 0) {
        query = query.in('review_request_status', filters.reviewRequestStatus);
      }
      if (filters.search) {
        query = query.or(`amazon_order_id.ilike.%${filters.search}%,buyer_info->>'email'.ilike.%${filters.search}%`);
      }

      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.range(offset, offset + pagination.limit - 1);

      // Apply sorting
      if (pagination.sortBy) {
        query = query.order(pagination.sortBy, { ascending: pagination.sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Map database results to TypeScript format
      const mappedData = data ? data.map(order => this.mapOrderFromDb(order)) : [];

      return { success: true, data: mappedData, total: count || 0 };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async getOrderById(id: string): Promise<{ success: boolean; data?: AmazonOrder; error?: string }> {
    try {
      const { data, error } = await supabase
        .from(TABLES.ORDERS)
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Map database result to TypeScript format
      const mappedData = this.mapOrderFromDb(data);
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async updateOrder(id: string, updates: Partial<AmazonOrder>): Promise<{ success: boolean; data?: AmazonOrder; error?: string }> {
    try {
      // Map TypeScript updates to database format
      const dbUpdates = this.mapOrderToDb(updates);
      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from(TABLES.ORDERS)
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Map database result to TypeScript format
      const mappedData = this.mapOrderFromDb(data);
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async getOrdersEligibleForReview(): Promise<{ success: boolean; data?: AmazonOrder[]; error?: string }> {
    try {
      // Get orders delivered 25 days ago that haven't had review requests sent
      const twentyFiveDaysAgo = format(addDays(new Date(), -25), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from(TABLES.ORDERS)
        .select('*')
        .eq('is_returned', false)
        .eq('review_request_sent', false)
        .lte('delivery_date', twentyFiveDaysAgo)
        .eq('order_status', 'Delivered');

      if (error) throw error;

      // Map database results to TypeScript format
      const mappedData = data ? data.map(order => this.mapOrderFromDb(order)) : [];
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  // Review Requests
  async createReviewRequest(reviewRequest: Omit<ReviewRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: ReviewRequest; error?: string }> {
    try {
      // Map camelCase to snake_case for database
      const dbRequest = {
        order_id: reviewRequest.orderId,
        amazon_order_id: reviewRequest.amazonOrderId,
        status: reviewRequest.status,
        sent_at: reviewRequest.sentAt,
        error_message: reviewRequest.errorMessage,
        retry_count: reviewRequest.retryCount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .insert(dbRequest)
        .select()
        .single();

      if (error) throw error;

      // Map snake_case back to camelCase for TypeScript
      const mappedData = this.mapReviewRequestFromDb(data);
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async updateReviewRequest(id: string, updates: Partial<ReviewRequest>): Promise<{ success: boolean; data?: ReviewRequest; error?: string }> {
    try {
      // Map TypeScript updates to database format
      const dbUpdates = this.mapReviewRequestToDb(updates);
      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Map database result to TypeScript format
      const mappedData = this.mapReviewRequestFromDb(data);
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async getReviewRequests(orderId?: string): Promise<{ success: boolean; data?: ReviewRequest[]; error?: string }> {
    try {
      let query = supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*')
        .order('created_at', { ascending: false });

      if (orderId) {
        query = query.eq('order_id', orderId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Map database results to TypeScript format
      const mappedData = data ? data.map(request => this.mapReviewRequestFromDb(request)) : [];
      return { success: true, data: mappedData };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  // Dashboard Statistics
  async getDashboardStats(): Promise<{ success: boolean; data?: DashboardStats; error?: string }> {
    try {
      // Get total orders
      const { count: totalOrders } = await supabase
        .from(TABLES.ORDERS)
        .select('*', { count: 'exact', head: true });

      // Get eligible orders (delivered 25+ days ago, not returned, not sent)
      const twentyFiveDaysAgo = format(addDays(new Date(), -25), 'yyyy-MM-dd');
      const { count: eligibleForReview } = await supabase
        .from(TABLES.ORDERS)
        .select('*', { count: 'exact', head: true })
        .eq('is_returned', false)
        .eq('review_request_sent', false)
        .lte('delivery_date', twentyFiveDaysAgo)
        .eq('order_status', 'Delivered');

      // Get review requests sent
      const { count: reviewRequestsSent } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');

      // Get failed requests
      const { count: reviewRequestsFailed } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');

      // Get skipped requests
      const { count: reviewRequestsSkipped } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'skipped');

      // Get returned orders
      const { count: returnedOrders } = await supabase
        .from(TABLES.ORDERS)
        .select('*', { count: 'exact', head: true })
        .eq('is_returned', true);

      // Get today's requests
      const today = format(new Date(), 'yyyy-MM-dd');
      const { count: todayRequests } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

      // Get this week's requests
      const weekAgo = format(addDays(new Date(), -7), 'yyyy-MM-dd');
      const { count: thisWeekRequests } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo);

      // Get this month's requests
      const monthAgo = format(addDays(new Date(), -30), 'yyyy-MM-dd');
      const { count: thisMonthRequests } = await supabase
        .from(TABLES.REVIEW_REQUESTS)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthAgo);

      const stats: DashboardStats = {
        totalOrders: totalOrders || 0,
        eligibleForReview: eligibleForReview || 0,
        reviewRequestsSent: reviewRequestsSent || 0,
        reviewRequestsFailed: reviewRequestsFailed || 0,
        reviewRequestsSkipped: reviewRequestsSkipped || 0,
        returnedOrders: returnedOrders || 0,
        todayRequests: todayRequests || 0,
        thisWeekRequests: thisWeekRequests || 0,
        thisMonthRequests: thisMonthRequests || 0
      };

      return { success: true, data: stats };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  // Activity Logs
  async logActivity(action: string, details: any, orderId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from(TABLES.ACTIVITY_LOGS)
        .insert({
          action,
          details,
          order_id: orderId,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async getActivityLogs(limit: number = 50): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from(TABLES.ACTIVITY_LOGS)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  // Amazon API Configuration
  async getAmazonConfig(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .from(TABLES.AMAZON_CONFIG)
        .select('*')
        .eq('is_active', true)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }

  async updateAmazonConfig(id: string, updates: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .from(TABLES.AMAZON_CONFIG)
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      return handleSupabaseError(error);
    }
  }
}
