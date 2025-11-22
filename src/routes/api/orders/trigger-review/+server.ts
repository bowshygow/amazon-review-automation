import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AmazonService } from '$lib/db/services/amazon';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const { orderId } = await request.json();

		if (!orderId) {
			return json(
				{
					success: false,
					error: 'Order ID is required'
				},
				{ status: 400 }
			);
		}

		logger.info('Triggering review request for order', {
			endpoint: '/api/orders/trigger-review',
			method: 'POST',
			orderId
		});

		const amazonService = new AmazonService();
		const result = await amazonService.triggerReviewRequest(orderId);

		const duration = Date.now() - startTime;

		logger.info('Review request triggered', {
			endpoint: '/api/orders/trigger-review',
			duration,
			orderId,
			success: result.success,
			status: result.status,
			error: result.error
		});

		return json({
			success: result.success,
			data: result,
			error: result.error,
			status: result.status,
			validationDetails: result.validationDetails
		});
	} catch (error: any) {
		const duration = Date.now() - startTime;

		logger.error('Review request trigger failed', {
			endpoint: '/api/orders/trigger-review',
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
