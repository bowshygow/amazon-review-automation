// Amazon Review Automation Types

export interface AmazonOrder {
  id: string;
  amazonOrderId: string;
  purchaseDate: string;
  deliveryDate: string;
  orderStatus: 'Shipped' | 'Delivered' | 'Returned' | 'Cancelled';
  orderTotal: {
    currencyCode: string;
    amount: string;
  };
  marketplaceId: string;
  buyerInfo: {
    email?: string;
    name?: string;
  };
  items: OrderItem[];
  isReturned: boolean;
  returnDate?: string;
  reviewRequestSent?: boolean;
  reviewRequestDate?: string;
  reviewRequestStatus?: 'pending' | 'sent' | 'failed' | 'skipped';
  reviewRequestError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  asin: string;
  sku: string;
  title: string;
  quantity: number;
  price: {
    currencyCode: string;
    amount: string;
  };
}

export interface ReviewRequest {
  id: string;
  orderId: string;
  amazonOrderId: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentAt?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalOrders: number;
  eligibleForReview: number;
  reviewRequestsSent: number;
  reviewRequestsFailed: number;
  reviewRequestsSkipped: number;
  returnedOrders: number;
  todayRequests: number;
  thisWeekRequests: number;
  thisMonthRequests: number;
}

export interface AmazonAPIConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  accessToken?: string;
  tokenExpiresAt?: string;
}

export interface AmazonAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

// Raw Amazon API response types
export interface RawAmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  EarliestShipDate?: string;
  OrderStatus: string;
  OrderTotal: {
    CurrencyCode: string;
    Amount: string;
  };
  MarketplaceId: string;
  BuyerInfo?: {
    Email?: string;
    Name?: string;
  };
}

// API Response types based on Amazon SP API
export interface OrdersResponse {
  Orders: RawAmazonOrder[];
  NextToken?: string;
  CreatedBefore?: string;
}

export interface ReturnsResponse {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: string;
}

export interface SolicitationResponse {
  _links: {
    actions: any[];
    self: {
      href: string;
    };
  };
  _embedded: {
    actions: any[];
  };
}

// Filter and search types
export interface OrderFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string[];
  marketplaceId?: string;
  isReturned?: boolean;
  reviewRequestStatus?: string[];
  search?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
