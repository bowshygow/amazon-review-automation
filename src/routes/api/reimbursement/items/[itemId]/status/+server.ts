import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import * as schema from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logger';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { itemId } = params;

	try {
		const body = await request.json();
		const { status, notes } = body;

		// Validate status
		const validStatuses = ['PENDING', 'CLAIMABLE', 'CLAIMED', 'REIMBURSED', 'DENIED', 'EXPIRED'];
		if (!status || !validStatuses.includes(status)) {
			return json(
				{
					success: false,
					error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
				},
				{ status: 400 }
			);
		}

		// Update the item
		const updateData: any = {
			status,
			updatedAt: new Date().toISOString()
		};

		// If notes provided, update them
		if (notes !== undefined) {
			updateData.notes = notes;
		}

		// If status is CLAIMED, set claim submitted date
		if (status === 'CLAIMED' && !updateData.claimSubmittedDate) {
			updateData.claimSubmittedDate = new Date().toISOString();
		}

		// If status is REIMBURSED, set reimbursement date
		if (status === 'REIMBURSED' && !updateData.reimbursementDate) {
			updateData.reimbursementDate = new Date().toISOString();
		}

		const result = await db
			.update(schema.claimableItems)
			.set(updateData)
			.where(eq(schema.claimableItems.id, itemId))
			.returning();

		if (result.length === 0) {
			return json(
				{
					success: false,
					error: 'Item not found'
				},
				{ status: 404 }
			);
		}

		logger.info('Claimable item status updated', {
			itemId,
			status,
			previousStatus: result[0].status
		});

		return json({
			success: true,
			item: result[0]
		});
	} catch (error) {
		logger.error('Failed to update claimable item status', {
			itemId,
			error
		});

		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
