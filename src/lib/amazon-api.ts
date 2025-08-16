import { SellingPartner } from 'amazon-sp-api';
import type { 
  AmazonAPIConfig, 
  AmazonAPIResponse, 
  OrdersResponse, 
  ReturnsResponse, 
  SolicitationResponse 
} from './types';

export class AmazonSPAPI {
  private client: SellingPartner;
  private config: AmazonAPIConfig;

  constructor(config: AmazonAPIConfig) {
    this.config = config;
    
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
        use_sandbox: false
      }
    });
  }

  // Helper method to determine region from marketplace ID
  private getRegionFromMarketplaceId(marketplaceId: string): 'na' | 'eu' | 'fe' {
    if (marketplaceId.startsWith('ATVPDKIKX0DER') || marketplaceId.startsWith('A2EUQ1WTGCTBG2')) {
      return 'na'; // North America
    } else if (marketplaceId.startsWith('A1PA6795UKMFR9') || marketplaceId.startsWith('A1RKKUPIHCS9HS')) {
      return 'eu'; // Europe
    } else if (marketplaceId.startsWith('AAHKV2X7AFYLW') || marketplaceId.startsWith('A1F83G8C2ARO7P')) {
      return 'fe'; // Far East
    }
    return 'na'; // Default to North America
  }

  // Get LWA Access Token (handled automatically by SDK)
  async getAccessToken(): Promise<AmazonAPIResponse<{ access_token: string; expires_in: number }>> {
    try {
      // The SDK handles token management automatically
      // We can access the current token if needed
      const token = this.client.access_token;
      if (!token) {
        // Force a token refresh
        await this.client.refreshAccessToken();
      }
      
      return {
        success: true,
        data: {
          access_token: this.client.access_token || '',
          expires_in: 3600 // Default expiry time
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get access token',
        statusCode: error.status || 500
      };
    }
  }

  // Get Orders using the SDK
  async getOrders(createdAfter: string, nextToken?: string): Promise<AmazonAPIResponse<OrdersResponse>> {
    try {
      const params: any = {
        operation: 'getOrders',
        endpoint: 'orders',
        query: {
          MarketplaceIds: [this.config.marketplaceId],
          CreatedAfter: createdAfter
        }
      };

      if (nextToken) {
        params.query.NextToken = nextToken;
      }

      const response = await this.client.callAPI(params);

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get orders',
        statusCode: error.status || 500
      };
    }
  }

  // Create Returns Report using the SDK
  async createReturnsReport(dataStartTime: string, dataEndTime: string): Promise<AmazonAPIResponse<{ reportId: string }>> {
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

      return {
        success: true,
        data: { reportId: response.reportId }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create returns report',
        statusCode: error.status || 500
      };
    }
  }

  // Get Report Status using the SDK
  async getReport(reportId: string): Promise<AmazonAPIResponse<any>> {
    try {
      const response = await this.client.callAPI({
        operation: 'getReport',
        endpoint: 'reports',
        path: {
          reportId
        }
      });

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get report',
        statusCode: error.status || 500
      };
    }
  }

  // Get Report Document using the SDK
  async getReportDocument(reportDocumentId: string): Promise<AmazonAPIResponse<ReturnsResponse>> {
    try {
      const response = await this.client.callAPI({
        operation: 'getReportDocument',
        endpoint: 'reports',
        path: {
          reportDocumentId
        }
      });

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get report document',
        statusCode: error.status || 500
      };
    }
  }

  // Get Solicitation Actions for Order using the SDK
  async getSolicitationActions(orderId: string): Promise<AmazonAPIResponse<SolicitationResponse>> {
    try {
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

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get solicitation actions',
        statusCode: error.status || 500
      };
    }
  }

  // Create Product Review and Seller Feedback Solicitation using the SDK
  async createReviewSolicitation(orderId: string): Promise<AmazonAPIResponse<any>> {
    try {
      const response = await this.client.callAPI({
        operation: 'createProductReviewAndSellerFeedbackSolicitation',
        endpoint: 'solicitations',
        path: {
          orderId
        },
        query: {
          marketplaceIds: [this.config.marketplaceId]
        },
        body: {} // Empty body as per API specification
      });

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create review solicitation',
        statusCode: error.status || 500
      };
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
          use_sandbox: false
        }
      });
    }
  }

  // Get the underlying client for advanced usage
  getClient(): SellingPartner {
    return this.client;
  }
}
