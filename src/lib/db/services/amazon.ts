import { DatabaseService } from './database';
import { AmazonSPAPI } from '../../amazon-api';
import { getAmazonConfig, validateAmazonConfig } from '../../config/amazon';
import type { 
  AmazonOrder, 
  LegacyAmazonOrder,
  LegacyOrderItem,
} from '$lib/types';
import { ReviewRequestStatus } from '$lib/types';
import { addDays, isBefore } from 'date-fns';
import pLimit from 'p-limit';

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
   * Async generator to fetch all orders with pagination
   */
  private async *fetchAllOrders(fromDate: Date): AsyncGenerator<AmazonOrder[], void, unknown> {
    const api = await this.initializeApi();
    let nextToken: string | undefined;
    let hasMorePages = true;
    
    console.log('Starting to fetch all orders with pagination...');
    
    while (hasMorePages) {
      try {
        console.log(`Fetching orders page${nextToken ? ' with nextToken' : ''}...`);
        
        const response = await api.getOrders(fromDate.toISOString(), nextToken);
        const orders = response?.Orders || [];
        
        console.log(`Fetched ${orders.length} orders in this page`);
        
        if (orders.length > 0) {
          yield orders;
        }
        
        // Check if there are more pages
        nextToken = response?.NextToken;
        hasMorePages = !!nextToken && orders.length > 0;
        
        if (hasMorePages) {
          console.log('More pages available, continuing...');
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.log('No more pages available');
        }
      } catch (error) {
        console.error('Error fetching orders page:', error);
        throw error;
      }
    }
  }
  
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

      console.log('Starting order sync with date range:', {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      });
      
      let existingOrders = 0;
      let newOrders = 0;
      let updatedOrders = 0;
      let errors = 0;
      let totalProcessed = 0;

      // Process orders with limited concurrency to avoid DB connection issues
      const limit = pLimit(7); // Limit to 5 concurrent operations
      
      // Use the async generator to fetch all orders
      for await (const ordersBatch of this.fetchAllOrders(startDate)) {
        console.log(`Processing batch of ${ordersBatch.length} orders...`);
        
                          const orderPromises = ordersBatch.map((order) => 
           limit(async () => {
             try {
               // Convert Amazon SP API order to our database format
               const dbOrder = this.convertAmazonOrderToLegacy(order);
               
               // Check if order already exists
               const existingOrder = await this.db.getOrderByAmazonOrderId(dbOrder.amazonOrderId);
               
               if (!existingOrder) {
                 // Create new order
                 await this.db.createOrder(dbOrder);
                 return { success: true, type: 'new', orderId: order.AmazonOrderId };
               } else {
                 // Update existing order if needed
                 await this.db.updateOrder(existingOrder.id!, dbOrder);
                 return { success: true, type: 'updated', orderId: order.AmazonOrderId };
               }
             } catch (error) {
               console.error(`Failed to sync order ${order.AmazonOrderId}:`, error);
               return { success: false, error: error instanceof Error ? error.message : 'Unknown error', orderId: order.AmazonOrderId };
             }
           })
         );

         // Wait for all orders in this batch to be processed
         const results = await Promise.allSettled(orderPromises);
         
         // Process results
         for (const result of results) {
           if (result.status === 'fulfilled') {
             const orderResult = result.value;
             if (orderResult.success) {
               if (orderResult.type === 'new') {
                 newOrders++;
               } else if (orderResult.type === 'updated') {
                 updatedOrders++;
                 existingOrders++;
               }
             } else {
               errors++;
               console.error(`Failed to sync order ${orderResult.orderId}:`, orderResult.error);
             }
           } else {
             // Promise was rejected
             errors++;
             console.error('Order processing promise rejected:', result.reason);
           }
           totalProcessed++;
         }
        
        console.log(`Completed processing batch. Total processed so far: ${totalProcessed}`);
      }

      console.log('Order sync completed. Final stats:', {
        existingOrders,
        newOrders,
        updatedOrders,
        errors,
        totalProcessed
      });

      // Log sync activity
      await this.db.logActivity('orders_synced', {
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString(),
        existingOrders,
        newOrders,
        updatedOrders,
        errors,
        total: totalProcessed
      });

      return { 
        success: true, 
        existingOrders, 
        newOrders, 
        updatedOrders, 
        errors, 
        totalProcessed 
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
              reviewRequestStatus: ReviewRequestStatus.SENT
            });

            await this.db.createReviewRequest({
              orderId: order.id,
              amazonOrderId: order.amazonOrderId,
              status: ReviewRequestStatus.SENT,
              sentAt: new Date().toISOString(),
              retryCount: 0
            });

            sent++;
          } else if (result.notEligible) {
            // Handle not eligible case - mark as skipped, not failed
            await this.markOrderAsSkipped(order.id, result.error ?? 'No solicitation actions available');
            skipped++;
          } else {
            // Handle actual failure
            await this.handleReviewRequestFailure(order, result.error ?? 'Unknown error');
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
        req.status === ReviewRequestStatus.FAILED && req.retryCount < 3
      );

      let retried = 0;
      let successCount = 0;

      // Process with limited concurrency to avoid DB connection issues
      const limit = pLimit(7); // Limit to 3 concurrent operations for API calls
      
      const retryPromises = retryableRequests.map((request) => 
        limit(async () => {
          try {
            retried++;
            
            // Get the associated order
            const order = await this.db.getOrderById(request.orderId);
            if (!order) {
              console.warn(`Order not found for review request ${request.id}`);
              return;
            }

            // Check if order is still eligible
            if (!this.isOrderEligibleForReview(order)) {
              await this.db.updateReviewRequest(request.id, {
                status: ReviewRequestStatus.SKIPPED,
                errorMessage: 'Order no longer eligible for review'
              });
              return;
            }

            // Attempt to send review request again
            const result = await this.sendReviewRequest(order);
            
            if (result.success) {
              // Update both order and review request
              await Promise.all([
                this.db.updateOrder(order.id, {
                  reviewRequestSent: true,
                  reviewRequestDate: new Date().toISOString(),
                  reviewRequestStatus: ReviewRequestStatus.SENT
                }),
                this.db.updateReviewRequest(request.id, {
                  status: ReviewRequestStatus.SENT,
                  sentAt: new Date().toISOString(),
                  retryCount: request.retryCount + 1
                })
              ]);
              
              successCount++;
            } else if (result.notEligible) {
              // Handle not eligible case - mark as skipped, not failed
              await this.db.updateReviewRequest(request.id, {
                status: ReviewRequestStatus.SKIPPED,
                errorMessage: result.error,
                retryCount: request.retryCount + 1
              });
            } else {
              // Update retry count and status for actual failures
              await this.db.updateReviewRequest(request.id, {
                status: ReviewRequestStatus.FAILED,
                errorMessage: result.error,
                retryCount: request.retryCount + 1
              });
            }
          } catch (error) {
            console.error(`Failed to retry review request ${request.id}:`, error);
            
            await this.db.updateReviewRequest(request.id, {
              status: ReviewRequestStatus.FAILED,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              retryCount: request.retryCount + 1
            });
          }
        })
      );

      // Wait for all retry operations to be processed
      await Promise.allSettled(retryPromises);

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
    
    // Check if order status is eligible for review (Shipped or PartiallyShipped)
    if (order.orderStatus !== 'Shipped' && order.orderStatus !== 'PartiallyShipped') return false;

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
  private async sendReviewRequest(order: LegacyAmazonOrder): Promise<{ success: boolean; error?: string; notEligible?: boolean }> {
    try {
      // Initialize API and send review request
      const api = await this.initializeApi();
      
      console.log(`Attempting to send review request for order ${order.amazonOrderId}`);
      
      const result = await api.createReviewSolicitation(order.amazonOrderId);
      
      // Check if the order is not eligible for review requests
      if ('notEligible' in result && result.notEligible) {
        console.log(`Order ${order.amazonOrderId} is not eligible for review requests: ${result.reason}`);
        return { success: false, notEligible: true, error: result.reason };
      }
      
      // Check for errors in the response (only if it's a regular response, not notEligible)
      if ('errors' in result && result.errors && result.errors.length > 0) {
        const firstError = result.errors[0];
        const errorMessage = firstError.message;
        console.error(`Review solicitation failed for order ${order.amazonOrderId}:`, errorMessage);
        return { success: false, error: errorMessage };
      }
      
      console.log(`Review solicitation successful for order ${order.amazonOrderId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Review solicitation failed for order ${order.amazonOrderId}:`, errorMessage);
      return { 
        success: false, 
        error: errorMessage
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
        reviewRequestStatus: ReviewRequestStatus.FAILED,
        reviewRequestError: error
      });

      // Create review request record
      await this.db.createReviewRequest({
        orderId: order.id,
        amazonOrderId: order.amazonOrderId,
        status: ReviewRequestStatus.FAILED,
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
        reviewRequestStatus: ReviewRequestStatus.SKIPPED,
        reviewRequestError: reason
      });

      await this.db.createReviewRequest({
        orderId,
        amazonOrderId: orderId, // Use orderId as fallback
        status: ReviewRequestStatus.SKIPPED,
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
    // Extract delivery date from latest delivery date or use purchase date as fallback
    const deliveryDate = amazonOrder.LatestDeliveryDate || 
                        amazonOrder.EarliestDeliveryDate || 
                        amazonOrder.PurchaseDate;

    // Extract buyer info
    const buyerEmail = amazonOrder.BuyerInfo?.BuyerEmail || '';
    const buyerName = amazonOrder.BuyerInfo?.BuyerName || '';

    // Extract order total
    const orderTotal = amazonOrder.OrderTotal || { CurrencyCode: 'USD', Amount: '0.00' };

              // Create legacy order item (simplified - in real implementation you'd fetch order items separately)
     const legacyItem = {
       id: '', // Will be generated by database
       asin: '', // Will be filled when order items are fetched
       sku: '',
       title: '',
       quantity: 1,
       price: {
         currencyCode: orderTotal.CurrencyCode,
         amount: orderTotal.Amount
       }
     } as LegacyOrderItem;

    return {
      id: '', // Will be generated by database
      amazonOrderId: amazonOrder.AmazonOrderId,
      purchaseDate: amazonOrder.PurchaseDate,
      deliveryDate: deliveryDate,
      orderStatus: amazonOrder.OrderStatus,
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



  // ===== UTILITY METHODS =====
  
  /**
   * Check if Amazon API is properly configured
   */
  async isApiConfigured(): Promise<boolean> {
    try {
      const config = getAmazonConfig();
      return !!(config && config.clientId && config.clientSecret && config.refreshToken && config.marketplaceId);
    } catch {
      return false;
    }
  }


}
