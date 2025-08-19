// Amazon SP API Response Types based on official documentation
// Reference: https://developer-docs.amazon.com/sp-api/reference/welcome-to-api-references

// ===== COMMON API RESPONSE STRUCTURES =====

export interface AmazonAPIError {
  code: string;
  message: string;
  details?: string;
}

export interface AmazonAPIErrorList {
  errors: AmazonAPIError[];
}

// ===== ORDERS API RESPONSES =====

export interface GetOrdersResponse {
  NextToken?: string;
  Orders?: AmazonOrder[];
};



// Legacy type aliases for backward compatibility
export type OrdersResponse = GetOrdersResponse;

export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string; // ISO 8601 date-time
  LastUpdateDate: string; // ISO 8601 date-time
  OrderStatus: OrderStatus;
  FulfillmentChannel?: FulfillmentChannel;
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  PaymentMethod?: string;
  PaymentMethodDetails?: string[];
  MarketplaceId: string;
  ShipmentServiceLevelCategory?: string;
  OrderType?: OrderType;
  EarliestShipDate?: string; // ISO 8601 date-time
  LatestShipDate?: string; // ISO 8601 date-time
  IsBusinessOrder?: boolean;
  IsPrime?: boolean;
  IsAccessPointOrder?: boolean;
  IsGlobalExpressEnabled?: boolean;
  IsPremiumOrder?: boolean;
  IsSoldByAB?: boolean;
  IsIBA?: boolean;
  ShippingAddress?: ShippingAddress;
  BuyerInfo?: BuyerInfo;
  OrderTotal?: Money;
  EarliestDeliveryDate?: string; // ISO 8601 date-time
  LatestDeliveryDate?: string; // ISO 8601 date-time
  SalesChannel?: string;
  ShipServiceLevel?: string;
  IsReplacementOrder?: boolean;
  DefaultShipFromLocationAddress?: Address;
  FulfillmentInstruction?: FulfillmentInstruction;
  IsISPU?: boolean;
  AutomatedShippingSettings?: AutomatedShippingSettings;
  EasyShipShipmentStatus?: string;
  ElectronicInvoiceStatus?: ElectronicInvoiceStatus;
  HasRegulatedItems?: boolean;
  BuyerTaxInformation?: BuyerTaxInformation;
}

export interface GetOrderItemsResponse {
  payload?: OrderItemsList;
  errors?: AmazonAPIError[];
}

export interface OrderItemsList {
  AmazonOrderId: string;
  NextToken?: string;
  OrderItems: OrderItem[];
}

export interface OrderItem {
  ASIN: string;
  SellerSKU?: string;
  OrderItemId: string;
  AssociatedItems?: AssociatedItem[];
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ProductInfo?: ProductInfoDetail;
  PointsGranted?: PointsGrantedDetail;
  ItemPrice?: Money;
  ShippingPrice?: Money;
  ItemTax?: Money;
  ShippingTax?: Money;
  ShippingDiscount?: Money;
  ShippingDiscountTax?: Money;
  PromotionDiscount?: Money;
  PromotionDiscountTax?: Money;
  PromotionIds?: PromotionIdList;
  CODFee?: Money;
  CODFeeDiscount?: Money;
  IsGift?: string; // "true" or "false"
}

// ===== REPORTS API RESPONSES =====

export interface CreateReportResponse {
  payload?: {
    reportId: string;
  };
  errors?: AmazonAPIError[];
}

export interface GetReportResponse {
  payload?: {
    reportId: string;
    reportType: string;
    dataStartTime?: string;
    dataEndTime?: string;
    reportProcessingStatus: 'CANCELLED' | 'DONE' | 'FATAL' | 'IN_PROGRESS' | 'IN_QUEUE';
    cancelledDate?: string;
    reportDocumentId?: string;
    reportScheduleId?: string;
    processingEndTime?: string;
    processingStartTime?: string;
  };
  errors?: AmazonAPIError[];
}

export interface GetReportDocumentResponse {
  payload?: {
    reportDocumentId: string;
    url: string;
    compressionAlgorithm?: string;
  };
  errors?: AmazonAPIError[];
}

// Legacy type aliases for backward compatibility
export type ReturnsResponse = GetReportDocumentResponse;

// ===== SOLICITATIONS API RESPONSES =====

export interface CreateProductReviewAndSellerFeedbackSolicitationResponse {
  errors?: AmazonAPIError[];
}

export interface GetSolicitationActionsForOrderResponse {
  _links?: {
    self: LinkObject;
    next?: LinkObject;
    actions: LinkObject[];
  };
  actions?: SolicitationsAction[];
  errors?: AmazonAPIError[];
}

// Legacy type aliases for backward compatibility
export type SolicitationResponse = GetSolicitationActionsForOrderResponse;

export interface SolicitationsAction {
  name: string;
}

export interface LinkObject {
  href: string;
  name?: string;
}

// ===== COMMON DATA STRUCTURES =====

export interface Money {
  CurrencyCode: string;
  Amount: string;
}

export interface Address {
  Name: string;
  AddressLine1: string;
  AddressLine2?: string;
  City: string;
  StateOrRegion: string;
  PostalCode: string;
  CountryCode: string;
  Phone?: string;
  AddressType?: string;
}

export interface ShippingAddress extends Address {}

export interface BuyerInfo {
  BuyerEmail?: string;
  BuyerName?: string;
  BuyerTaxInfo?: BuyerTaxInfo;
  PurchaseOrderNumber?: string;
}

export interface BuyerTaxInfo {
  CompanyLegalName?: string;
}

export interface BuyerTaxInformation {
  // Additional buyer tax information fields
}

export interface FulfillmentInstruction {
  FulfillmentSupplySourceId?: string;
}

export interface AutomatedShippingSettings {
  HasAutomatedShippingSettings?: boolean;
}

export interface ElectronicInvoiceStatus {
  // Electronic invoice status fields
}

export interface AssociatedItem {
  // Associated item fields
}

export interface ProductInfoDetail {
  // Product information detail fields
}

export interface PointsGrantedDetail {
  // Points granted detail fields
}

export interface PromotionIdList {
  // Promotion ID list fields
}

// ===== ENUMS =====

export enum OrderStatus {
  PENDING = 'Pending',
  UNSHIPPED = 'Unshipped',
  PARTIALLY_SHIPPED = 'PartiallyShipped',
  SHIPPED = 'Shipped',
  CANCELED = 'Canceled',
  UNFULFILLABLE = 'Unfulfillable',
  INVOICE_UNCONFIRMED = 'InvoiceUnconfirmed',
  PENDING_AVAILABILITY = 'PendingAvailability'
}

// Valid order statuses for API calls
export const VALID_ORDER_STATUSES = [
  'Unfulfillable',
  'PartiallyShipped', 
  'PendingAvailability',
  'Shipped',
  'Pending',
  'InvoiceUnconfirmed',
  'Canceled',
  'Unshipped'
] as const;

export type ValidOrderStatus = typeof VALID_ORDER_STATUSES[number];

export enum FulfillmentChannel {
  SELLER_FULFILLED = 'SellerFulfilled',
  AFN = 'AFN' // Amazon Fulfillment Network
}

export enum OrderType {
  STANDARD_ORDER = 'StandardOrder',
  LONG_LEAD_TIME_ORDER = 'LongLeadTimeOrder',
  PREORDER = 'Preorder',
  BACK_ORDER = 'BackOrder',
  SUBSCRIPTION_ORDER = 'SubscriptionOrder',
  LAUNCH = 'Launch',
  GIFT_CARD_ORDER = 'GiftCardOrder',
  REPLACEMENT_ORDER = 'ReplacementOrder'
}

export enum ReviewRequestStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED'
}

// ===== LEGACY TYPES (for backward compatibility) =====

// These types are kept for backward compatibility but should be migrated to use the new Amazon SP API types above

export interface LegacyAmazonOrder {
  id: string;
  amazonOrderId: string;
  purchaseDate: string;
  deliveryDate?: string | null;
  orderStatus: string;
  orderTotal: {
    currencyCode: string;
    amount: string;
  };
  marketplaceId: string;
  buyerInfo: {
    email: string;
    name: string;
  };
  items: LegacyOrderItem[];
  isReturned: boolean;
  returnDate?: string;
  reviewRequestSent: boolean;
  reviewRequestDate?: string;
  reviewRequestStatus?: string;
  reviewRequestError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyOrderItem {
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

export interface LegacyReviewRequest {
  id: string;
  orderId: string;
  amazonOrderId: string;
  status: string;
  sentAt?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ===== DASHBOARD AND ACTIVITY TYPES =====

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

// ===== AMAZON API CONFIGURATION =====

export interface AmazonAPIConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  region?: string;
  accessToken?: string;
  tokenExpiresAt?: string;
  isActive?: boolean;
  isTest?: boolean;
  lastUsed?: string;
  usageCount?: number;
}

// ===== ACTIVITY LOGGING =====

export interface ActivityLog {
  id: string;
  action: string;
  details: any;
  orderId?: string;
  createdAt: string;
}

// ===== USER MANAGEMENT =====

// Note: User management is not implemented in the current schema
// These interfaces are kept for future reference

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  VIEWER = 'VIEWER'
}

// ===== API REQUEST LOGGING =====

// Note: API request logging is not implemented in the current schema
// This interface is kept for future reference

export interface ApiRequest {
  id: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: any;
  responseBody?: any;
  errorMessage?: string;
  createdAt: string;
}
