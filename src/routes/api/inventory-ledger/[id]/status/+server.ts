import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InventoryLedgerService } from '$lib/db/services/inventory-ledger';
import { logger } from '$lib/logger';

export const PUT: RequestHandler = async ({ params, request }) => {
  const startTime = Date.now();
  
  try {
    const { status, notes } = await request.json();
    
    if (!status) {
      return json({
        success: false,
        error: 'Status is required'
      }, { status: 400 });
    }

    // Validate status
    const validStatuses = ['WAITING', 'CLAIMABLE', 'CLAIM_INITIATED', 'CLAIMED', 'PAID', 'INVALID', 'RESOLVED'];
    if (!validStatuses.includes(status)) {
      return json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      }, { status: 400 });
    }

    const service = new InventoryLedgerService();
    
    // Check if event exists
    const event = await service.db.inventoryLedgerEvent.findUnique({
      where: { id: params.id }
    });

    if (!event) {
      return json({
        success: false,
        error: 'Event not found'
      }, { status: 404 });
    }

    // Update event status
    const updatedEvent = await service.updateEventStatus(params.id, status, notes);

    const duration = Date.now() - startTime;
    logger.info('API call: updateEventStatus', {
      aws: {
        operation: 'updateEventStatus',
        success: true
      },
      event: {
        duration
      },
      eventId: params.id,
      fnsku: updatedEvent.fnsku,
      asin: updatedEvent.asin,
      oldStatus: event.status,
      newStatus: status,
      notes
    });

    await service.disconnect();

    return json({
      success: true,
      data: {
        event: updatedEvent,
        statusChange: {
          from: event.status,
          to: status,
          notes
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('API call: updateEventStatus', {
      aws: {
        operation: 'updateEventStatus',
        success: false
      },
      event: {
        duration
      },
      error: { message: error instanceof Error ? error.message : 'Unknown error' },
      eventId: params.id
    });

    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
