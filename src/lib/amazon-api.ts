import { SellingPartner } from 'amazon-sp-api';
import type { 
  AmazonAPIConfig, 
  GetOrdersResponse,
  CreateProductReviewAndSellerFeedbackSolicitationResponse,
  GetSolicitationActionsForOrderResponse
} from './types';
import { logger } from './logger';

export class AmazonSPAPI {
  private client: SellingPartner;
  private config: AmazonAPIConfig;

  constructor(config: AmazonAPIConfig) {
    this.config = config;
    logger.info('Initializing Amazon SP-API client', {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasRefreshToken: !!config.refreshToken,
      hasMarketplaceId: !!config.marketplaceId,
      marketplaceId: config.marketplaceId
    });
    
    // Initialize the Selling Partner API client
    this.client = new SellingPartner({
      region: this.getRegionFromMarketplaceId(config.marketplaceId),
      refresh_token: config.refreshToken,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: config.clientId,
        SELLING_PARTNER_APP_CLIENT_SECRET: config.clientSecret
      },
      options: {
        auto_request_tokens: true,
        auto_request_throttled: true,
        version_fallback: true,
        use_sandbox: config.isTest || false,
        debug_log: process.env.NODE_ENV === 'development'
      }
    });
  }

  // Helper method to determine region from marketplace ID
  private getRegionFromMarketplaceId(marketplaceId: string): 'na' | 'eu' | 'fe' {
    // North America marketplaces
    if (marketplaceId.startsWith('ATVPDKIKX0DER') || // US
        marketplaceId.startsWith('A2EUQ1WTGCTBG2') || // Canada
        marketplaceId.startsWith('A1AM78C64UM0Y8') || // Mexico
        marketplaceId.startsWith('A2Q3Y263D00KWC')) { // Brazil
      return 'na';
    }
    // Europe marketplaces
    else if (marketplaceId.startsWith('A1PA6795UKMFR9') || // Germany
             marketplaceId.startsWith('A1RKKUPIHCS9HS') || // Spain
             marketplaceId.startsWith('A1F83G8C2ARO7P') || // UK
             marketplaceId.startsWith('A13V1IB3VIYZZH') || // France
             marketplaceId.startsWith('A21TJRUUN4KGV') || // India
             marketplaceId.startsWith('APJ6JRA9NG5V4') || // Italy
             marketplaceId.startsWith('A1805F23G6M6Q9') || // Netherlands
             marketplaceId.startsWith('A1C3SOZRARQ6R3') || // Poland
             marketplaceId.startsWith('A17E79C6D8DWNP') || // Sweden
             marketplaceId.startsWith('A2VIGQ35RCS4UG') || // UAE
             marketplaceId.startsWith('A33AVAJ2PDY3EV') || // Turkey
             marketplaceId.startsWith('AMEN7PMS3EDWL') || // Belgium
             marketplaceId.startsWith('A2NODRKZP88ZB9') || // Saudi Arabia
             marketplaceId.startsWith('A1VC38T7YXB528') || // Japan
             marketplaceId.startsWith('AAHKV2X7AFYLW')) { // Singapore
      return 'eu';
    }
    // Far East marketplaces
    else if (marketplaceId.startsWith('A19VAU5U5O7RUS') || // Australia
             marketplaceId.startsWith('A39IBJ37TRP1C6')) { // Japan (alternative)
      return 'fe';
    }
    return 'na'; // Default to North America
  }

  // Get LWA Access Token (handled automatically by SDK)
  async getAccessToken(): Promise<{ access_token: string; expires_in: number }> {
    try {
      // The SDK handles token management automatically
      // We can access the current token if needed
      const token = this.client.access_token;
      if (!token) {
        // Force a token refresh
        await this.client.refreshAccessToken();
      }
      
      return {
        access_token: this.client.access_token || '',
        expires_in: 3600 // Default expiry time
      };
    } catch (error: any) {
      logger.error('Failed to get access token', { 
        error: { message: error.message, stack_trace: error.stack },
        operation: 'getAccessToken' 
      });
      throw new Error('Failed to authenticate with Amazon SP-API');
    }
  }

  // Get Orders using the SDK - Updated to use correct API structure
  async getOrders(createdAfter: string, nextToken?: string): Promise<GetOrdersResponse> {
    const startTime = Date.now();
    
    try {
      const query: Record<string, unknown> = {
        MarketplaceIds: [this.config.marketplaceId],
        CreatedAfter: createdAfter,
        OrderStatuses: ['Shipped', 'PartiallyShipped'], // Only get orders that are shipped/partially shipped
        MaxResultsPerPage: 50 // Limit results per page
      };

      if (nextToken) {
        query.NextToken = nextToken;
      }

      logger.info('Calling Amazon SP-API getOrders', {
        marketplaceId: this.config.marketplaceId,
        createdAfter,
        hasNextToken: !!nextToken
      });

      const response = await this.client.callAPI({
        operation: 'getOrders',
        endpoint: 'orders',
        query
      });
      
      const duration = Date.now() - startTime;
      const orderCount = (response as GetOrdersResponse).Orders?.length || 0;
      
      logger.info('Amazon API call: getOrders', {
        aws: {
          operation: 'getOrders',
          success: true
        },
        event: {
          duration
        },
        orderCount,
        hasNextToken: !!(response as GetOrdersResponse).NextToken,
        marketplaceId: this.config.marketplaceId
      });

      return response as GetOrdersResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Amazon API call: getOrders', {
        aws: {
          operation: 'getOrders',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        marketplaceId: this.config.marketplaceId
      });
      
      throw new Error(`Failed to fetch orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Order Items using the SDK
  async getOrderItems(orderId: string): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.callAPI({
        operation: 'getOrderItems',
        endpoint: 'orders',
        path: {
          orderId
        }
      });

      const duration = Date.now() - startTime;
      logger.info('Amazon API call: getOrderItems', {
        aws: {
          operation: 'getOrderItems',
          success: true
        },
        event: {
          duration
        },
        orderId
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: getOrderItems', {
        aws: {
          operation: 'getOrderItems',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        orderId
      });
      throw new Error(`Failed to fetch order items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Create Returns Report using the SDK
  async createReturnsReport(dataStartTime: string, dataEndTime: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.callAPI({
        operation: 'createReport',
        endpoint: 'reports',
        body: {
          marketplaceIds: [this.config.marketplaceId],
          reportType: 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE',
          dataStartTime,
          dataEndTime
        }
      });

      const duration = Date.now() - startTime;
      logger.info('Amazon API call: createReturnsReport', {
        aws: {
          operation: 'createReturnsReport',
          success: true
        },
        event: {
          duration
        },
        dataStartTime, 
        dataEndTime,
        marketplaceId: this.config.marketplaceId
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: createReturnsReport', {
        aws: {
          operation: 'createReturnsReport',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        dataStartTime, 
        dataEndTime,
        marketplaceId: this.config.marketplaceId
      });
      throw new Error(`Failed to create returns report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Report Status using the SDK
  async getReport(reportId: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.callAPI({
        operation: 'getReport',
        endpoint: 'reports',
        path: {
          reportId
        }
      });

      const duration = Date.now() - startTime;
      logger.info('Amazon API call: getReport', {
        aws: {
          operation: 'getReport',
          success: true
        },
        event: {
          duration
        },
        reportId
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: getReport', {
        aws: {
          operation: 'getReport',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        reportId
      });
      throw new Error(`Failed to get report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Report Document using the SDK
  async getReportDocument(reportDocumentId: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.callAPI({
        operation: 'getReportDocument',
        endpoint: 'reports',
        path: {
          reportDocumentId
        }
      });

      const duration = Date.now() - startTime;
      logger.info('Amazon API call: getReportDocument', {
        aws: {
          operation: 'getReportDocument',
          success: true
        },
        event: {
          duration
        },
        reportDocumentId
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: getReportDocument', {
        aws: {
          operation: 'getReportDocument',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        reportDocumentId
      });
      throw new Error(`Failed to get report document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Solicitation Actions for Order using the SDK - Updated to use correct API structure
  async getSolicitationActions(orderId: string): Promise<GetSolicitationActionsForOrderResponse> {
    const startTime = Date.now();
    
    try {
      logger.info(`Checking solicitation actions for order ${orderId}`);
      
      const response = await this.client.callAPI({
        operation: 'getSolicitationActionsForOrder',
        endpoint: 'solicitations',
        path: {
          amazonOrderId: orderId
        },
        query: {
          marketplaceIds: [this.config.marketplaceId]
        }
      });

      const duration = Date.now() - startTime;
      const actionCount = response.actions?.length || 0;
      
      logger.info('Amazon API call: getSolicitationActions', {
        aws: {
          operation: 'getSolicitationActions',
          success: true
        },
        event: {
          duration
        },
        orderId,
        actionCount,
        hasErrors: !!response.errors,
        marketplaceId: this.config.marketplaceId
      });

      return response as GetSolicitationActionsForOrderResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: getSolicitationActions', {
        aws: {
          operation: 'getSolicitationActions',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        orderId,
        marketplaceId: this.config.marketplaceId
      });
      throw new Error(`Failed to get solicitation actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Create Product Review and Seller Feedback Solicitation using the SDK - Updated with proper parameters
  async createReviewSolicitation(orderId: string): Promise<CreateProductReviewAndSellerFeedbackSolicitationResponse | { notEligible: true; reason: string }> {
    const startTime = Date.now();
    
    try {
      logger.info(`Creating review solicitation for order ${orderId}`);
      
      // First check if solicitation actions are available
      const solicitationActions = await this.getSolicitationActions(orderId);
      
      if (solicitationActions.errors && solicitationActions.errors.length > 0) {
        throw new Error(`Solicitation actions check failed: ${solicitationActions.errors[0].message}`);
      }

      // Check if ProductReview action is available
      const hasProductReviewAction = solicitationActions.actions?.some(
        action => action.name === 'ProductReview'
      );

      if (!hasProductReviewAction) {
        const duration = Date.now() - startTime;
        const reason = 'Product review solicitation is not available for this order';
        
        logger.info('Amazon API call: createReviewSolicitation - not eligible', {
          aws: {
            operation: 'createReviewSolicitation',
            success: false,
            reason: 'not_eligible'
          },
          event: {
            duration
          },
          orderId,
          marketplaceId: this.config.marketplaceId,
          reason,
          actionCount: solicitationActions.actions?.length || 0
        });
        
        return { notEligible: true, reason };
      }

      const response = await this.client.callAPI({
        operation: 'createProductReviewAndSellerFeedbackSolicitation',
        endpoint: 'solicitations',
        path: {
          amazonOrderId: orderId
        },
        query: {
          marketplaceIds: [this.config.marketplaceId]
        },
        body: {
          // The body can be empty for this operation as per Amazon SP-API documentation
        }
      });

      const duration = Date.now() - startTime;
      logger.info('Amazon API call: createReviewSolicitation', {
        aws: {
          operation: 'createReviewSolicitation',
          success: true
        },
        event: {
          duration
        },
        orderId,
        marketplaceId: this.config.marketplaceId
      });
      
      return response as CreateProductReviewAndSellerFeedbackSolicitationResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: createReviewSolicitation', {
        aws: {
          operation: 'createReviewSolicitation',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        orderId,
        marketplaceId: this.config.marketplaceId
      });
      throw new Error(`Failed to create review solicitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper method to get valid access token (handled by SDK)
  private async getValidAccessToken(): Promise<string | null> {
    try {
      // The SDK handles token management automatically
      if (!this.client.access_token) {
        await this.client.refreshAccessToken();
      }
      return this.client.access_token;
    } catch (error) {
      console.error('Failed to get valid access token:', error);
      return null;
    }
  }

  // Update config
  updateConfig(newConfig: Partial<AmazonAPIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize client if credentials changed
    if (newConfig.clientId || newConfig.clientSecret || newConfig.refreshToken) {
      this.client = new SellingPartner({
        region: this.getRegionFromMarketplaceId(this.config.marketplaceId),
        refresh_token: this.config.refreshToken,
        credentials: {
          SELLING_PARTNER_APP_CLIENT_ID: this.config.clientId,
          SELLING_PARTNER_APP_CLIENT_SECRET: this.config.clientSecret
        },
        options: {
          auto_request_tokens: true,
          auto_request_throttled: true,
          version_fallback: true,
          use_sandbox: this.config.isTest || false,
          debug_log: process.env.NODE_ENV === 'development'
        }
      });
    }
  }

  // Get the underlying client for advanced usage
  getClient(): SellingPartner {
    return this.client;
  }

    // Test API connection
  async testConnection(): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      // Try to get marketplace participations as a simple test
      await this.client.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });
      
      const duration = Date.now() - startTime;
      logger.info('Amazon API call: testConnection', {
        aws: {
          operation: 'testConnection',
          success: true
        },
        event: {
          duration
        },
        marketplaceId: this.config.marketplaceId
      });
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Amazon API call: testConnection', {
        aws: {
          operation: 'testConnection',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        marketplaceId: this.config.marketplaceId
      });
      return false;
    }
  }
}
