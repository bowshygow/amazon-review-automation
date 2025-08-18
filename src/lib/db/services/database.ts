import { databaseManager } from '../config/prisma';
import { connectionManager } from '../config/connection';
import type { 
  LegacyAmazonOrder, 
  LegacyReviewRequest, 
  DashboardStats, 
  OrderFilters, 
  PaginationParams 
} from '$lib/types';
import { addDays, format } from 'date-fns';
import type { PrismaClient } from '@prisma/client';
import pLimit from 'p-limit';
import { logger } from '$lib/logger';

export class DatabaseService {
  // Utility method to handle prepared statement errors with retry logic
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    operationName: string = 'database operation'
  ): Promise<T> {
    return connectionManager.executeWithRetry(operation, maxRetries, operationName);
  }

  // Orders
  async createOrder(order: Omit<LegacyAmazonOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<LegacyAmazonOrder> {
    const startTime = Date.now();
    
    try {
      // Use transaction for data consistency
      const result = await this.executeWithRetry(async () => {
        const client = await databaseManager.getClient();
        return await client.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
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
      }, 3, 'create order');

      const duration = Date.now() - startTime;
      logger.info('Database operation: createOrder', {
        db: {
          operation: 'createOrder',
          table: 'amazonOrder'
        },
        event: {
          duration
        },
        amazonOrderId: order.amazonOrderId,
        totalItems: order.items.length
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Database operation failed: createOrder', {
        error: { message: error.message, stack_trace: error.stack },
        db: {
          operation: 'createOrder',
          table: 'amazonOrder'
        },
        event: {
          duration
        },
        amazonOrderId: order.amazonOrderId
      });
      throw error;
    }
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
      where.OR = [
        { amazonOrderId: { contains: filters.search, mode: 'insensitive' } },
        { 'buyerInfo.name': { contains: filters.search, mode: 'insensitive' } },
        { 'buyerInfo.email': { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const skip = (pagination.page - 1) * pagination.limit;

    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const [data, total] = await Promise.all([
        client.amazonOrder.findMany({
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
          orderBy: { deliveryDate: 'desc' },
          skip,
          take: pagination.limit
        }),
        client.amazonOrder.count({ where })
      ]);

      return {
        data: data.map((order: any) => this.mapOrderFromDb(order)),
        total
      };
    }, 3, 'get orders');
  }

  async getOrderById(id: string): Promise<LegacyAmazonOrder | null> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const order = await client.amazonOrder.findUnique({
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
    }, 3, 'get order by id');
  }

  async getOrderByAmazonOrderId(amazonOrderId: string): Promise<LegacyAmazonOrder | null> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const order = await client.amazonOrder.findUnique({
        where: { amazonOrderId },
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
    }, 3, 'get order by amazon order id');
  }

  async updateOrder(id: string, updates: Partial<LegacyAmazonOrder>): Promise<LegacyAmazonOrder> {
    // Use transaction for data consistency
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      return await client.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
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
          data: updateData
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
    }, 3, 'update order');
  }

  async getOrdersEligibleForReview(): Promise<LegacyAmazonOrder[]> {
    const twentyFiveDaysAgo = addDays(new Date(), -25);
    
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      // Use optimized query with proper indexing
      const orders = await client.amazonOrder.findMany({
        where: {
          isReturned: false,
          reviewRequestSent: false,
          deliveryDate: { lte: twentyFiveDaysAgo },
          orderStatus: { in: ['Shipped', 'PartiallyShipped'] }
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
    }, 3, 'get orders eligible for review');
  }

  // Review Requests
  async createReviewRequest(reviewRequest: Omit<LegacyReviewRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<LegacyReviewRequest> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      return await client.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
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
    }, 3, 'create review request');
  }

  async updateReviewRequest(id: string, updates: Partial<LegacyReviewRequest>): Promise<LegacyReviewRequest> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      return await client.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
        const updateData: any = {};

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
    }, 3, 'update review request');
  }

  async getReviewRequests(orderId?: string): Promise<LegacyReviewRequest[]> {
    const where = orderId ? { orderId } : {};

    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const requests = await client.reviewRequest.findMany({
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
      const client = await databaseManager.getClient();
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
        client.amazonOrder.count(),
        client.amazonOrder.count({
          where: {
            isReturned: false,
            reviewRequestSent: false,
            deliveryDate: { lte: addDays(new Date(), -25) },
            orderStatus: { in: ['Shipped', 'PartiallyShipped'] }
          }
        }),
        client.reviewRequest.count({ where: { status: 'SENT' } }),
        client.reviewRequest.count({ where: { status: 'FAILED' } }),
        client.reviewRequest.count({ where: { status: 'SKIPPED' } }),
        client.amazonOrder.count({ where: { isReturned: true } }),
        client.reviewRequest.count({
          where: { createdAt: { gte: new Date(format(new Date(), 'yyyy-MM-dd')) } }
        }),
        client.reviewRequest.count({
          where: { createdAt: { gte: addDays(new Date(), -7) } }
        }),
        client.reviewRequest.count({
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
      const client = await databaseManager.getClient();
      await client.activityLog.create({
        data: {
          action,
          details,
          orderId
        }
      });
    }, 3, 'log activity');
  }

  async getActivityLogs(orderId?: string, limit: number = 100): Promise<any[]> {
    const where = orderId ? { orderId } : {};

    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const logs = await client.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          order: {
            select: {
              amazonOrderId: true,
              buyerInfo: true
            }
          }
        }
      });

      return logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        details: log.details,
        orderId: log.orderId,
        createdAt: log.createdAt,
        order: log.order ? {
          amazonOrderId: log.order.amazonOrderId,
          buyerInfo: log.order.buyerInfo
        } : null
      }));
    }, 3, 'get activity logs');
  }

  // Bulk operations for performance
  async bulkUpdateOrders(updates: Array<{ id: string; updates: Partial<LegacyAmazonOrder> }>): Promise<void> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const orders = await client.amazonOrder.findMany({
        where: { id: { in: updates.map(u => u.id) } }
      });

      // Process with limited concurrency to avoid DB connection issues
      const limit = pLimit(7); // Limit to 5 concurrent operations
      
      const updatePromises = updates.map(({ id, updates: orderUpdates }) => 
        limit(async () => {
          const updateData: any = {};
          // Apply the same update logic as single update
          if (orderUpdates.amazonOrderId !== undefined) updateData.amazonOrderId = orderUpdates.amazonOrderId;
          if (orderUpdates.purchaseDate !== undefined) updateData.purchaseDate = new Date(orderUpdates.purchaseDate);
          if (orderUpdates.deliveryDate !== undefined) updateData.deliveryDate = new Date(orderUpdates.deliveryDate);
          if (orderUpdates.orderStatus !== undefined) updateData.orderStatus = orderUpdates.orderStatus;
          if (orderUpdates.orderTotal !== undefined) {
            updateData.orderTotal = {
              currencyCode: orderUpdates.orderTotal.currencyCode,
              amount: orderUpdates.orderTotal.amount
            };
          }
          if (orderUpdates.marketplaceId !== undefined) updateData.marketplaceId = orderUpdates.marketplaceId;
          if (orderUpdates.buyerInfo !== undefined) {
            updateData.buyerInfo = {
              email: orderUpdates.buyerInfo.email,
              name: orderUpdates.buyerInfo.name
            };
          }
          if (orderUpdates.isReturned !== undefined) updateData.isReturned = orderUpdates.isReturned;
          if (orderUpdates.returnDate !== undefined) updateData.returnDate = orderUpdates.returnDate ? new Date(orderUpdates.returnDate) : null;
          if (orderUpdates.reviewRequestSent !== undefined) updateData.reviewRequestSent = orderUpdates.reviewRequestSent;
          if (orderUpdates.reviewRequestDate !== undefined) updateData.reviewRequestDate = orderUpdates.reviewRequestDate ? new Date(orderUpdates.reviewRequestDate) : null;
          if (orderUpdates.reviewRequestStatus !== undefined) updateData.reviewRequestStatus = orderUpdates.reviewRequestStatus;
          if (orderUpdates.reviewRequestError !== undefined) updateData.reviewRequestError = orderUpdates.reviewRequestError;

          await client.amazonOrder.update({
            where: { id },
            data: updateData
          });
        })
      );

      // Wait for all updates to be processed
      await Promise.all(updatePromises);
    }, 3, 'bulk update orders');
  }

  // Amazon API Configuration
  async getAmazonApiConfig(): Promise<any> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      return await client.amazonApiConfig.findFirst({
        orderBy: { createdAt: 'desc' }
      });
    }, 3, 'get amazon api config');
  }

  async updateAmazonApiConfig(config: any): Promise<any> {
    return await this.executeWithRetry(async () => {
      const client = await databaseManager.getClient();
      const existingConfig = await client.amazonApiConfig.findFirst({
        orderBy: { createdAt: 'desc' }
      });

      return await client.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
        if (existingConfig) {
          // Update existing config
          return await tx.amazonApiConfig.update({
            where: { id: existingConfig.id },
            data: config
          });
        } else {
          // Create new config
          return await tx.amazonApiConfig.create({
            data: config
          });
        }
      });
    }, 3, 'update amazon api config');
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      const client = await databaseManager.getClient();
      await client.$queryRaw`SELECT 1 as health_check`;
      return true;
    } catch (error: any) {
      logger.error('Database health check failed', {
        error: { message: error.message, stack_trace: error.stack },
        operation: 'healthCheck'
      });
      return false;
    }
  }

  // Data mapping methods
  private mapOrderFromDb(dbOrder: any): LegacyAmazonOrder {
    return {
      id: dbOrder.id,
      amazonOrderId: dbOrder.amazonOrderId,
      purchaseDate: dbOrder.purchaseDate.toISOString(),
      deliveryDate: dbOrder.deliveryDate.toISOString(),
      orderStatus: dbOrder.orderStatus,
      orderTotal: {
        currencyCode: dbOrder.orderTotal.currencyCode,
        amount: dbOrder.orderTotal.amount
      },
      marketplaceId: dbOrder.marketplaceId,
      buyerInfo: {
        email: dbOrder.buyerInfo.email,
        name: dbOrder.buyerInfo.name
      },
      items: dbOrder.items.map((item: any) => ({
        asin: item.asin,
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        price: {
          currencyCode: item.priceCurrency,
          amount: item.priceAmount.toString()
        }
      })),
      isReturned: dbOrder.isReturned,
      returnDate: dbOrder.returnDate ? dbOrder.returnDate.toISOString() : null,
      reviewRequestSent: dbOrder.reviewRequestSent,
      reviewRequestDate: dbOrder.reviewRequestDate ? dbOrder.reviewRequestDate.toISOString() : null,
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
      sentAt: dbRequest.sentAt ? dbRequest.sentAt.toISOString() : null,
      errorMessage: dbRequest.errorMessage,
      retryCount: dbRequest.retryCount,
      createdAt: dbRequest.createdAt.toISOString(),
      updatedAt: dbRequest.updatedAt.toISOString()
    };
  }
}
