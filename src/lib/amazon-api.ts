import { SellingPartner } from 'amazon-sp-api';
import type { 
  AmazonAPIConfig, 
  GetOrdersResponse,
  CreateProductReviewAndSellerFeedbackSolicitationResponse,
  GetSolicitationActionsForOrderResponse
} from './types';

export class AmazonSPAPI {
  private client: SellingPartner;
  private config: AmazonAPIConfig;

  constructor(config: AmazonAPIConfig) {
    this.config = config;
    console.log('Initializing Amazon SP-API client with config:', {
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
    } catch (error) {
      console.error('Failed to get access token:', error);
      throw new Error('Failed to authenticate with Amazon SP-API');
    }
  }

  // Get Orders using the SDK - Updated to use correct API structure
  async getOrders(createdAfter: string, nextToken?: string): Promise<GetOrdersResponse> {
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

      console.log('Calling Amazon SP-API getOrders with params:', {
        marketplaceId: this.config.marketplaceId,
        createdAfter,
        hasNextToken: !!nextToken
      });

      const response = await this.client.callAPI({
        operation: 'getOrders',
        endpoint: 'orders',
        query
      });
      
      console.log('Amazon SP-API getOrders response:', {
        hasOrders: !!(response as GetOrdersResponse).Orders,
        orderCount: (response as GetOrdersResponse).Orders?.length || 0,
        hasNextToken: !!(response as GetOrdersResponse).NextToken
      });

      return response as GetOrdersResponse;
    } catch (error) {
      console.error('Failed to get orders from Amazon SP-API:', error);
      throw new Error(`Failed to fetch orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Order Items using the SDK
  async getOrderItems(orderId: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.callAPI({
        operation: 'getOrderItems',
        endpoint: 'orders',
        path: {
          orderId
        }
      });

      return response;
    } catch (error) {
      console.error(`Failed to get order items for order ${orderId}:`, error);
      throw new Error(`Failed to fetch order items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Create Returns Report using the SDK
  async createReturnsReport(dataStartTime: string, dataEndTime: string): Promise<any> {
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

      return response;
    } catch (error) {
      console.error('Failed to create returns report:', error);
      throw new Error(`Failed to create returns report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Report Status using the SDK
  async getReport(reportId: string): Promise<any> {
    try {
      const response = await this.client.callAPI({
        operation: 'getReport',
        endpoint: 'reports',
        path: {
          reportId
        }
      });

      return response;
    } catch (error) {
      console.error(`Failed to get report ${reportId}:`, error);
      throw new Error(`Failed to get report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Report Document using the SDK
  async getReportDocument(reportDocumentId: string): Promise<any> {
    try {
      const response = await this.client.callAPI({
        operation: 'getReportDocument',
        endpoint: 'reports',
        path: {
          reportDocumentId
        }
      });

      return response;
    } catch (error) {
      console.error(`Failed to get report document ${reportDocumentId}:`, error);
      throw new Error(`Failed to get report document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get Solicitation Actions for Order using the SDK - Updated to use correct API structure
  async getSolicitationActions(orderId: string): Promise<GetSolicitationActionsForOrderResponse> {
    try {
      console.log(`Checking solicitation actions for order ${orderId}`);
      
      const response = await this.client.callAPI({
        operation: 'getSolicitationActionsForOrder',
        endpoint: 'solicitations',
        path: {
          orderId
        },
        query: {
          marketplaceIds: [this.config.marketplaceId]
        }
      });

      console.log('Solicitation actions response:', {
        hasActions: !!response.actions,
        actionCount: response.actions?.length || 0,
        hasErrors: !!response.errors
      });

      return response as GetSolicitationActionsForOrderResponse;
    } catch (error) {
      console.error(`Failed to get solicitation actions for order ${orderId}:`, error);
      throw new Error(`Failed to get solicitation actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Create Product Review and Seller Feedback Solicitation using the SDK - Updated with proper parameters
  async createReviewSolicitation(orderId: string): Promise<CreateProductReviewAndSellerFeedbackSolicitationResponse> {
    try {
      console.log(`Creating review solicitation for order ${orderId}`);
      
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
        throw new Error('Product review solicitation is not available for this order');
      }

      const response = await this.client.callAPI({
        operation: 'createProductReviewAndSellerFeedbackSolicitation',
        endpoint: 'solicitations',
        path: {
          orderId
        },
        query: {
          marketplaceIds: [this.config.marketplaceId]
        },
        body: {
          // The body can be empty for this operation as per Amazon SP-API documentation
        }
      });

      console.log('Review solicitation created successfully for order:', orderId);
      
      return response as CreateProductReviewAndSellerFeedbackSolicitationResponse;
    } catch (error) {
      console.error(`Failed to create review solicitation for order ${orderId}:`, error);
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
    try {
      // Try to get marketplace participations as a simple test
      await this.client.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });
      
      console.log('API connection test successful');
      return true;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }
}
