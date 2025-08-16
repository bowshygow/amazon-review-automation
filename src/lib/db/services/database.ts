import { prisma, resetConnection, handlePreparedStatementError } from '../config/prisma';
import type { 
  LegacyAmazonOrder, 
  LegacyReviewRequest, 
  DashboardStats, 
  OrderFilters, 
  PaginationParams 
} from '$lib/types';
import { addDays, format } from 'date-fns';
import type { PrismaClient } from '@prisma/client';

export class DatabaseService {
  // Utility method to handle prepared statement errors with retry logic
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    operationName: string = 'database operation'
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        console.warn(`${operationName} attempt ${attempt} failed:`, error.message);
        
        // If it's a prepared statement error, try to reset connection and retry
        if (handlePreparedStatementError(error)) {
          if (attempt < maxRetries) {
            await resetConnection();
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
        }
        
        // For other errors or max retries reached, throw
        throw error;
      }
    }
    
    throw new Error(`Failed to execute ${operationName} after all retries`);
  }

  // Orders
  async createOrder(order: Omit<LegacyAmazonOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<LegacyAmazonOrder> {
    // Use transaction for data consistency
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const dbOrder = await tx.amazonOrder.create({
        data: {
          amazonOrderId: order.amazonOrderId,
          purchaseDate: new Date(order.purchaseDate),
          deliveryDate: new Date(order.deliveryDate),
          orderStatus: order.orderStatus as any,
          orderTotal: {
            currencyCode: order.orderTotal.currencyCode,
            amount: order.orderTotal.amount
          },
          marketplaceId: order.marketplaceId,
          buyerInfo: {
            email: order.buyerInfo.email,
            name: order.buyerInfo.name
          },
          items: order.items.map((item: any) => ({
            asin: item.asin,
            sku: item.sku,
            title: item.title,
            quantity: item.quantity,
            priceCurrency: item.price.currencyCode,
            priceAmount: parseFloat(item.price.amount),
          })),
          isReturned: order.isReturned,
          returnDate: order.returnDate ? new Date(order.returnDate) : null,
          reviewRequestSent: order.reviewRequestSent || false,
          reviewRequestDate: order.reviewRequestDate ? new Date(order.reviewRequestDate) : null,
          reviewRequestStatus: order.reviewRequestStatus,
          reviewRequestError: order.reviewRequestError
        }
      });

      // Log activity for audit trail
      await tx.activityLog.create({
        data: {
          action: 'order_created',
          details: { 
            orderId: dbOrder.id, 
            amazonOrderId: dbOrder.amazonOrderId,
            totalItems: order.items.length 
          },
          orderId: dbOrder.id
        }
      });

      return this.mapOrderFromDb(dbOrder);
    });
  }

  async getOrders(filters: OrderFilters = {}, pagination: PaginationParams = { page: 1, limit: 20 }): Promise<{ data: LegacyAmazonOrder[]; total: number }> {
    const where: any = {};

    // Apply filters with proper query optimization
    if (filters.dateFrom || filters.dateTo) {
      where.deliveryDate = {};
      if (filters.dateFrom) where.deliveryDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.deliveryDate.lte = new Date(filters.dateTo);
    }
    if (filters.status && filters.status.length > 0) {
      where.orderStatus = { in: filters.status };
    }
    if (filters.marketplaceId) {
      where.marketplaceId = filters.marketplaceId;
    }
    if (filters.isReturned !== undefined) {
      where.isReturned = filters.isReturned;
    }
    if (filters.reviewRequestStatus && filters.reviewRequestStatus.length > 0) {
      where.reviewRequestStatus = { in: filters.reviewRequestStatus };
    }
    if (filters.search) {
      // Use full-text search for better performance
      where.OR = [
        { amazonOrderId: { contains: filters.search, mode: 'insensitive' } }
        // Note: buyerInfo is JSON, so we can't search it directly with Prisma
        // Consider using raw SQL or a different approach for JSON field search
      ];
    }

    // Optimize pagination with cursor-based approach for large datasets
    const offset = (pagination.page - 1) * pagination.limit;
    
    return await this.executeWithRetry(async () => {
      const [data, total] = await Promise.all([
        prisma.amazonOrder.findMany({
          where,
          include: { 
            reviewRequests: {
              orderBy: { createdAt: 'desc' },
              take: 5
            },
            activityLogs: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          },
          skip: offset,
          take: pagination.limit,
          orderBy: pagination.sortBy ? { [pagination.sortBy]: pagination.sortOrder || 'desc' } : { createdAt: 'desc' }
        }),
        prisma.amazonOrder.count({ where })
      ]);

      return {
        data: data.map((order: any) => this.mapOrderFromDb(order)),
        total
      };
    }, 3, 'get orders');
  }

  async getOrderById(id: string): Promise<LegacyAmazonOrder | null> {
    const order = await prisma.amazonOrder.findUnique({
      where: { id },
      include: { 
        reviewRequests: {
          orderBy: { createdAt: 'desc' },
          take: 5 // Limit recent review requests
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    return order ? this.mapOrderFromDb(order) : null;
  }

  async updateOrder(id: string, updates: Partial<LegacyAmazonOrder>): Promise<LegacyAmazonOrder> {
    // Use transaction for data consistency
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const updateData: any = {};

      if (updates.amazonOrderId !== undefined) updateData.amazonOrderId = updates.amazonOrderId;
      if (updates.purchaseDate !== undefined) updateData.purchaseDate = new Date(updates.purchaseDate);
      if (updates.deliveryDate !== undefined) updateData.deliveryDate = new Date(updates.deliveryDate);
      if (updates.orderStatus !== undefined) updateData.orderStatus = updates.orderStatus;
      if (updates.orderTotal !== undefined) {
        updateData.orderTotal = {
          currencyCode: updates.orderTotal.currencyCode,
          amount: updates.orderTotal.amount
        };
      }
      if (updates.marketplaceId !== undefined) updateData.marketplaceId = updates.marketplaceId;
      if (updates.buyerInfo !== undefined) {
        updateData.buyerInfo = {
          email: updates.buyerInfo.email,
          name: updates.buyerInfo.name
        };
      }
      if (updates.isReturned !== undefined) updateData.isReturned = updates.isReturned;
      if (updates.returnDate !== undefined) updateData.returnDate = updates.returnDate ? new Date(updates.returnDate) : null;
      if (updates.reviewRequestSent !== undefined) updateData.reviewRequestSent = updates.reviewRequestSent;
      if (updates.reviewRequestDate !== undefined) updateData.reviewRequestDate = updates.reviewRequestDate ? new Date(updates.reviewRequestDate) : null;
      if (updates.reviewRequestStatus !== undefined) updateData.reviewRequestStatus = updates.reviewRequestStatus;
      if (updates.reviewRequestError !== undefined) updateData.reviewRequestError = updates.reviewRequestError;

      const updatedOrder = await tx.amazonOrder.update({
        where: { id },
        data: updateData,
        include: { items: true }
      });

      // Log activity for audit trail
      await tx.activityLog.create({
        data: {
          action: 'order_updated',
          details: { 
            orderId: id, 
            changes: Object.keys(updateData),
            updatedAt: new Date()
          },
          orderId: id
        }
      });

      return this.mapOrderFromDb(updatedOrder);
    });
  }

  async getOrdersEligibleForReview(): Promise<LegacyAmazonOrder[]> {
    const twentyFiveDaysAgo = addDays(new Date(), -25);
    
    // Use optimized query with proper indexing
    const orders = await prisma.amazonOrder.findMany({
      where: {
        isReturned: false,
        reviewRequestSent: false,
        deliveryDate: { lte: twentyFiveDaysAgo },
        orderStatus: 'DELIVERED'
      },
      include: { 
        reviewRequests: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      // Use cursor-based pagination for large datasets
      take: 1000 // Reasonable limit for daily processing
    });

    return orders.map((order: any) => this.mapOrderFromDb(order));
  }

  // Review Requests
  async createReviewRequest(reviewRequest: Omit<LegacyReviewRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<LegacyReviewRequest> {
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const dbRequest = await tx.reviewRequest.create({
        data: {
          orderId: reviewRequest.orderId,
          amazonOrderId: reviewRequest.amazonOrderId,
          status: reviewRequest.status,
          sentAt: reviewRequest.sentAt ? new Date(reviewRequest.sentAt) : null,
          errorMessage: reviewRequest.errorMessage,
          retryCount: reviewRequest.retryCount || 0
        }
      });

      // Log activity for audit trail
      await tx.activityLog.create({
        data: {
          action: 'review_request_created',
          details: { 
            requestId: dbRequest.id,
            orderId: reviewRequest.orderId,
            status: reviewRequest.status
          },
          orderId: reviewRequest.orderId
        }
      });

      return this.mapReviewRequestFromDb(dbRequest);
    });
  }

  async updateReviewRequest(id: string, updates: Partial<LegacyReviewRequest>): Promise<LegacyReviewRequest> {
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const updateData: any = {};

      if (updates.orderId !== undefined) updateData.orderId = updates.orderId;
      if (updates.amazonOrderId !== undefined) updateData.amazonOrderId = updates.amazonOrderId;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.sentAt !== undefined) updateData.sentAt = updates.sentAt ? new Date(updates.sentAt) : null;
      if (updates.errorMessage !== undefined) updateData.errorMessage = updates.errorMessage;
      if (updates.retryCount !== undefined) updateData.retryCount = updates.retryCount;

      const updatedRequest = await tx.reviewRequest.update({
        where: { id },
        data: updateData
      });

      // Log activity for audit trail
      await tx.activityLog.create({
        data: {
          action: 'review_request_updated',
          details: { 
            requestId: id, 
            changes: Object.keys(updateData),
            updatedAt: new Date()
          },
          orderId: updates.orderId
        }
      });

      return this.mapReviewRequestFromDb(updatedRequest);
    });
  }

  async getReviewRequests(orderId?: string): Promise<LegacyReviewRequest[]> {
    const where = orderId ? { orderId } : {};

    return await this.executeWithRetry(async () => {
      const requests = await prisma.reviewRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        // Optimize for common use cases
        take: orderId ? 50 : 1000
      });

      return requests.map((request: any) => this.mapReviewRequestFromDb(request));
    }, 3, 'get review requests');
  }

  // Dashboard Statistics with caching and optimization
  async getDashboardStats(): Promise<DashboardStats> {
    return await this.executeWithRetry(async () => {
      // Use parallel queries for better performance
      const [
        totalOrders,
        eligibleForReview,
        reviewRequestsSent,
        reviewRequestsFailed,
        reviewRequestsSkipped,
        returnedOrders,
        todayRequests,
        thisWeekRequests,
        thisMonthRequests
      ] = await Promise.all([
        prisma.amazonOrder.count(),
        prisma.amazonOrder.count({
          where: {
            isReturned: false,
            reviewRequestSent: false,
            deliveryDate: { lte: addDays(new Date(), -25) },
            orderStatus: 'DELIVERED'
          }
        }),
        prisma.reviewRequest.count({ where: { status: 'SENT' } }),
        prisma.reviewRequest.count({ where: { status: 'FAILED' } }),
        prisma.reviewRequest.count({ where: { status: 'SKIPPED' } }),
        prisma.amazonOrder.count({ where: { isReturned: true } }),
        prisma.reviewRequest.count({
          where: { createdAt: { gte: new Date(format(new Date(), 'yyyy-MM-dd')) } }
        }),
        prisma.reviewRequest.count({
          where: { createdAt: { gte: addDays(new Date(), -7) } }
        }),
        prisma.reviewRequest.count({
          where: { createdAt: { gte: addDays(new Date(), -30) } }
        })
      ]);

      return {
        totalOrders,
        eligibleForReview,
        reviewRequestsSent,
        reviewRequestsFailed,
        reviewRequestsSkipped,
        returnedOrders,
        todayRequests,
        thisWeekRequests,
        thisMonthRequests
      };
    }, 3, 'get dashboard stats');
  }

  // Activity Logs with proper pagination and filtering
  async logActivity(action: string, details: any, orderId?: string): Promise<void> {
    await this.executeWithRetry(async () => {
      await prisma.activityLog.create({
        data: {
          action,
          details,
          orderId
        }
      });
    }, 3, 'log activity');
  }

  async getActivityLogs(limit: number = 50, orderId?: string, action?: string): Promise<any[]> {
    const where: any = {};
    
    if (orderId) where.orderId = orderId;
    if (action) where.action = action;

    return await this.executeWithRetry(async () => {
      // First try without include to avoid prepared statement issues
      const logs = await prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 1000), // Prevent excessive queries
        select: {
          id: true,
          action: true,
          details: true,
          orderId: true,
          createdAt: true
        }
      });

      // If we have orderIds, fetch order details separately to avoid prepared statement issues
      if (logs.length > 0 && logs.some(log => log.orderId)) {
        const orderIds = [...new Set(logs.filter(log => log.orderId).map(log => log.orderId))];
        
        try {
          const orders = await prisma.amazonOrder.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              amazonOrderId: true
            }
          });

          // Create a map for quick lookup
          const orderMap = new Map(orders.map(order => [order.id, order]));

          // Attach order data to logs
          return logs.map(log => ({
            ...log,
            order: log.orderId ? orderMap.get(log.orderId) || null : null
          }));
        } catch (orderError: any) {
          console.warn('Failed to fetch order details for activity logs:', orderError.message);
          // Return logs without order details if that fails
          return logs.map(log => ({
            ...log,
            order: null
          }));
        }
      }

      return logs;
    }, 3, 'get activity logs');
  }

  // Amazon API Configuration with security
  async getAmazonConfig(): Promise<any> {
    return await prisma.amazonApiConfig.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        clientId: true,
        marketplaceId: true,
        accessToken: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true
        // Exclude sensitive fields like clientSecret and refreshToken
      }
    });
  }

  // Get full Amazon configuration for API operations (includes sensitive fields)
  async getFullAmazonConfig(): Promise<any> {
    return await prisma.amazonApiConfig.findFirst({
      where: { isActive: true }
    });
  }

  async updateAmazonConfig(id: string, updates: any): Promise<any> {
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const updateData: any = { ...updates };

      const updatedConfig = await tx.amazonApiConfig.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          clientId: true,
          marketplaceId: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Log configuration update
      await tx.activityLog.create({
        data: {
          action: 'amazon_config_updated',
          details: { 
            configId: id,
            changes: Object.keys(updates),
            updatedAt: new Date()
          }
        }
      });

      return updatedConfig;
    });
  }

  // Batch operations for better performance
  async batchUpdateOrders(updates: Array<{ id: string; updates: Partial<LegacyAmazonOrder> }>): Promise<LegacyAmazonOrder[]> {
    return await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
      const results = [];
      
      for (const { id, updates: updateData } of updates) {
        const result = await this.updateOrder(id, updateData);
        results.push(result);
      }
      
      return results;
    });
  }

  // Helper methods to map between Prisma and TypeScript formats
  private mapOrderFromDb(dbOrder: any): LegacyAmazonOrder {
    return {
      id: dbOrder.id,
      amazonOrderId: dbOrder.amazonOrderId,
      purchaseDate: dbOrder.purchaseDate.toISOString(),
      deliveryDate: dbOrder.deliveryDate.toISOString(),
      orderStatus: dbOrder.orderStatus,
      orderTotal: {
        currencyCode: dbOrder.orderTotal?.currencyCode || '',
        amount: dbOrder.orderTotal?.amount || '0'
      },
      marketplaceId: dbOrder.marketplaceId,
      buyerInfo: {
        email: dbOrder.buyerInfo?.email || '',
        name: dbOrder.buyerInfo?.name || ''
      },
      items: dbOrder.items?.map((item: any) => ({
        id: item.asin, // Use ASIN as ID since items are JSON
        asin: item.asin,
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        price: {
          currencyCode: item.priceCurrency,
          amount: item.priceAmount?.toString() || '0'
        }
      })) || [],
      isReturned: dbOrder.isReturned,
      returnDate: dbOrder.returnDate?.toISOString(),
      reviewRequestSent: dbOrder.reviewRequestSent,
      reviewRequestDate: dbOrder.reviewRequestDate?.toISOString(),
      reviewRequestStatus: dbOrder.reviewRequestStatus,
      reviewRequestError: dbOrder.reviewRequestError,
      createdAt: dbOrder.createdAt.toISOString(),
      updatedAt: dbOrder.updatedAt.toISOString()
    };
  }

  private mapReviewRequestFromDb(dbRequest: any): LegacyReviewRequest {
    return {
      id: dbRequest.id,
      orderId: dbRequest.orderId,
      amazonOrderId: dbRequest.amazonOrderId,
      status: dbRequest.status,
      sentAt: dbRequest.sentAt?.toISOString(),
      errorMessage: dbRequest.errorMessage,
      retryCount: dbRequest.retryCount,
      createdAt: dbRequest.createdAt.toISOString(),
      updatedAt: dbRequest.updatedAt.toISOString()
    };
  }
}
