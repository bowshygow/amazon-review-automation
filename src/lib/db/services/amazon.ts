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
import { logger } from '$lib/logger';

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
                 // Update existing order with latest API fields (explicitly include nulls)
                 await this.db.updateOrder(existingOrder.id!, {
                   amazonOrderId: dbOrder.amazonOrderId,
                   purchaseDate: dbOrder.purchaseDate,
                   deliveryDate: dbOrder.deliveryDate ?? null,
                   orderStatus: dbOrder.orderStatus,
                   orderTotal: {
                     currencyCode: dbOrder.orderTotal.currencyCode,
                     amount: dbOrder.orderTotal.amount
                   },
                   marketplaceId: dbOrder.marketplaceId,
                   buyerInfo: {
                     email: dbOrder.buyerInfo.email,
                     name: dbOrder.buyerInfo.name
                   }
                   // Note: intentionally not updating items, isReturned, and all reviewRequest* fields here
                   // to avoid overwriting internal automation state with API defaults
                 });
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
   * Core function to process a single review request
   * This is the single source of truth for review request processing logic
   */
  private async processReviewRequest(
    order: LegacyAmazonOrder, 
    options: {
      isRetry?: boolean;
      existingRequestId?: string;
      currentRetryCount?: number;
    } = {}
  ): Promise<{
    success: boolean;
    status: 'SENT' | 'FAILED' | 'SKIPPED' | 'NOT_ELIGIBLE';
    error?: string;
    reviewRequestId?: string;
  }> {
    try {
      // Validate order exists and is eligible
      if (!this.isOrderEligibleForReview(order)) {
        logger.info('Order not eligible for review request', {
          orderId: order.id,
          amazonOrderId: order.amazonOrderId,
          reason: 'Business rules validation failed'
        });
        
        await this.markOrderAsSkipped(order.id, 'Order not eligible for review');
        return { success: false, status: 'SKIPPED', error: 'Order not eligible for review' };
      }

      // Send review request via Amazon API with verification
      const result = await this.sendReviewRequest(order);
      
      if (result.success) {
        // Update order and create/update review request in a single transaction
        logger.info('Review request successful - updating database in transaction...', { 
          orderId: order.id,
          isRetry: options.isRetry 
        });

        if (options.isRetry && options.existingRequestId) {
          // For retries, update existing review request
          await Promise.all([
            this.db.updateOrder(order.id, {
              reviewRequestSent: true,
              reviewRequestDate: new Date().toISOString(),
              reviewRequestStatus: ReviewRequestStatus.SENT
            }),
                         this.db.updateReviewRequest(options.existingRequestId, {
               status: ReviewRequestStatus.SENT,
               sentAt: new Date().toISOString(),
               retryCount: (options.currentRetryCount || 0) + 1
             })
          ]);
          
          logger.info('Retry transaction completed successfully', { 
            orderId: order.id,
            requestId: options.existingRequestId 
          });
          
          return { 
            success: true, 
            status: 'SENT', 
            reviewRequestId: options.existingRequestId 
          };
        } else {
          // For new requests, create new review request
          const dbResult = await this.db.updateOrderAndCreateReviewRequest(
            order.id,
            {
              reviewRequestSent: true,
              reviewRequestDate: new Date().toISOString(),
              reviewRequestStatus: ReviewRequestStatus.SENT
            },
            {
              orderId: order.id,
              amazonOrderId: order.amazonOrderId,
              status: ReviewRequestStatus.SENT,
              sentAt: new Date().toISOString(),
              retryCount: 0
            }
          );
          
          logger.info('Transaction completed successfully', { 
            orderId: order.id,
            reviewRequestId: dbResult.reviewRequest.id
          });
          
          return { 
            success: true, 
            status: 'SENT', 
            reviewRequestId: dbResult.reviewRequest.id 
          };
        }
      } else if (result.notEligible) {
        // Handle not eligible case - mark as skipped
        await this.markOrderAsSkipped(order.id, result.error ?? 'No solicitation actions available');
        return { success: false, status: 'NOT_ELIGIBLE', error: result.error };
      } else {
        // Handle actual failure
        await this.handleReviewRequestFailure(order, result.error ?? 'Unknown error');
        return { success: false, status: 'FAILED', error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process review request', {
        orderId: order.id,
        amazonOrderId: order.amazonOrderId,
        error: errorMessage
      });
      
      await this.handleReviewRequestFailure(order, errorMessage);
      return { success: false, status: 'FAILED', error: errorMessage };
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
      const limit = pLimit(7);
      
      const retryPromises = retryableRequests.map((request) => 
        limit(async () => {
          try {
            retried++;
            
            // Get the associated order
            const order = await this.db.getOrderById(request.orderId);
            if (!order) {
              logger.warn('Order not found for review request', { 
                requestId: request.id,
                orderId: request.orderId 
              });
              return;
            }

                         // Use the core processing function
             const result = await this.processReviewRequest(order, {
               isRetry: true,
               existingRequestId: request.id,
               currentRetryCount: request.retryCount
             });
            
            if (result.success) {
              successCount++;
            }
          } catch (error) {
            logger.error('Failed to retry review request', {
              requestId: request.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
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
      logger.error('Retry failed review requests failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      await this.db.logActivity('retry_failed_review_requests_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      return { success: false, retried: 0, successCount: 0 };
    }
  }

  /**
   * Process returns report and update orders with return information
   */
  async processReturnsReport(dataStartTime: Date, dataEndTime: Date): Promise<{
    success: boolean;
    reportId?: string;
    processedReturns: number;
    updatedOrders: number;
    errors: number;
  }> {
    try {
      const api = await this.initializeApi();
      
      logger.info('Starting returns report processing', {
        dataStartTime: dataStartTime.toISOString(),
        dataEndTime: dataEndTime.toISOString()
      });

      // Step 1: Create returns report
      const createReportResponse = await api.createReturnsReport(
        dataStartTime.toISOString(),
        dataEndTime.toISOString()
      ) as { reportId: string };
      
      const reportId = createReportResponse.reportId;
      if (!reportId) {
        throw new Error('No report ID returned from Amazon API');
      }

      logger.info('Returns report created', { reportId });

      // Step 2: Wait for report to be ready
      const report = await api.waitForReportReady(reportId);
      
      if (!report.reportDocumentId) {
        throw new Error('No report document ID in completed report');
      }

      // Step 3: Download and parse report data
      const returnsData = await api.downloadReturnsReport(report.reportDocumentId);
      
      logger.info('Returns report data downloaded', { 
        rowCount: returnsData.length,
        reportId,
        reportDocumentId: report.reportDocumentId
      });

      // Step 4: Process returns data and update orders
      let processedReturns = 0;
      let updatedOrders = 0;
      let errors = 0;

      for (const returnRecord of returnsData) {
        try {
          const orderId = returnRecord['Order ID'];
      
          const returnDate = returnRecord['Return request date'];
          const returnStatus = returnRecord['Return request status'];
          const isInPolicy = returnRecord['In policy'] === 'Y';

          if (!orderId) {
            logger.warn('Return record missing order ID', { returnRecord });
            continue;
          }

          // Find the order in our database
          const order = await this.db.getOrderByAmazonOrderId(orderId);
          
          if (!order) {
            logger.warn('Order not found in database for return', { 
              orderId,
              returnDate,
              returnStatus 
            });
            continue;
          }

                     // Update order with return information (simplified - just mark as returned)
           await this.db.updateOrder(order.id, {
             isReturned: true,
             returnDate: returnDate ? new Date(returnDate).toISOString() : undefined
           });

          updatedOrders++;
          processedReturns++;

          logger.info('Order updated with return information', {
            orderId,
            returnDate,
            returnStatus,
            isInPolicy
          });

        } catch (error) {
          errors++;
          logger.error('Error processing return record', {
            error: error instanceof Error ? error.message : 'Unknown error',
            returnRecord
          });
        }
      }

      // Log activity
      await this.db.logActivity('returns_report_processed', {
        reportId,
        processedReturns,
        updatedOrders,
        errors,
        dataStartTime: dataStartTime.toISOString(),
        dataEndTime: dataEndTime.toISOString()
      });

      return {
        success: true,
        reportId,
        processedReturns,
        updatedOrders,
        errors
      };

    } catch (error) {
      logger.error('Returns report processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        dataStartTime: dataStartTime.toISOString(),
        dataEndTime: dataEndTime.toISOString()
      });

      return {
        success: false,
        processedReturns: 0,
        updatedOrders: 0,
        errors: 1
      };
    }
  }

  /**
   * Enhanced daily automation that includes returns processing
   */
  async runEnhancedDailyAutomation(): Promise<{
    success: boolean;
    returnsProcessed: number;
    ordersUpdated: number;
    reviewRequestsProcessed: number;
    reviewRequestsSent: number;
    reviewRequestsFailed: number;
    reviewRequestsSkipped: number;
  }> {
    try {
      logger.info('Starting enhanced daily automation with returns processing');

      // Step 1: Process returns report for the last 30 days
      const returnsEndDate = new Date();
      const returnsStartDate = new Date();
      returnsStartDate.setDate(returnsStartDate.getDate() - 30);

      const returnsResult = await this.processReturnsReport(returnsStartDate, returnsEndDate);
      
      if (!returnsResult.success) {
        logger.error('Returns report processing failed, continuing with review requests');
      }

      // Step 2: Process review requests
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

                     // Use the core processing function
           const result = await this.processReviewRequest(order);
           
           if (result.success) {
             sent++;
           } else if (result.status === 'NOT_ELIGIBLE') {
             skipped++;
           } else {
             failed++;
           }
        } catch (error) {
          console.error(`Failed to process order ${order.id}:`, error);
          await this.handleReviewRequestFailure(order, error instanceof Error ? error.message : 'Unknown error');
          failed++;
        }
      }

      const reviewResult = { success: true, processed, sent, failed, skipped };

      // Step 3: Log comprehensive results
      await this.db.logActivity('enhanced_daily_automation_completed', {
        returnsProcessed: returnsResult.processedReturns,
        ordersUpdated: returnsResult.updatedOrders,
        returnsErrors: returnsResult.errors,
        reviewRequestsProcessed: reviewResult.processed,
        reviewRequestsSent: reviewResult.sent,
        reviewRequestsFailed: reviewResult.failed,
        reviewRequestsSkipped: reviewResult.skipped,
        timestamp: new Date().toISOString()
      });

      return {
        success: reviewResult.success,
        returnsProcessed: returnsResult.processedReturns,
        ordersUpdated: returnsResult.updatedOrders,
        reviewRequestsProcessed: reviewResult.processed,
        reviewRequestsSent: reviewResult.sent,
        reviewRequestsFailed: reviewResult.failed,
        reviewRequestsSkipped: reviewResult.skipped
      };

    } catch (error) {
      logger.error('Enhanced daily automation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      await this.db.logActivity('enhanced_daily_automation_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        returnsProcessed: 0,
        ordersUpdated: 0,
        reviewRequestsProcessed: 0,
        reviewRequestsSent: 0,
        reviewRequestsFailed: 0,
        reviewRequestsSkipped: 0
      };
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
    if (!order.deliveryDate) return false;
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
    // Extract delivery date from latest or earliest delivery date
    const deliveryDate = amazonOrder.LatestShipDate || amazonOrder.EarliestShipDate || null;

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

  /**
   * Check solicitation actions for a specific order
   */
  async checkSolicitationActions(orderId: string): Promise<{
    hasActions: boolean;
    actions?: string[];
    error?: string;
  }> {
    try {
      logger.info('Checking solicitation actions for order', { orderId });
      
      const api = await this.initializeApi();
      const response = await api.getSolicitationActions(orderId);
      
      if (response.errors && response.errors.length > 0) {
        const errorMessage = response.errors[0].message;
        logger.error('Solicitation actions check failed', {
          orderId,
          error: errorMessage
        });
        return {
          hasActions: false,
          error: errorMessage
        };
      }
      
      const actions = response.actions?.map(action => action.name) || [];
      const hasActions = actions.length > 0;
      
      logger.info('Solicitation actions check completed', {
        orderId,
        hasActions,
        actionCount: actions.length,
        actions
      });
      
      return {
        hasActions,
        actions
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Solicitation actions check failed', {
        orderId,
        error: errorMessage
      });
      
      return {
        hasActions: false,
        error: errorMessage
      };
    }
  }

  /**
   * Trigger a review request for a specific order
   */
    async triggerReviewRequest(amazonOrderId: string): Promise<{
    success: boolean;
    status: string;
    error?: string;
  }> {
    try {
      logger.info('Triggering review request for order', { amazonOrderId });
      
      // First, find the order by amazonOrderId to get the database UUID
      const order = await this.db.getOrderByAmazonOrderId(amazonOrderId);
      if (!order) {
        logger.error('Order not found in database', { amazonOrderId });
        return {
          success: false,
          status: 'FAILED',
          error: 'Order not found in database'
        };
      }
      
      logger.info('Found order in database', { 
        amazonOrderId,
        orderId: order.id,
        currentReviewStatus: order.reviewRequestSent
      });
      
      // Use the core processing function
      const result = await this.processReviewRequest(order);
      
      return {
        success: result.success,
        status: result.status,
        error: result.error
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Review request trigger failed', {
        amazonOrderId,
        error: errorMessage
      });
      
      return {
        success: false,
        status: 'FAILED',
        error: errorMessage
      };
    }
  }

}
