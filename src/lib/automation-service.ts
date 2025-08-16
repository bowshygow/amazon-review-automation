import { AmazonSPAPI } from './amazon-api';
import { DatabaseService } from './database';
import type { LegacyAmazonOrder, LegacyReviewRequest, AmazonAPIConfig } from './types';
import { addDays, format, parseISO } from 'date-fns';

export class AutomationService {
  private amazonAPI: AmazonSPAPI;
  private db: DatabaseService;

  constructor(config: AmazonAPIConfig) {
    this.amazonAPI = new AmazonSPAPI(config);
    this.db = new DatabaseService();
  }

  // Main automation function - runs daily
  async runDailyAutomation(): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    try {
      // 1. Get orders eligible for review (delivered 25+ days ago, not returned, not sent)
      const eligibleOrders = await this.db.getOrdersEligibleForReview();
      
      console.log(`Found ${eligibleOrders.length} orders eligible for review requests`);

      // 2. Process each eligible order
      for (const order of eligibleOrders) {
        try {
          const result = await this.processOrderForReview(order);
          if (result.success) {
            processed++;
            await this.db.logActivity('review_request_processed', {
              orderId: order.id,
              amazonOrderId: order.amazonOrderId,
              status: result.status,
              message: result.message
            }, order.id);
          } else {
            errors.push(`Order ${order.amazonOrderId}: ${result.error}`);
            await this.db.logActivity('review_request_failed', {
              orderId: order.id,
              amazonOrderId: order.amazonOrderId,
              error: result.error
            }, order.id);
          }
        } catch (error: any) {
          errors.push(`Order ${order.amazonOrderId}: ${error.message}`);
          await this.db.logActivity('review_request_error', {
            orderId: order.id,
            amazonOrderId: order.amazonOrderId,
            error: error.message
          }, order.id);
        }
      }

      await this.db.logActivity('daily_automation_completed', {
        processed,
        errors: errors.length,
        totalEligible: eligibleOrders.data.length
      });

      return { success: true, processed, errors };
    } catch (error: any) {
      await this.db.logActivity('daily_automation_failed', {
        error: error.message
      });
      return { success: false, processed, errors: [error.message] };
    }
  }

  // Process a single order for review request
  private async processOrderForReview(order: LegacyAmazonOrder): Promise<{ success: boolean; status: string; message: string; error?: string }> {
    try {
      // 1. Check if order is eligible for solicitation
      const solicitationCheck = await this.amazonAPI.getSolicitationActions(order.amazonOrderId);
      
      if (!solicitationCheck.success) {
        return {
          success: false,
          status: 'failed',
          message: 'Failed to check solicitation eligibility',
          error: solicitationCheck.error
        };
      }

      // Check if order has actions available (eligible for solicitation)
      // The SDK response format may be different, so we need to handle it properly
      const hasActions = solicitationCheck.data?._embedded?.actions && 
                        Array.isArray(solicitationCheck.data._embedded.actions) && 
                        solicitationCheck.data._embedded.actions.length > 0;
      
      if (!hasActions) {
        // Order is not eligible for solicitation (e.g., already sent, outside window, etc.)
        await this.markOrderAsSkipped(order, 'Order not eligible for solicitation');
        return {
          success: true,
          status: 'skipped',
          message: 'Order not eligible for solicitation'
        };
      }

      // 2. Send review solicitation
      const solicitationResult = await this.amazonAPI.createReviewSolicitation(order.amazonOrderId);
      
      if (!solicitationResult.success) {
        // Create failed review request record
        await this.createFailedReviewRequest(order, solicitationResult.error || 'Unknown error');
        return {
          success: false,
          status: 'failed',
          message: 'Failed to send review solicitation',
          error: solicitationResult.error
        };
      }

      // 3. Create successful review request record
      await this.createSuccessfulReviewRequest(order);

      // 4. Update order status
      await this.db.updateOrder(order.id, {
        reviewRequestSent: true,
        reviewRequestDate: new Date().toISOString(),
        reviewRequestStatus: 'sent'
      });

      return {
        success: true,
        status: 'sent',
        message: 'Review request sent successfully'
      };

    } catch (error: any) {
      return {
        success: false,
        status: 'error',
        message: 'Unexpected error processing order',
        error: error.message
      };
    }
  }

  // Mark order as skipped
  private async markOrderAsSkipped(order: AmazonOrder, reason: string): Promise<void> {
    // Create skipped review request record
    await this.createSkippedReviewRequest(order, reason);

    // Update order status
    await this.db.updateOrder(order.id, {
      reviewRequestSent: true,
      reviewRequestDate: new Date().toISOString(),
      reviewRequestStatus: 'skipped',
      reviewRequestError: reason
    });
  }

  // Create successful review request record
  private async createSuccessfulReviewRequest(order: AmazonOrder): Promise<void> {
    const reviewRequest: Omit<ReviewRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      orderId: order.id,
      amazonOrderId: order.amazonOrderId,
      status: 'sent',
      sentAt: new Date().toISOString(),
      retryCount: 0
    };

    await this.db.createReviewRequest(reviewRequest);
  }

  // Create failed review request record
  private async createFailedReviewRequest(order: AmazonOrder, error: string): Promise<void> {
    const reviewRequest: Omit<ReviewRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      orderId: order.id,
      amazonOrderId: order.amazonOrderId,
      status: 'failed',
      errorMessage: error,
      retryCount: 0
    };

    await this.db.createReviewRequest(reviewRequest);
  }

  // Create skipped review request record
  private async createSkippedReviewRequest(order: AmazonOrder, reason: string): Promise<void> {
    const reviewRequest: Omit<ReviewRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      orderId: order.id,
      amazonOrderId: order.amazonOrderId,
      status: 'skipped',
      errorMessage: reason,
      retryCount: 0
    };

    await this.db.createReviewRequest(reviewRequest);
  }

  // Retry failed review requests
  async retryFailedRequests(): Promise<{ success: boolean; retried: number; errors: string[] }> {
    const errors: string[] = [];
    let retried = 0;

    try {
      // Get failed review requests
      const failedRequests = await this.db.getReviewRequests();
      
      if (!failedRequests.success || !failedRequests.data) {
        throw new Error('Failed to get failed review requests');
      }

      const failed = failedRequests.data.filter(req => req.status === 'failed' && req.retryCount < 3);

      for (const request of failed) {
        try {
          // Get the order
          const orderResult = await this.db.getOrderById(request.orderId);
          if (!orderResult.success || !orderResult.data) {
            errors.push(`Failed to get order for request ${request.id}`);
            continue;
          }

          const order = orderResult.data;

          // Check if order is still eligible (not returned)
          if (order.isReturned) {
            await this.markOrderAsSkipped(order, 'Order was returned');
            continue;
          }

          // Retry the solicitation
          const solicitationResult = await this.amazonAPI.createReviewSolicitation(order.amazonOrderId);
          
          if (solicitationResult.success) {
            // Update review request to success
            await this.db.updateReviewRequest(request.id, {
              status: 'sent',
              sentAt: new Date().toISOString(),
              retryCount: request.retryCount + 1
            });

            // Update order status
            await this.db.updateOrder(order.id, {
              reviewRequestSent: true,
              reviewRequestDate: new Date().toISOString(),
              reviewRequestStatus: 'sent'
            });

            retried++;
          } else {
            // Increment retry count
            await this.db.updateReviewRequest(request.id, {
              retryCount: request.retryCount + 1,
              errorMessage: solicitationResult.error
            });

            errors.push(`Failed to retry request ${request.id}: ${solicitationResult.error}`);
          }
        } catch (error: any) {
          errors.push(`Error retrying request ${request.id}: ${error.message}`);
        }
      }

      return { success: true, retried, errors };
    } catch (error: any) {
      return { success: false, retried, errors: [error.message] };
    }
  }

  // Sync orders from Amazon (manual trigger)
  async syncOrdersFromAmazon(daysBack: number = 30): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const startDate = format(addDays(new Date(), -daysBack), 'yyyy-MM-dd');
      
      // Get orders from Amazon API
      const ordersResult = await this.amazonAPI.getOrders(startDate);
      
      if (!ordersResult.success || !ordersResult.data) {
        throw new Error('Failed to get orders from Amazon API');
      }
      const orders = ordersResult.data.Orders;

      for (const amazonOrder of orders) {
        try {
          // Check if order already exists
          const existingOrder = await this.db.getOrders({
            search: amazonOrder.AmazonOrderId
          });

          if (existingOrder.success && existingOrder.data && existingOrder.data.length > 0) {
            // Update existing order
            const order = existingOrder.data[0];
            const updateResult = await this.db.updateOrder(order.id, {
              orderStatus: amazonOrder.OrderStatus as any,
              orderTotal: {
                currencyCode: amazonOrder.OrderTotal.CurrencyCode,
                amount: amazonOrder.OrderTotal.Amount
              },
              updatedAt: new Date().toISOString()
            });
            
            if (!updateResult.success) {
              errors.push(`Failed to update order ${amazonOrder.AmazonOrderId}: ${updateResult.error}`);
            } else {
              synced++;
            }
          } else {
            // Create new order
            const newOrder: Omit<AmazonOrder, 'id' | 'createdAt' | 'updatedAt'> = {
              amazonOrderId: amazonOrder.AmazonOrderId,
              purchaseDate: amazonOrder.PurchaseDate,
              deliveryDate: amazonOrder.EarliestShipDate || amazonOrder.PurchaseDate, // Use ship date as delivery date for now
              orderStatus: amazonOrder.OrderStatus as any,
              orderTotal: {
                currencyCode: amazonOrder.OrderTotal.CurrencyCode,
                amount: amazonOrder.OrderTotal.Amount
              },
              marketplaceId: amazonOrder.MarketplaceId,
              buyerInfo: {
                email: amazonOrder.BuyerInfo?.Email,
                name: amazonOrder.BuyerInfo?.Name
              },
              items: [], // Will be populated separately if needed
              isReturned: false, // Will be updated when we sync returns
              reviewRequestSent: false
            };

            const createResult = await this.db.createOrder(newOrder);
            if (!createResult.success) {
              errors.push(`Failed to create order ${amazonOrder.AmazonOrderId}: ${createResult.error}`);
            } else {
              synced++;
            }
          }
        } catch (error: any) {
          errors.push(`Failed to sync order ${amazonOrder.AmazonOrderId}: ${error.message}`);
        }
      }

      // Log activity with correct success/failure status
      if (errors.length === 0) {
        await this.db.logActivity('orders_sync_completed', {
          synced,
          errors: errors.length,
          daysBack
        });
      } else {
        await this.db.logActivity('orders_sync_partial', {
          synced,
          errors: errors.length,
          daysBack,
          errorDetails: errors.slice(0, 10) // Log first 10 errors
        });
      }

      return { success: errors.length === 0, synced, errors };
    } catch (error: any) {
      await this.db.logActivity('orders_sync_failed', {
        error: error.message
      });
      return { success: false, synced, errors: [error.message] };
    }
  }

  // Update Amazon API configuration
  updateConfig(newConfig: Partial<AmazonAPIConfig>): void {
    this.amazonAPI.updateConfig(newConfig);
  }
}
