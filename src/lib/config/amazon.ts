import { 
  AMAZON_CLIENT_ID, 
  AMAZON_CLIENT_SECRET, 
  AMAZON_REFRESH_TOKEN, 
  AMAZON_MARKETPLACE_ID 
} from '$env/static/private';

export interface AmazonConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
}

export function getAmazonConfig(): AmazonConfig {
  return {
    clientId: AMAZON_CLIENT_ID,
    clientSecret: AMAZON_CLIENT_SECRET,
    refreshToken: AMAZON_REFRESH_TOKEN,
    marketplaceId: AMAZON_MARKETPLACE_ID
  };
}

export function validateAmazonConfig(config: AmazonConfig): boolean {
  return !!(config.clientId && config.clientSecret && config.refreshToken && config.marketplaceId);
}
