import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';
import { OrdersService } from '$lib/db/services/orders';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async () => {
	const startTime = Date.now();

	try {
		logger.info('Starting bulk send for all eligible orders (ignoring date restrictions)');

		const ordersService = new OrdersService();
		const amazonService = new AmazonService();

		// Get all orders that:
		// 1. Are shipped
		// 2. Haven't had review request sent yet
		// 3. Are not returned
		const result = await ordersService.getOrders(
			{
				status: ['Shipped', 'PartiallyShipped'],
				isReturned: false,
				reviewRequestStatus: ['NOT_SENT', 'PENDING'] // Only orders that haven't been sent
			},
			{
				page: 1,
				limit: 1000 // Process up to 1000 orders
			}
		);

		// Filter to only orders with solicitation actions
		const orders = result.data.filter((order) => {
			// Check if order has been checked for solicitation actions
			// and has actions available
			return order.hasSolicitationActions === true;
		});

		let processed = 0;
		let sent = 0;
		let skipped = 0;
		let failed = 0;

		logger.info(`Found ${orders.length} orders to send review requests`);

		// Process orders sequentially to avoid rate limiting
		for (const order of orders) {
			try {
				processed++;

				// Check if order has solicitation actions (double-check)
				if (!order.hasSolicitationActions) {
					skipped++;
					continue;
				}

				// Send review request (this will bypass date check by using the API directly)
				const api = await amazonService['initializeApi']();
				const result = await api.createReviewSolicitation(order.amazonOrderId);

				// Check if successful
				if (!('errors' in result) && !('notEligible' in result)) {
					sent++;
					// Update order in database
					await ordersService.updateOrder(order.id, {
						reviewRequestSent: true,
						reviewRequestDate: new Date().toISOString(),
						reviewRequestStatus: 'SENT'
					});

					// Create review request record
					await ordersService.createReviewRequest({
						orderId: order.id,
						amazonOrderId: order.amazonOrderId,
						status: 'SENT',
						sentAt: new Date().toISOString()
					});

					logger.info('Review request sent', {
						orderId: order.amazonOrderId,
						processed,
						total: orders.length
					});
				} else if ('notEligible' in result && result.notEligible) {
					skipped++;
					await ordersService.updateOrder(order.id, {
						reviewRequestStatus: 'SKIPPED',
						hasSolicitationActions: false
					});
					logger.info('Order not eligible', {
						orderId: order.amazonOrderId,
						reason: result.reason
					});
				} else {
					failed++;
					const errorMsg =
						'errors' in result && result.errors?.[0]?.message
							? result.errors[0].message
							: 'Unknown error';
					await ordersService.updateOrder(order.id, {
						reviewRequestStatus: 'FAILED'
					});
					logger.error('Review request failed', {
						orderId: order.amazonOrderId,
						error: errorMsg
					});
				}

				// Add small delay to avoid rate limiting (50ms between requests)
				await new Promise((resolve) => setTimeout(resolve, 50));

				// Log progress every 10 orders
				if (processed % 10 === 0) {
					logger.info(
						`Progress: ${processed}/${orders.length} orders processed (${sent} sent, ${skipped} skipped, ${failed} failed)`
					);
				}
			} catch (error) {
				failed++;
				logger.error('Failed to process order', {
					orderId: order.amazonOrderId,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		const duration = Date.now() - startTime;

		logger.info('Bulk send completed', {
			duration,
			processed,
			sent,
			skipped,
			failed
		});

		return json({
			success: true,
			processed,
			sent,
			skipped,
			failed,
			duration
		});
	} catch (error: any) {
		const duration = Date.now() - startTime;

		logger.error('Bulk send failed', {
			duration,
			error: error instanceof Error ? error.message : 'Unknown error'
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
