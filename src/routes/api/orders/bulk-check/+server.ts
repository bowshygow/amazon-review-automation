import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';
import { OrdersService } from '$lib/db/services/orders';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async () => {
	const startTime = Date.now();

	try {
		logger.info('Starting bulk check for all orders');

		const ordersService = new OrdersService();
		const amazonService = new AmazonService();

		// Get all orders that are shipped and not returned
		const result = await ordersService.getOrders(
			{
				status: ['Shipped', 'PartiallyShipped'],
				isReturned: false
			},
			{
				page: 1,
				limit: 1000 // Process up to 1000 orders
			}
		);

		const orders = result.data;

		let processed = 0;
		let withActions = 0;
		let noActions = 0;
		let sent = 0;
		let failed = 0;

		logger.info(`Found ${orders.length} orders to check and send`);

		// Process orders sequentially to avoid rate limiting and ensure proper order
		for (const order of orders) {
			try {
				processed++;

				// Step 1: Check for solicitation actions
				const checkResult = await amazonService.checkSolicitationActions(order.amazonOrderId);

				if (checkResult.hasActions) {
					withActions++;
					// Update order in database
					await ordersService.updateOrder(order.id, {
						hasSolicitationActions: true,
						solicitationActions: checkResult.actions || []
					});

					// Step 2: If has actions and not already sent, send review request
					if (!order.reviewRequestSent) {
						try {
							const api = await amazonService['initializeApi']();
							const sendResult = await api.createReviewSolicitation(order.amazonOrderId);

							// Check if successful
							if (!('errors' in sendResult) && !('notEligible' in sendResult)) {
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
									sent,
									total: orders.length
								});
							} else if ('notEligible' in sendResult && sendResult.notEligible) {
								await ordersService.updateOrder(order.id, {
									reviewRequestStatus: 'SKIPPED',
									hasSolicitationActions: false
								});
								logger.info('Order not eligible for review', {
									orderId: order.amazonOrderId,
									reason: sendResult.reason
								});
							}
						} catch (sendError) {
							logger.error('Failed to send review request', {
								orderId: order.amazonOrderId,
								error: sendError instanceof Error ? sendError.message : 'Unknown error'
							});
						}
					}
				} else {
					noActions++;
					await ordersService.updateOrder(order.id, {
						hasSolicitationActions: false,
						solicitationActions: []
					});
				}

				// Add small delay to avoid rate limiting (100ms between requests)
				await new Promise((resolve) => setTimeout(resolve, 100));
			} catch (error) {
				failed++;
				logger.error('Failed to check order', {
					orderId: order.amazonOrderId,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}

			// Log progress every 50 orders
			if (processed % 50 === 0) {
				logger.info(
					`Progress: ${processed}/${orders.length} orders (${withActions} with actions, ${sent} sent)`
				);
			}
		}

		const duration = Date.now() - startTime;

		logger.info('Bulk check and send completed', {
			duration,
			processed,
			withActions,
			noActions,
			sent,
			failed
		});

		return json({
			success: true,
			processed,
			withActions,
			noActions,
			sent,
			failed,
			duration
		});
	} catch (error: any) {
		const duration = Date.now() - startTime;

		logger.error('Bulk check failed', {
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
