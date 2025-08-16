import { DatabaseService } from './database';
import { AmazonSPAPI } from '../../amazon-api';
import { getAmazonConfig, validateAmazonConfig } from '../../config/amazon';
import type { 
  AmazonOrder, 
  GetOrdersResponse,
  LegacyAmazonOrder,
} from '$lib/types';
import { addDays, isBefore } from 'date-fns';

export class AmazonService {
  private db: DatabaseService;
  private api: AmazonSPAPI | null = null;

  constructor() {
    this.db = new DatabaseService();
  }

  /**
   * Initialize Amazon API with configuration from environment variables
   */
  private async initializeApi(): Promise<AmazonSPAPI> {
    if (this.api) {
      return this.api;
    }

    // Get Amazon API config from environment variables
    const config = getAmazonConfig();
    console.log('Amazon config check:', {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasRefreshToken: !!config.refreshToken,
      hasMarketplaceId: !!config.marketplaceId,
      marketplaceId: config.marketplaceId
    });
    
    if (!validateAmazonConfig(config)) {
      throw new Error('Amazon API configuration not found. Please configure your Amazon API credentials in environment variables.');
    }

    // Create AmazonSPAPI instance with configuration
    this.api = new AmazonSPAPI({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
      marketplaceId: config.marketplaceId
    });

    return this.api;
  }

  // ===== ORDER MANAGEMENT =====
  
  /**
   * Sync orders from Amazon API and store in database
   */
  async syncOrders(fromDate?: Date, toDate?: Date): Promise<{ 
    success: boolean; 
    existingOrders: number; 
    newOrders: number; 
    updatedOrders: number;
    errors: number;
    totalProcessed: number;
  }> {
    try {
      // Check if API is configured
      if (!(await this.isApiConfigured())) {
        throw new Error('Amazon API is not properly configured. Please set up your API credentials first.');
      }

      // Get date range for sync
      const startDate = fromDate || addDays(new Date(), -30);
      const endDate = toDate || new Date();

      // Initialize API and fetch orders from Amazon API
      const api = await this.initializeApi();
      console.log('API initialized successfully');
      
      const ordersResponse = await api.getOrders(startDate.toISOString());
      const response = ordersResponse as GetOrdersResponse;


      const orders = response?.Orders || [];
      console.log('Orders found:', orders.length);
      
      let existingOrders = 0;
      let newOrders = 0;
      let updatedOrders = 0;
      let errors = 0;

      // Process orders in batches for better performance
      const batchSize = 50;
      for (let i = 0; i < orders.length; i += batchSize) {
        const batch = orders.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (order) => {
            try {
              // Convert Amazon SP API order to our database format
              const dbOrder = this.convertAmazonOrderToLegacy(order);
              
              // Check if order already exists
              const existingOrder = await this.db.getOrderByAmazonOrderId(dbOrder.amazonOrderId);
              
              if (!existingOrder) {
                // Create new order
                await this.db.createOrder(dbOrder);
                newOrders++;
              } else {
                // Update existing order if needed
                await this.db.updateOrder(existingOrder.id!, dbOrder);
                updatedOrders++;
                existingOrders++;
              }
            } catch (error) {
              console.error(`Failed to sync order ${order.AmazonOrderId}:`, error);
              errors++;
            }
          })
        );
      }

      // Log sync activity
      await this.db.logActivity('orders_synced', {
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString(),
        existingOrders,
        newOrders,
        updatedOrders,
        errors,
        total: orders.length
      });

      return { 
        success: true, 
        existingOrders, 
        newOrders, 
        updatedOrders, 
        errors, 
        totalProcessed: orders.length 
      };
    } catch (error) {
      console.error('Order sync failed:', error);
      
      await this.db.logActivity('order_sync_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      return { 
        success: false, 
        existingOrders: 0, 
        newOrders: 0, 
        updatedOrders: 0, 
        errors: 1, 
        totalProcessed: 0 
      };
    }
  }

  // ===== REVIEW REQUEST AUTOMATION =====
  
  /**
   * Main automation function - runs daily to process review requests
   */
  async runDailyAutomation(): Promise<{ success: boolean; processed: number; sent: number; failed: number; skipped: number }> {
    try {
      // Check if API is configured
      if (!(await this.isApiConfigured())) {
        throw new Error('Amazon API is not properly configured. Please set up your API credentials first.');
      }

      // Get orders eligible for review requests
      const eligibleOrders = await this.db.getOrdersEligibleForReview();
      
      let processed = 0;
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      // Process each eligible order
      for (const order of eligibleOrders) {
        try {
          processed++;
          
          // Check if order is still eligible (double-check business rules)
          if (!this.isOrderEligibleForReview(order)) {
            await this.markOrderAsSkipped(order.id, 'Order no longer eligible');
            skipped++;
            continue;
          }

          // Send review request via Amazon API
          const result = await this.sendReviewRequest(order);
          
          if (result.success) {
            // Update order and create review request record
            await this.db.updateOrder(order.id, {
              reviewRequestSent: true,
              reviewRequestDate: new Date().toISOString(),
              reviewRequestStatus: 'SENT'
            });

            await this.db.createReviewRequest({
              orderId: order.id,
              amazonOrderId: order.amazonOrderId,
              status: 'SENT',
              sentAt: new Date().toISOString(),
              retryCount: 0
            });

            sent++;
          } else {
            // Handle failure
            await this.handleReviewRequestFailure(order, result.error);
            failed++;
          }
        } catch (error) {
          console.error(`Failed to process order ${order.id}:`, error);
          await this.handleReviewRequestFailure(order, error instanceof Error ? error.message : 'Unknown error');
          failed++;
        }
      }

      // Log automation results
      await this.db.logActivity('daily_automation_completed', {
        processed,
        sent,
        failed,
        skipped,
        timestamp: new Date().toISOString()
      });

      return { success: true, processed, sent, failed, skipped };
    } catch (error) {
      console.error('Daily automation failed:', error);
      
      await this.db.logActivity('daily_automation_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      return { success: false, processed: 0, sent: 0, failed: 0, skipped: 0 };
    }
  }

  /**
   * Retry failed review requests
   */
  async retryFailedReviewRequests(): Promise<{ success: boolean; retried: number; successCount: number }> {
    try {
      // Check if API is configured
      if (!(await this.isApiConfigured())) {
        throw new Error('Amazon API is not properly configured. Please set up your API credentials first.');
      }

      // Get failed review requests that can be retried
      const failedRequests = await this.db.getReviewRequests();
      const retryableRequests = failedRequests.filter(req => 
        req.status === 'FAILED' && req.retryCount < 3
      );

      let retried = 0;
      let successCount = 0;

      for (const request of retryableRequests) {
        try {
          retried++;
          
          // Get the associated order
          const order = await this.db.getOrderById(request.orderId);
          if (!order) {
            console.warn(`Order not found for review request ${request.id}`);
            continue;
          }

          // Check if order is still eligible
          if (!this.isOrderEligibleForReview(order)) {
            await this.db.updateReviewRequest(request.id, {
              status: 'SKIPPED',
              errorMessage: 'Order no longer eligible for review'
            });
            continue;
          }

          // Attempt to send review request again
          const result = await this.sendReviewRequest(order);
          
          if (result.success) {
            // Update both order and review request
            await Promise.all([
              this.db.updateOrder(order.id, {
                reviewRequestSent: true,
                reviewRequestDate: new Date().toISOString(),
                reviewRequestStatus: 'SENT'
              }),
              this.db.updateReviewRequest(request.id, {
                status: 'SENT',
                sentAt: new Date().toISOString(),
                retryCount: request.retryCount + 1
              })
            ]);
            
            successCount++;
          } else {
            // Update retry count and status
            await this.db.updateReviewRequest(request.id, {
              status: 'FAILED',
              errorMessage: result.error,
              retryCount: request.retryCount + 1
            });
          }
        } catch (error) {
          console.error(`Failed to retry review request ${request.id}:`, error);
          
          await this.db.updateReviewRequest(request.id, {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            retryCount: request.retryCount + 1
          });
        }
      }

      // Log retry results
      await this.db.logActivity('failed_review_requests_retried', {
        retried,
        successCount,
        timestamp: new Date().toISOString()
      });

      return { success: true, retried, successCount };
    } catch (error) {
      console.error('Retry failed review requests failed:', error);
      
      await this.db.logActivity('retry_failed_review_requests_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      return { success: false, retried: 0, successCount: 0 };
    }
  }

  // ===== HELPER METHODS =====
  
  /**
   * Check if order is eligible for review request
   */
  private isOrderEligibleForReview(order: LegacyAmazonOrder): boolean {
    // Basic eligibility checks
    if (order.isReturned) return false;
    if (order.reviewRequestSent) return false;
    if (order.orderStatus !== 'DELIVERED') return false;

    // Check delivery date (must be at least 25 days old)
    const deliveryDate = new Date(order.deliveryDate);
    const twentyFiveDaysAgo = addDays(new Date(), -25);
    
    if (isBefore(deliveryDate, twentyFiveDaysAgo)) {
      return true;
    }

    return false;
  }

  /**
   * Send review request via Amazon API
   */
  private async sendReviewRequest(order: LegacyAmazonOrder): Promise<{ success: boolean; error?: string }> {
    try {
      // Initialize API and send review request
      const api = await this.initializeApi();
      const result = await api.createReviewSolicitation(order.amazonOrderId);
      
      // The Amazon SP API response doesn't have success/error wrapper
      // If no errors are returned, it's considered successful
      if (!result.errors || result.errors.length === 0) {
        return { success: true };
      } else {
        return { success: false, error: result.errors[0]?.message || 'Unknown API error' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Handle review request failure
   */
  private async handleReviewRequestFailure(order: LegacyAmazonOrder, error: string): Promise<void> {
    try {
      // Update order status
      await this.db.updateOrder(order.id, {
        reviewRequestStatus: 'FAILED',
        reviewRequestError: error
      });

      // Create review request record
      await this.db.createReviewRequest({
        orderId: order.id,
        amazonOrderId: order.amazonOrderId,
        status: 'FAILED',
        errorMessage: error,
        retryCount: 0
      });
    } catch (dbError) {
      console.error('Failed to handle review request failure:', dbError);
    }
  }

  /**
   * Mark order as skipped
   */
  private async markOrderAsSkipped(orderId: string, reason: string): Promise<void> {
    try {
      await this.db.updateOrder(orderId, {
        reviewRequestStatus: 'SKIPPED',
        reviewRequestError: reason
      });

      await this.db.createReviewRequest({
        orderId,
        amazonOrderId: orderId, // Use orderId as fallback
        status: 'SKIPPED',
        errorMessage: reason,
        retryCount: 0
      });
    } catch (error) {
      console.error('Failed to mark order as skipped:', error);
    }
  }

  /**
   * Convert Amazon SP API order to legacy format for database storage
   */
  private convertAmazonOrderToLegacy(amazonOrder: AmazonOrder): LegacyAmazonOrder {
    // Extract delivery date from earliest delivery date or use purchase date as fallback
    const deliveryDate = amazonOrder.EarliestDeliveryDate || 
                        amazonOrder.LatestDeliveryDate || 
                        amazonOrder.PurchaseDate;

    // Extract buyer info
    const buyerEmail = amazonOrder.BuyerInfo?.BuyerEmail || '';
    const buyerName = amazonOrder.BuyerInfo?.BuyerName || '';

    // Extract order total
    const orderTotal = amazonOrder.OrderTotal || { CurrencyCode: 'USD', Amount: '0.00' };

    // Create legacy order item (simplified - in real implementation you'd fetch order items separately)
    const legacyItem: any = {
      id: '', // Will be generated by database
      asin: '', // Will be filled when order items are fetched
      sku: '',
      title: '',
      quantity: 1,
      price: {
        currencyCode: orderTotal.CurrencyCode,
        amount: orderTotal.Amount
      }
    };

    return {
      id: '', // Will be generated by database
      amazonOrderId: amazonOrder.AmazonOrderId,
      purchaseDate: amazonOrder.PurchaseDate,
      deliveryDate: deliveryDate,
      orderStatus: this.mapOrderStatus(amazonOrder.OrderStatus),
      orderTotal: {
        currencyCode: orderTotal.CurrencyCode,
        amount: orderTotal.Amount
      },
      marketplaceId: amazonOrder.MarketplaceId,
      buyerInfo: {
        email: buyerEmail,
        name: buyerName
      },
      items: [legacyItem],
      isReturned: false, // Default value
      returnDate: undefined,
      reviewRequestSent: false,
      reviewRequestDate: undefined,
      reviewRequestStatus: undefined,
      reviewRequestError: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Map Amazon SP API order status to our internal status
   */
  private mapOrderStatus(amazonStatus: string): string {
    switch (amazonStatus) {
      case 'Shipped':
        return 'DELIVERED';
      case 'Canceled':
        return 'CANCELLED';
      case 'Unfulfillable':
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  }

  // ===== UTILITY METHODS =====
  
  /**
   * Check if Amazon API is properly configured
   */
  async isApiConfigured(): Promise<boolean> {
    try {
      const config = getAmazonConfig();
      return !!(config && config.clientId && config.clientSecret && config.refreshToken && config.marketplaceId);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; details: any }> {
    try {
      // Check database health
      const dbHealth = await this.db.getDashboardStats();
      
      // Check if API is configured
      const apiConfigured = await this.isApiConfigured();
      
      let apiHealth = null;
      if (apiConfigured) {
        try {
          // Check API health (basic connectivity test)
          const api = await this.initializeApi();
          apiHealth = await api.getAccessToken();
        } catch (apiError) {
          apiHealth = { success: false, error: apiError instanceof Error ? apiError.message : 'API test failed' };
        }
      }
      
      return {
        healthy: true,
        details: {
          database: dbHealth,
          apiConfigured,
          api: apiHealth,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get automation statistics
   */
  async getAutomationStats(): Promise<any> {
    try {
      const [dbStats, recentActivity] = await Promise.all([
        this.db.getDashboardStats(),
        this.db.getActivityLogs(100, undefined, 'daily_automation_completed')
      ]);

      return {
        database: dbStats,
        recentAutomation: recentActivity,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get automation stats:', error);
      throw error;
    }
  }
}
