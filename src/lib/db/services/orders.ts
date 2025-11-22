import { db } from '../index';
import * as schema from '../schema';
import {
	eq,
	and,
	or,
	desc,
	asc,
	count,
	sql,
	inArray,
	like,
	isNull,
	isNotNull,
	lte,
	notInArray,
	ne
} from 'drizzle-orm';
import type {
	LegacyAmazonOrder,
	DashboardStats,
	OrderFilters,
	PaginationParams,
	ReviewRequestStatus
} from '$lib/types';
import { addDays, subDays } from 'date-fns';

interface CreateOrderData {
	amazonOrderId: string;
	purchaseDate: Date | string;
	deliveryDate?: Date | string | null;
	orderStatus: string;
	orderTotal: {
		currencyCode: string;
		amount: string;
	};
	marketplaceId: string;
	buyerInfo?: {
		email?: string;
		name?: string;
	};
	items?: any[];
	isReturned?: boolean;
	returnDate?: Date | string | null;
	reviewRequestSent?: boolean;
	reviewRequestDate?: Date | string | null;
	reviewRequestStatus?: string;
	reviewRequestError?: string | null;
}

interface UpdateOrderData {
	amazonOrderId?: string;
	purchaseDate?: Date | string;
	deliveryDate?: Date | string | null;
	orderStatus?: string;
	orderTotal?: {
		currencyCode: string;
		amount: string;
	};
	marketplaceId?: string;
	buyerInfo?: {
		email?: string;
		name?: string;
	};
	items?: any[];
	isReturned?: boolean;
	returnDate?: Date | string | null;
	reviewRequestSent?: boolean;
	reviewRequestDate?: Date | string | null;
	reviewRequestStatus?: string;
	reviewRequestError?: string | null;
	hasSolicitationActions?: boolean;
	solicitationActions?: string[];
}

interface CreateReviewRequestData {
	orderId: string;
	amazonOrderId: string;
	status?: string;
	sentAt?: Date | string | null;
	errorMessage?: string | null;
	retryCount?: number;
}

export class OrdersService {
	/**
	 * Get orders with filtering and pagination
	 */
	async getOrders(
		filters: OrderFilters = {},
		pagination: PaginationParams & { sortBy?: string; sortOrder?: 'asc' | 'desc' }
	): Promise<{ data: LegacyAmazonOrder[]; total: number }> {
		const { page = 1, limit = 20, sortBy, sortOrder = 'desc' } = pagination;
		const offset = (page - 1) * limit;

		// Build where conditions
		const conditions = [];

		if (filters.status && filters.status.length > 0) {
			conditions.push(inArray(schema.amazonOrders.orderStatus, filters.status));
		}

		if (filters.marketplaceId) {
			conditions.push(eq(schema.amazonOrders.marketplaceId, filters.marketplaceId));
		}

		if (filters.isReturned !== undefined) {
			conditions.push(eq(schema.amazonOrders.isReturned, filters.isReturned));
		}

		if (filters.reviewRequestStatus && filters.reviewRequestStatus.length > 0) {
			conditions.push(
				inArray(schema.amazonOrders.reviewRequestStatus, filters.reviewRequestStatus)
			);
		}

		if (filters.orderId) {
			conditions.push(
				or(
					eq(schema.amazonOrders.amazonOrderId, filters.orderId),
					like(schema.amazonOrders.amazonOrderId, `%${filters.orderId}%`)
				)!
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Determine sort column
		let orderByColumn;
		switch (sortBy) {
			case 'purchaseDate':
				orderByColumn = schema.amazonOrders.purchaseDate;
				break;
			case 'deliveryDate':
				orderByColumn = schema.amazonOrders.deliveryDate;
				break;
			case 'orderStatus':
				orderByColumn = schema.amazonOrders.orderStatus;
				break;
			case 'amazonOrderId':
				orderByColumn = schema.amazonOrders.amazonOrderId;
				break;
			default:
				orderByColumn = schema.amazonOrders.deliveryDate || schema.amazonOrders.purchaseDate;
		}

		const orderDirection = sortOrder === 'asc' ? asc : desc;

		// Get total count
		const [totalResult] = await db
			.select({ count: count() })
			.from(schema.amazonOrders)
			.where(whereClause);

		const total = totalResult?.count || 0;

		// Get paginated results
		const results = await db
			.select()
			.from(schema.amazonOrders)
			.where(whereClause)
			.orderBy(orderDirection(orderByColumn))
			.limit(limit)
			.offset(offset);

		// Convert to LegacyAmazonOrder format
		const data: LegacyAmazonOrder[] = results.map((order) => ({
			id: order.id,
			amazonOrderId: order.amazonOrderId,
			purchaseDate: order.purchaseDate || '',
			deliveryDate: order.deliveryDate || null,
			orderStatus: order.orderStatus,
			orderTotal: (order.orderTotal as any) || { currencyCode: 'USD', amount: '0' },
			marketplaceId: order.marketplaceId,
			buyerInfo: (order.buyerInfo as any) || {},
			items: (order.items as any) || [],
			isReturned: order.isReturned || false,
			returnDate: order.returnDate || null,
			reviewRequestSent: order.reviewRequestSent || false,
			reviewRequestDate: order.reviewRequestDate || null,
			reviewRequestStatus: order.reviewRequestStatus || null,
			reviewRequestError: order.reviewRequestError || null,
			createdAt: order.createdAt || '',
			updatedAt: order.updatedAt || ''
		}));

		return { data, total };
	}

	/**
	 * Get dashboard statistics
	 */
	async getDashboardStats(): Promise<DashboardStats> {
		const [
			totalOrdersResult,
			eligibleOrdersResult,
			reviewRequestsSentResult,
			reviewRequestsFailedResult,
			reviewRequestsSkippedResult,
			returnedOrdersResult,
			pendingReviewRequestsResult,
			ineligibleOrdersResult
		] = await Promise.all([
			// Total orders
			db.select({ count: count() }).from(schema.amazonOrders),

			// Eligible for review (shipped, not returned, review not sent, delivered 3+ days ago)
			db
				.select({ count: count() })
				.from(schema.amazonOrders)
				.where(
					and(
						or(
							eq(schema.amazonOrders.orderStatus, 'Shipped'),
							eq(schema.amazonOrders.orderStatus, 'PartiallyShipped')
						)!,
						eq(schema.amazonOrders.isReturned, false),
						eq(schema.amazonOrders.reviewRequestSent, false),
						isNotNull(schema.amazonOrders.deliveryDate),
						lte(schema.amazonOrders.deliveryDate, subDays(new Date(), 3).toISOString())
					)
				),

			// Review requests sent
			db
				.select({ count: count() })
				.from(schema.amazonOrders)
				.where(eq(schema.amazonOrders.reviewRequestSent, true)),

			// Review requests failed
			db
				.select({ count: count() })
				.from(schema.amazonOrders)
				.where(eq(schema.amazonOrders.reviewRequestStatus, 'failed')),

			// Review requests skipped
			db
				.select({ count: count() })
				.from(schema.amazonOrders)
				.where(eq(schema.amazonOrders.reviewRequestStatus, 'skipped')),

			// Returned orders
			db
				.select({ count: count() })
				.from(schema.amazonOrders)
				.where(eq(schema.amazonOrders.isReturned, true)),

			// Pending review requests
			db
				.select({ count: count() })
				.from(schema.reviewRequests)
				.where(eq(schema.reviewRequests.status, 'pending')),

			// Ineligible for review
			db
				.select({ count: count() })
				.from(schema.amazonOrders)
				.where(
					or(
						eq(schema.amazonOrders.isReturned, true),
						eq(schema.amazonOrders.reviewRequestSent, true),
						notInArray(schema.amazonOrders.orderStatus, ['Shipped', 'PartiallyShipped'])
					)!
				)
		]);

		return {
			totalOrders: totalOrdersResult[0]?.count || 0,
			eligibleForReview: eligibleOrdersResult[0]?.count || 0,
			reviewRequestsSent: reviewRequestsSentResult[0]?.count || 0,
			reviewRequestsFailed: reviewRequestsFailedResult[0]?.count || 0,
			reviewRequestsSkipped: reviewRequestsSkippedResult[0]?.count || 0,
			returnedOrders: returnedOrdersResult[0]?.count || 0,
			pendingReviewRequests: pendingReviewRequestsResult[0]?.count || 0,
			ineligibleForReview: ineligibleOrdersResult[0]?.count || 0
		};
	}

	/**
	 * Get order by Amazon order ID
	 */
	async getOrderByAmazonOrderId(amazonOrderId: string): Promise<LegacyAmazonOrder | null> {
		const [order] = await db
			.select()
			.from(schema.amazonOrders)
			.where(eq(schema.amazonOrders.amazonOrderId, amazonOrderId))
			.limit(1);

		if (!order) return null;

		return {
			id: order.id,
			amazonOrderId: order.amazonOrderId,
			purchaseDate: order.purchaseDate || '',
			deliveryDate: order.deliveryDate || null,
			orderStatus: order.orderStatus,
			orderTotal: (order.orderTotal as any) || { currencyCode: 'USD', amount: '0' },
			marketplaceId: order.marketplaceId,
			buyerInfo: (order.buyerInfo as any) || {},
			items: (order.items as any) || [],
			isReturned: order.isReturned || false,
			returnDate: order.returnDate || null,
			reviewRequestSent: order.reviewRequestSent || false,
			reviewRequestDate: order.reviewRequestDate || null,
			reviewRequestStatus: order.reviewRequestStatus || null,
			reviewRequestError: order.reviewRequestError || null,
			createdAt: order.createdAt || '',
			updatedAt: order.updatedAt || ''
		};
	}

	/**
	 * Get order by ID
	 */
	async getOrderById(id: string): Promise<LegacyAmazonOrder | null> {
		const [order] = await db
			.select()
			.from(schema.amazonOrders)
			.where(eq(schema.amazonOrders.id, id))
			.limit(1);

		if (!order) return null;

		return {
			id: order.id,
			amazonOrderId: order.amazonOrderId,
			purchaseDate: order.purchaseDate || '',
			deliveryDate: order.deliveryDate || null,
			orderStatus: order.orderStatus,
			orderTotal: (order.orderTotal as any) || { currencyCode: 'USD', amount: '0' },
			marketplaceId: order.marketplaceId,
			buyerInfo: (order.buyerInfo as any) || {},
			items: (order.items as any) || [],
			isReturned: order.isReturned || false,
			returnDate: order.returnDate || null,
			reviewRequestSent: order.reviewRequestSent || false,
			reviewRequestDate: order.reviewRequestDate || null,
			reviewRequestStatus: order.reviewRequestStatus || null,
			reviewRequestError: order.reviewRequestError || null,
			createdAt: order.createdAt || '',
			updatedAt: order.updatedAt || ''
		};
	}

	/**
	 * Create a new order
	 */
	async createOrder(data: CreateOrderData): Promise<LegacyAmazonOrder> {
		const [order] = await db
			.insert(schema.amazonOrders)
			.values({
				amazonOrderId: data.amazonOrderId,
				purchaseDate:
					typeof data.purchaseDate === 'string'
						? data.purchaseDate
						: data.purchaseDate.toISOString(),
				deliveryDate: data.deliveryDate
					? typeof data.deliveryDate === 'string'
						? data.deliveryDate
						: data.deliveryDate.toISOString()
					: null,
				orderStatus: data.orderStatus,
				orderTotal: data.orderTotal as any,
				marketplaceId: data.marketplaceId,
				buyerInfo: (data.buyerInfo || {}) as any,
				items: (data.items || []) as any,
				isReturned: data.isReturned || false,
				returnDate: data.returnDate
					? typeof data.returnDate === 'string'
						? data.returnDate
						: data.returnDate.toISOString()
					: null,
				reviewRequestSent: data.reviewRequestSent || false,
				reviewRequestDate: data.reviewRequestDate
					? typeof data.reviewRequestDate === 'string'
						? data.reviewRequestDate
						: data.reviewRequestDate.toISOString()
					: null,
				reviewRequestStatus: data.reviewRequestStatus || null,
				reviewRequestError: data.reviewRequestError || null
			})
			.returning();

		return {
			id: order.id,
			amazonOrderId: order.amazonOrderId,
			purchaseDate: order.purchaseDate || '',
			deliveryDate: order.deliveryDate || null,
			orderStatus: order.orderStatus,
			orderTotal: (order.orderTotal as any) || { currencyCode: 'USD', amount: '0' },
			marketplaceId: order.marketplaceId,
			buyerInfo: (order.buyerInfo as any) || {},
			items: (order.items as any) || [],
			isReturned: order.isReturned || false,
			returnDate: order.returnDate || null,
			reviewRequestSent: order.reviewRequestSent || false,
			reviewRequestDate: order.reviewRequestDate || null,
			reviewRequestStatus: order.reviewRequestStatus || null,
			reviewRequestError: order.reviewRequestError || null,
			createdAt: order.createdAt || '',
			updatedAt: order.updatedAt || ''
		};
	}

	/**
	 * Update an existing order
	 */
	async updateOrder(id: string, data: UpdateOrderData): Promise<LegacyAmazonOrder> {
		const updateData: any = {};

		if (data.amazonOrderId !== undefined) updateData.amazonOrderId = data.amazonOrderId;
		if (data.purchaseDate !== undefined) {
			updateData.purchaseDate =
				typeof data.purchaseDate === 'string' ? data.purchaseDate : data.purchaseDate.toISOString();
		}
		if (data.deliveryDate !== undefined) {
			updateData.deliveryDate =
				data.deliveryDate === null
					? null
					: typeof data.deliveryDate === 'string'
						? data.deliveryDate
						: data.deliveryDate.toISOString();
		}
		if (data.orderStatus !== undefined) updateData.orderStatus = data.orderStatus;
		if (data.orderTotal !== undefined) updateData.orderTotal = data.orderTotal as any;
		if (data.marketplaceId !== undefined) updateData.marketplaceId = data.marketplaceId;
		if (data.buyerInfo !== undefined) updateData.buyerInfo = data.buyerInfo as any;
		if (data.items !== undefined) updateData.items = data.items as any;
		if (data.isReturned !== undefined) updateData.isReturned = data.isReturned;
		if (data.returnDate !== undefined) {
			updateData.returnDate =
				data.returnDate === null
					? null
					: typeof data.returnDate === 'string'
						? data.returnDate
						: data.returnDate.toISOString();
		}
		if (data.reviewRequestSent !== undefined) updateData.reviewRequestSent = data.reviewRequestSent;
		if (data.reviewRequestDate !== undefined) {
			updateData.reviewRequestDate =
				data.reviewRequestDate === null
					? null
					: typeof data.reviewRequestDate === 'string'
						? data.reviewRequestDate
						: data.reviewRequestDate.toISOString();
		}
		if (data.reviewRequestStatus !== undefined)
			updateData.reviewRequestStatus = data.reviewRequestStatus;
		if (data.reviewRequestError !== undefined)
			updateData.reviewRequestError = data.reviewRequestError;

		updateData.updatedAt = new Date().toISOString();

		const [order] = await db
			.update(schema.amazonOrders)
			.set(updateData)
			.where(eq(schema.amazonOrders.id, id))
			.returning();

		return {
			id: order.id,
			amazonOrderId: order.amazonOrderId,
			purchaseDate: order.purchaseDate || '',
			deliveryDate: order.deliveryDate || null,
			orderStatus: order.orderStatus,
			orderTotal: (order.orderTotal as any) || { currencyCode: 'USD', amount: '0' },
			marketplaceId: order.marketplaceId,
			buyerInfo: (order.buyerInfo as any) || {},
			items: (order.items as any) || [],
			isReturned: order.isReturned || false,
			returnDate: order.returnDate || null,
			reviewRequestSent: order.reviewRequestSent || false,
			reviewRequestDate: order.reviewRequestDate || null,
			reviewRequestStatus: order.reviewRequestStatus || null,
			reviewRequestError: order.reviewRequestError || null,
			createdAt: order.createdAt || '',
			updatedAt: order.updatedAt || ''
		};
	}

	/**
	 * Get orders eligible for review
	 * Orders must be:
	 * - Status: Shipped or PartiallyShipped
	 * - Not returned
	 * - Review request not sent
	 * - Delivery date exists and is at least 3 days ago
	 */
	async getOrdersEligibleForReview(): Promise<LegacyAmazonOrder[]> {
		const threeDaysAgo = subDays(new Date(), 3).toISOString();

		const results = await db
			.select()
			.from(schema.amazonOrders)
			.where(
				and(
					or(
						eq(schema.amazonOrders.orderStatus, 'Shipped'),
						eq(schema.amazonOrders.orderStatus, 'PartiallyShipped')
					)!,
					eq(schema.amazonOrders.isReturned, false),
					eq(schema.amazonOrders.reviewRequestSent, false),
					isNotNull(schema.amazonOrders.deliveryDate),
					lte(schema.amazonOrders.deliveryDate, threeDaysAgo)
				)
			)
			.orderBy(asc(schema.amazonOrders.deliveryDate));

		return results.map((order) => ({
			id: order.id,
			amazonOrderId: order.amazonOrderId,
			purchaseDate: order.purchaseDate || '',
			deliveryDate: order.deliveryDate || null,
			orderStatus: order.orderStatus,
			orderTotal: (order.orderTotal as any) || { currencyCode: 'USD', amount: '0' },
			marketplaceId: order.marketplaceId,
			buyerInfo: (order.buyerInfo as any) || {},
			items: (order.items as any) || [],
			isReturned: order.isReturned || false,
			returnDate: order.returnDate || null,
			reviewRequestSent: order.reviewRequestSent || false,
			reviewRequestDate: order.reviewRequestDate || null,
			reviewRequestStatus: order.reviewRequestStatus || null,
			reviewRequestError: order.reviewRequestError || null,
			createdAt: order.createdAt || '',
			updatedAt: order.updatedAt || ''
		}));
	}

	/**
	 * Get review requests (with optional status filter)
	 */
	async getReviewRequests(status?: string): Promise<any[]> {
		const conditions = [];
		if (status) {
			conditions.push(eq(schema.reviewRequests.status, status));
		} else {
			// Default: get failed requests
			conditions.push(
				or(eq(schema.reviewRequests.status, 'failed'), eq(schema.reviewRequests.status, 'error'))!
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const results = await db
			.select()
			.from(schema.reviewRequests)
			.where(whereClause)
			.orderBy(desc(schema.reviewRequests.createdAt));

		return results.map((req) => ({
			id: req.id,
			orderId: req.orderId,
			amazonOrderId: req.amazonOrderId,
			status: req.status,
			sentAt: req.sentAt || null,
			errorMessage: req.errorMessage || null,
			retryCount: req.retryCount || 0,
			createdAt: req.createdAt || '',
			updatedAt: req.updatedAt || ''
		}));
	}

	/**
	 * Create a review request
	 */
	async createReviewRequest(data: CreateReviewRequestData): Promise<any> {
		const [request] = await db
			.insert(schema.reviewRequests)
			.values({
				orderId: data.orderId,
				amazonOrderId: data.amazonOrderId,
				status: data.status || 'pending',
				sentAt: data.sentAt
					? typeof data.sentAt === 'string'
						? data.sentAt
						: data.sentAt.toISOString()
					: null,
				errorMessage: data.errorMessage || null,
				retryCount: data.retryCount || 0
			})
			.returning();

		return {
			id: request.id,
			orderId: request.orderId,
			amazonOrderId: request.amazonOrderId,
			status: request.status,
			sentAt: request.sentAt || null,
			errorMessage: request.errorMessage || null,
			retryCount: request.retryCount || 0,
			createdAt: request.createdAt || '',
			updatedAt: request.updatedAt || ''
		};
	}

	/**
	 * Update a review request
	 */
	async updateReviewRequest(id: string, data: Partial<CreateReviewRequestData>): Promise<any> {
		const updateData: any = {};

		if (data.status !== undefined) updateData.status = data.status;
		if (data.sentAt !== undefined) {
			updateData.sentAt =
				data.sentAt === null
					? null
					: typeof data.sentAt === 'string'
						? data.sentAt
						: data.sentAt.toISOString();
		}
		if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
		if (data.retryCount !== undefined) updateData.retryCount = data.retryCount;

		updateData.updatedAt = new Date().toISOString();

		const [request] = await db
			.update(schema.reviewRequests)
			.set(updateData)
			.where(eq(schema.reviewRequests.id, id))
			.returning();

		return {
			id: request.id,
			orderId: request.orderId,
			amazonOrderId: request.amazonOrderId,
			status: request.status,
			sentAt: request.sentAt || null,
			errorMessage: request.errorMessage || null,
			retryCount: request.retryCount || 0,
			createdAt: request.createdAt || '',
			updatedAt: request.updatedAt || ''
		};
	}

	/**
	 * Update order and create review request in one transaction
	 */
	async updateOrderAndCreateReviewRequest(
		orderId: string,
		orderUpdateData: UpdateOrderData,
		reviewRequestData: CreateReviewRequestData
	): Promise<{ order: LegacyAmazonOrder; reviewRequest: any }> {
		// Update order
		const order = await this.updateOrder(orderId, orderUpdateData);

		// Create review request
		const reviewRequest = await this.createReviewRequest({
			...reviewRequestData,
			orderId: orderId
		});

		return { order, reviewRequest };
	}

	/**
	 * Log activity
	 */
	async logActivity(action: string, details: Record<string, any>): Promise<void> {
		await db.insert(schema.activityLogs).values({
			action,
			details: details as any,
			createdAt: new Date().toISOString()
		});
	}
}
