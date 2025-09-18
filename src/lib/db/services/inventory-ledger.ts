import { PrismaClient } from '@prisma/client';
import { AmazonSPAPI } from '$lib/amazon-api';
import { getAmazonConfig, validateAmazonConfig } from '$lib/config/amazon';
import { logger } from '$lib/logger';
import { databaseManager } from '$lib/db/config/prisma';
import { InventoryLedgerDebugUtils } from '$lib/debug/inventory-ledger-debug';
import type { 
  InventoryLedgerEventData, 
  InventoryLedgerEvent, 
  InventoryLedgerStats,
  InventoryLedgerFilters
} from '$lib/types';
import { InventoryLedgerStatus } from '@prisma/client';

export class InventoryLedgerService {
  private db: PrismaClient | null = null;
  private api: AmazonSPAPI | null = null;

  constructor() {
    // Don't create PrismaClient here, get it from database manager
  }

  /**
   * Get database client from shared manager
   */
  private async getDb(): Promise<PrismaClient> {
    if (!this.db) {
      this.db = await databaseManager.getClient();
    }
    return this.db;
  }

  /**
   * Initialize Amazon API with configuration from environment variables
   */
  private async initializeApi(): Promise<AmazonSPAPI> {
    if (this.api) {
      return this.api;
    }

    const config = getAmazonConfig();
    
    if (!validateAmazonConfig(config)) {
      throw new Error('Amazon API configuration not found. Please configure your Amazon API credentials in environment variables.');
    }

    this.api = new AmazonSPAPI({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
      marketplaceId: config.marketplaceId
    });

    return this.api;
  }

  // ===== INVENTORY LEDGER REPORT PROCESSING =====

  /**
   * Fetch and process inventory ledger report for a date range
   */
  async fetchAndProcessInventoryLedgerReport(dataStartTime: string, dataEndTime: string): Promise<{
    reportId: string;
    processedCount: number;
    newEventsCount: number;
    updatedEventsCount: number;
  }> {
    const startTime = Date.now();
    const apiResponses: Record<string, {
      request: Record<string, unknown>;
      response: Record<string, unknown>;
      duration: number;
      timestamp: string;
    }> = {};
    const errors: Array<{
      message: string;
      stack?: string;
      timestamp: string;
    }> = [];
    
    try {
      logger.info('Starting inventory ledger report fetch and process', {
        aws: {
          operation: 'fetchAndProcessInventoryLedgerReport',
          success: true
        },
        event: {
          startTime: new Date(startTime).toISOString()
        },
        dataStartTime,
        dataEndTime
      });

      const api = await this.initializeApi();

      // Step 1: Create the report
      logger.info('Step 1: Creating inventory ledger report', {
        dataStartTime,
        dataEndTime
      });
      
      const createStartTime = Date.now();
      const createResponse = await api.createInventoryLedgerReport(dataStartTime, dataEndTime);
      const createDuration = Date.now() - createStartTime;
      
      apiResponses.createReportResponse = {
        request: { dataStartTime, dataEndTime },
        response: createResponse as Record<string, unknown>,
        duration: createDuration,
        timestamp: new Date().toISOString()
      };
      
      // Save API response for debugging
      try {
        await InventoryLedgerDebugUtils.saveApiResponse({
          timestamp: new Date().toISOString(),
          operation: 'createInventoryLedgerReport',
          request: { dataStartTime, dataEndTime },
          response: createResponse,
          duration: createDuration,
          success: true
        });
      } catch (debugError) {
        logger.warn('Failed to save API response for debugging', {
          error: { message: debugError instanceof Error ? debugError.message : 'Unknown error' }
        });
      }
      
      const reportId = (createResponse as Record<string, unknown>).reportId as string;

      if (!reportId) {
        const errorMsg = 'No report ID returned from Amazon API';
        logger.error(errorMsg, { createResponse });
        throw new Error(errorMsg);
      }

      logger.info('Inventory ledger report created successfully', {
        aws: {
          operation: 'createInventoryLedgerReport',
          success: true
        },
        event: {
          duration: createDuration
        },
        reportId,
        createResponse
      });

      // Step 2: Wait for report to be ready
      logger.info('Step 2: Waiting for report to be ready', { reportId });
      
      const waitStartTime = Date.now();
      const report = await api.waitForReportReady(reportId);
      const waitDuration = Date.now() - waitStartTime;
      
      apiResponses.reportStatusResponse = {
        request: { reportId },
        response: report,
        duration: waitDuration,
        timestamp: new Date().toISOString()
      };
      
      // Save API response for debugging
      try {
        await InventoryLedgerDebugUtils.saveApiResponse({
          timestamp: new Date().toISOString(),
          operation: 'waitForReportReady',
          request: { reportId },
          response: report,
          duration: waitDuration,
          success: true
        });
      } catch (debugError) {
        logger.warn('Failed to save API response for debugging', {
          error: { message: debugError instanceof Error ? debugError.message : 'Unknown error' }
        });
      }
      
      if (!report.reportDocumentId) {
        const errorMsg = 'No report document ID found in completed report';
        logger.error(errorMsg, { report });
        throw new Error(errorMsg);
      }

      logger.info('Report is ready for download', {
        aws: {
          operation: 'waitForReportReady',
          success: true
        },
        event: {
          duration: waitDuration
        },
        reportId,
        reportDocumentId: report.reportDocumentId,
        reportStatus: report.processingStatus
      });

      // Step 3: Download and parse report data
      logger.info('Step 3: Downloading and parsing report data', {
        reportId,
        reportDocumentId: report.reportDocumentId
      });
      
      const downloadStartTime = Date.now();
      const reportData = await api.downloadInventoryLedgerReport(report.reportDocumentId);
      const downloadDuration = Date.now() - downloadStartTime;
      
      apiResponses.reportDataResponse = {
        request: { reportDocumentId: report.reportDocumentId },
        response: { rowCount: reportData.length, sampleData: reportData.slice(0, 5) },
        duration: downloadDuration,
        timestamp: new Date().toISOString()
      };
      
      // Save API response for debugging
      try {
        await InventoryLedgerDebugUtils.saveApiResponse({
          timestamp: new Date().toISOString(),
          operation: 'downloadInventoryLedgerReport',
          request: { reportDocumentId: report.reportDocumentId },
          response: { rowCount: reportData.length, sampleData: reportData.slice(0, 5) },
          duration: downloadDuration,
          success: true
        });
      } catch (debugError) {
        logger.warn('Failed to save API response for debugging', {
          error: { message: debugError instanceof Error ? debugError.message : 'Unknown error' }
        });
      }
      
      logger.info('Inventory ledger report data downloaded successfully', {
        aws: {
          operation: 'downloadInventoryLedgerReport',
          success: true
        },
        event: {
          duration: downloadDuration
        },
        reportId,
        reportDocumentId: report.reportDocumentId,
        rowCount: reportData.length,
        dataSample: reportData.slice(0, 3) // Log first 3 rows for debugging
      });

      // Step 4: Process and store the data
      logger.info('Step 4: Processing and storing report data', {
        totalRows: reportData.length
      });
      
      const processStartTime = Date.now();
      const result = await this.processInventoryLedgerData(reportData);
      const processDuration = Date.now() - processStartTime;

      logger.info('Report data processed successfully', {
        aws: {
          operation: 'processInventoryLedgerData',
          success: true
        },
        event: {
          duration: processDuration
        },
        processedCount: result.processedCount,
        newEventsCount: result.newEventsCount,
        updatedEventsCount: result.updatedEventsCount
      });

      // Get current stats and claimable events for debugging
      let stats: InventoryLedgerStats = {
        totalClaimableUnits: 0,
        totalEstimatedValue: 0,
        totalWaiting: 0,
        totalResolved: 0,
        totalClaimed: 0,
        totalPaid: 0,
        claimableEventsCount: 0,
        waitingEventsCount: 0
      };
      let claimableEvents: InventoryLedgerEvent[] = [];
      try {
        stats = await this.getInventoryLedgerStats();
        claimableEvents = await this.getClaimableEvents(100, 0, 'eventDate', 'desc');
      } catch (statsError) {
        logger.warn('Failed to get stats for debugging', {
          error: { message: statsError instanceof Error ? statsError.message : 'Unknown error' }
        });
      }

      const duration = Date.now() - startTime;
      
      // Save complete debug report
      try {
        await InventoryLedgerDebugUtils.saveSyncReport({
          timestamp: new Date().toISOString(),
          reportId,
          dataStartTime,
          dataEndTime,
          syncResult: result,
          stats,
          claimableEvents,
          apiResponses,
          errors: errors.length > 0 ? errors : undefined,
          duration
        });
      } catch (debugError) {
        logger.warn('Failed to save complete debug report', {
          error: { message: debugError instanceof Error ? debugError.message : 'Unknown error' }
        });
      }
      
      logger.info('Inventory ledger report fetch and process completed successfully', {
        aws: {
          operation: 'fetchAndProcessInventoryLedgerReport',
          success: true
        },
        event: {
          duration,
          endTime: new Date().toISOString()
        },
        reportId,
        processedCount: result.processedCount,
        newEventsCount: result.newEventsCount,
        updatedEventsCount: result.updatedEventsCount,
        totalClaimableUnits: stats.totalClaimableUnits || 0,
        claimableEventsCount: stats.claimableEventsCount || 0,
        apiResponses: Object.keys(apiResponses).length
      });

      return {
        reportId,
        processedCount: result.processedCount,
        newEventsCount: result.newEventsCount,
        updatedEventsCount: result.updatedEventsCount
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorData = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };
      errors.push(errorData);
      
      // Save error debug report
      try {
        await InventoryLedgerDebugUtils.saveSyncReport({
          timestamp: new Date().toISOString(),
          dataStartTime,
          dataEndTime,
          stats: {
            totalClaimableUnits: 0,
            totalEstimatedValue: 0,
            totalWaiting: 0,
            totalResolved: 0,
            totalClaimed: 0,
            totalPaid: 0,
            claimableEventsCount: 0,
            waitingEventsCount: 0
          },
          claimableEvents: [],
          apiResponses,
          errors,
          duration
        });
      } catch (debugError) {
        logger.warn('Failed to save error debug report', {
          error: { message: debugError instanceof Error ? debugError.message : 'Unknown error' }
        });
      }
      
      logger.error('Failed to fetch and process inventory ledger report', {
        aws: {
          operation: 'fetchAndProcessInventoryLedgerReport',
          success: false
        },
        event: {
          duration,
          endTime: new Date().toISOString()
        },
        error: errorData,
        dataStartTime,
        dataEndTime,
        apiResponses: Object.keys(apiResponses).length
      });
      throw error;
    }
  }

  /**
   * Process inventory ledger data and apply business logic
   */
  private async processInventoryLedgerData(data: InventoryLedgerEventData[]): Promise<{
    processedCount: number;
    newEventsCount: number;
    updatedEventsCount: number;
  }> {
    let processedCount = 0;
    let newEventsCount = 0;
    let updatedEventsCount = 0;

    // Filter eligible event types (Phase 1 business logic)
    const eligibleEventTypes = ['Shipments', 'WhseTransfers', 'Adjustments', 'Receipts'];
    const eligibleData = data.filter(event => {
      // Must be an eligible event type
      if (!eligibleEventTypes.includes(event.eventType)) {
        return false;
      }
      
      // For different event types, apply different criteria:
      if (event.eventType === 'Adjustments') {
        // Adjustments: Must have negative quantity (inventory loss)
        return event.quantity < 0;
      } else if (event.eventType === 'WhseTransfers') {
        // Warehouse transfers: Include all (positive = inbound, negative = outbound)
        // This helps track inventory movements and potential issues
        return true;
      } else if (event.eventType === 'Shipments') {
        // Shipments: Must have negative quantity (inventory left warehouse)
        return event.quantity < 0;
      } else if (event.eventType === 'Receipts') {
        // Receipts: Must have positive quantity (inventory received)
        return event.quantity > 0;
      }
      
      // Default: include all other eligible event types
      return true;
    });

    // Log detailed filtering information
    const filteringStats = {
      totalEvents: data.length,
      eligibleEvents: eligibleData.length,
      filteredOut: data.length - eligibleData.length,
      eventTypeBreakdown: {} as Record<string, number>,
      quantityBreakdown: {
        positive: 0,
        negative: 0,
        zero: 0
      },
      reconciliationBreakdown: {
        unreconciled: 0,
        reconciled: 0,
        empty: 0
      }
    };

    // Analyze why events were filtered
    data.forEach(event => {
      // Event type breakdown
      filteringStats.eventTypeBreakdown[event.eventType] = (filteringStats.eventTypeBreakdown[event.eventType] || 0) + 1;
      
      // Quantity breakdown
      if (event.quantity > 0) filteringStats.quantityBreakdown.positive++;
      else if (event.quantity < 0) filteringStats.quantityBreakdown.negative++;
      else filteringStats.quantityBreakdown.zero++;
      
      // Reconciliation breakdown
      if (event.unreconciledQuantity > 0) filteringStats.reconciliationBreakdown.unreconciled++;
      else if (event.unreconciledQuantity === 0) filteringStats.reconciliationBreakdown.reconciled++;
      else filteringStats.reconciliationBreakdown.empty++;
    });

    logger.info('Filtered eligible inventory ledger events', {
      ...filteringStats,
      eligibleEventTypes,
      eventTypeBreakdown: filteringStats.eventTypeBreakdown,
      quantityBreakdown: filteringStats.quantityBreakdown,
      reconciliationBreakdown: filteringStats.reconciliationBreakdown,
      sampleEligibleEvents: eligibleData.slice(0, 5).map(event => ({
        fnsku: event.fnsku,
        eventType: event.eventType,
        quantity: event.quantity,
        unreconciledQuantity: event.unreconciledQuantity,
        status: this.calculateEventStatus(event)
      }))
    });

    for (const eventData of eligibleData) {
      try {
        // Check if event already exists (by unique combination of fields)
        const db = await this.getDb();
        const existingEvent = await db.inventoryLedgerEvent.findFirst({
          where: {
            fnsku: eventData.fnsku,
            asin: eventData.asin,
            eventDate: eventData.eventDate,
            eventType: eventData.eventType,
            referenceId: eventData.referenceId,
            fulfillmentCenter: eventData.fulfillmentCenter
          }
        });

        if (existingEvent) {
          // Update existing event if data has changed
          const hasChanges = this.hasEventDataChanged(existingEvent, eventData);
          
          if (hasChanges) {
            await this.updateInventoryLedgerEvent(existingEvent.id, eventData);
            updatedEventsCount++;
          }
        } else {
          // Create new event
          await this.createInventoryLedgerEvent(eventData);
          newEventsCount++;
        }

        processedCount++;
      } catch (error) {
        logger.error('Failed to process inventory ledger event', {
          error: { message: error instanceof Error ? error.message : 'Unknown error' },
          eventData: {
            fnsku: eventData.fnsku,
            asin: eventData.asin,
            eventType: eventData.eventType,
            eventDate: eventData.eventDate
          }
        });
      }
    }

    return { processedCount, newEventsCount, updatedEventsCount };
  }

  /**
   * Create a new inventory ledger event
   */
  private async createInventoryLedgerEvent(data: InventoryLedgerEventData): Promise<InventoryLedgerEvent> {
    const status = this.calculateEventStatus(data);
    const db = await this.getDb();
    
    const event = await db.inventoryLedgerEvent.create({
      data: {
        eventDate: data.eventDate,
        fnsku: data.fnsku,
        asin: data.asin,
        sku: data.sku,
        productTitle: data.productTitle,
        eventType: data.eventType,
        referenceId: data.referenceId,
        quantity: data.quantity,
        fulfillmentCenter: data.fulfillmentCenter,
        disposition: data.disposition,
        reconciledQuantity: data.reconciledQuantity,
        unreconciledQuantity: data.unreconciledQuantity,
        country: data.country,
        rawTimestamp: data.rawTimestamp,
        storeId: data.storeId,
        status
      }
    });

    logger.info('Created inventory ledger event', {
      eventId: event.id,
      fnsku: event.fnsku,
      asin: event.asin,
      eventType: event.eventType,
      status: event.status,
      quantity: event.quantity,
      unreconciledQuantity: event.unreconciledQuantity
    });

    return event;
  }

  /**
   * Update an existing inventory ledger event
   */
  private async updateInventoryLedgerEvent(eventId: string, data: InventoryLedgerEventData): Promise<InventoryLedgerEvent> {
    const status = this.calculateEventStatus(data);
    const db = await this.getDb();
    
    const event = await db.inventoryLedgerEvent.update({
      where: { id: eventId },
      data: {
        eventDate: data.eventDate,
        fnsku: data.fnsku,
        asin: data.asin,
        sku: data.sku,
        productTitle: data.productTitle,
        eventType: data.eventType,
        referenceId: data.referenceId,
        quantity: data.quantity,
        fulfillmentCenter: data.fulfillmentCenter,
        disposition: data.disposition,
        reconciledQuantity: data.reconciledQuantity,
        unreconciledQuantity: data.unreconciledQuantity,
        country: data.country,
        rawTimestamp: data.rawTimestamp,
        storeId: data.storeId,
        status
      }
    });

    logger.info('Updated inventory ledger event', {
      eventId: event.id,
      fnsku: event.fnsku,
      asin: event.asin,
      eventType: event.eventType,
      status: event.status,
      quantity: event.quantity,
      unreconciledQuantity: event.unreconciledQuantity
    });

    return event;
  }

  /**
   * Calculate event status based on business logic
   */
  private calculateEventStatus(data: InventoryLedgerEventData): InventoryLedgerStatus {
    const now = new Date();
    const eventAge = now.getTime() - data.eventDate.getTime();
    const daysOld = Math.floor(eventAge / (1000 * 60 * 60 * 24));

    // For warehouse transfers (positive quantities), mark as RESOLVED
    // These are normal inventory movements, not losses to claim
    if (data.eventType === 'WhseTransfers' && data.quantity > 0) {
      return InventoryLedgerStatus.RESOLVED;
    }

    // For receipts (positive quantities), mark as RESOLVED
    // These are normal inventory receipts
    if (data.eventType === 'Receipts' && data.quantity > 0) {
      return InventoryLedgerStatus.RESOLVED;
    }

    // For losses (negative quantities) or problematic transfers:
    // If already reconciled (unreconciled = 0), mark as RESOLVED
    if (data.unreconciledQuantity === 0) {
      return InventoryLedgerStatus.RESOLVED;
    }

    // For unreconciled losses:
    // If event is less than 7 days old, mark as WAITING
    if (daysOld < 7) {
      return InventoryLedgerStatus.WAITING;
    }

    // If 7+ days old and still unreconciled, mark as CLAIMABLE
    return InventoryLedgerStatus.CLAIMABLE;
  }

  /**
   * Check if event data has changed
   */
  private hasEventDataChanged(existing: Partial<InventoryLedgerEvent>, newData: InventoryLedgerEventData): boolean {
    return (
      existing.quantity !== newData.quantity ||
      existing.reconciledQuantity !== newData.reconciledQuantity ||
      existing.unreconciledQuantity !== newData.unreconciledQuantity ||
      existing.disposition !== newData.disposition ||
      existing.productTitle !== newData.productTitle
    );
  }

  // ===== STATUS MANAGEMENT =====

  /**
   * Update statuses for all events based on current business logic
   */
  async updateEventStatuses(): Promise<{
    updatedCount: number;
    waitingToClaimable: number;
    claimableToResolved: number;
  }> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting inventory ledger event status update');

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

      // Update WAITING events that are now 7+ days old to CLAIMABLE
      const db = await this.getDb();
      const waitingToClaimable = await db.inventoryLedgerEvent.updateMany({
        where: {
          status: 'WAITING',
          eventDate: {
            lte: sevenDaysAgo
          },
          unreconciledQuantity: {
            gt: 0
          }
        },
        data: {
          status: 'CLAIMABLE'
        }
      });

      // Update CLAIMABLE events that are now reconciled to RESOLVED
      const claimableToResolved = await db.inventoryLedgerEvent.updateMany({
        where: {
          status: 'CLAIMABLE',
          unreconciledQuantity: 0
        },
        data: {
          status: 'RESOLVED'
        }
      });

      const updatedCount = waitingToClaimable.count + claimableToResolved.count;

      const duration = Date.now() - startTime;
      logger.info('Inventory ledger event status update completed', {
        aws: {
          operation: 'updateEventStatuses',
          success: true
        },
        event: {
          duration
        },
        updatedCount,
        waitingToClaimable: waitingToClaimable.count,
        claimableToResolved: claimableToResolved.count
      });

      return {
        updatedCount,
        waitingToClaimable: waitingToClaimable.count,
        claimableToResolved: claimableToResolved.count
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to update inventory ledger event statuses', {
        aws: {
          operation: 'updateEventStatuses',
          success: false
        },
        event: {
          duration
        },
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }

  // ===== DATA RETRIEVAL =====

  /**
   * Get inventory ledger events with filtering and pagination
   */
  async getInventoryLedgerEvents(
    filters: InventoryLedgerFilters = {},
    page: number = 1,
    limit: number = 50
  ): Promise<{
    events: InventoryLedgerEvent[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    
    const where: Record<string, unknown> = {};

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    }

    if (filters.eventType && filters.eventType.length > 0) {
      where.eventType = { in: filters.eventType };
    }

    if (filters.fulfillmentCenter && filters.fulfillmentCenter.length > 0) {
      where.fulfillmentCenter = { in: filters.fulfillmentCenter };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.eventDate = {};
      if (filters.dateFrom) {
        (where.eventDate as Record<string, unknown>).gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        (where.eventDate as Record<string, unknown>).lte = filters.dateTo;
      }
    }

    if (filters.fnsku) {
      where.fnsku = { contains: filters.fnsku, mode: 'insensitive' };
    }

    if (filters.asin) {
      where.asin = { contains: filters.asin, mode: 'insensitive' };
    }

    if (filters.sku) {
      where.sku = { contains: filters.sku, mode: 'insensitive' };
    }

    const db = await this.getDb();
    const [events, total] = await Promise.all([
      db.inventoryLedgerEvent.findMany({
        where,
        orderBy: { eventDate: 'desc' },
        skip,
        take: limit
      }),
      db.inventoryLedgerEvent.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      total,
      page,
      limit,
      totalPages
    };
  }

  /**
   * Get inventory ledger statistics
   */
  async getInventoryLedgerStats(): Promise<InventoryLedgerStats> {
    try {
      const db = await this.getDb();
      const [
        claimableEvents,
        waitingEvents,
        resolvedEvents,
        claimedEvents,
        paidEvents
      ] = await Promise.all([
        db.inventoryLedgerEvent.findMany({
          where: { status: 'CLAIMABLE' },
          select: { quantity: true, unreconciledQuantity: true }
        }),
        db.inventoryLedgerEvent.findMany({
          where: { status: 'WAITING' },
          select: { quantity: true, unreconciledQuantity: true }
        }),
        db.inventoryLedgerEvent.count({
          where: { status: 'RESOLVED' }
        }),
        db.inventoryLedgerEvent.count({
          where: { status: 'CLAIMED' }
        }),
        db.inventoryLedgerEvent.count({
          where: { status: 'PAID' }
        })
      ]);

      const totalClaimableUnits = claimableEvents.reduce((sum, event) => 
        sum + Math.abs(event.unreconciledQuantity), 0
      );

      const totalWaiting = waitingEvents.reduce((sum, event) => 
        sum + Math.abs(event.unreconciledQuantity), 0
      );

      // TODO: Calculate estimated value based on COGS (Phase 2)
      const totalEstimatedValue = 0;

      return {
        totalClaimableUnits,
        totalEstimatedValue,
        totalWaiting,
        totalResolved: resolvedEvents,
        totalClaimed: claimedEvents,
        totalPaid: paidEvents,
        claimableEventsCount: claimableEvents.length,
        waitingEventsCount: waitingEvents.length
      };
    } catch (error) {
      // If table doesn't exist, return empty stats
      if (error instanceof Error && error.message.includes('does not exist')) {
        logger.warn('Inventory ledger events table does not exist, returning empty stats');
        return {
          totalClaimableUnits: 0,
          totalEstimatedValue: 0,
          totalWaiting: 0,
          totalResolved: 0,
          totalClaimed: 0,
          totalPaid: 0,
          claimableEventsCount: 0,
          waitingEventsCount: 0
        };
      }
      throw error;
    }
  }

  /**
   * Get claimable events for dashboard display with pagination and sorting
   */
  async getClaimableEvents(
    limit: number = 100, 
    offset: number = 0, 
    sortBy: string = 'eventDate', 
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<InventoryLedgerEvent[]> {
    try {
      // Validate sort field
      const validSortFields = ['eventDate', 'fnsku', 'asin', 'sku', 'eventType', 'fulfillmentCenter', 'unreconciledQuantity'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'eventDate';
      
      // Build orderBy object
      const orderBy: Record<string, 'asc' | 'desc'> = {};
      orderBy[sortField] = sortOrder;

      const db = await this.getDb();
      return await db.inventoryLedgerEvent.findMany({
        where: { status: 'CLAIMABLE' },
        orderBy,
        take: limit,
        skip: offset
      });
    } catch (error) {
      // If table doesn't exist, return empty array
      if (error instanceof Error && error.message.includes('does not exist')) {
        logger.warn('Inventory ledger events table does not exist, returning empty events', {
          operation: 'getClaimableEvents',
          limit,
          offset,
          sortBy,
          sortOrder
        });
        return [];
      }
      throw error;
    }
  }

  /**
   * Generate claim text for an event
   */
  generateClaimText(event: InventoryLedgerEvent): string {
    const eventDate = event.eventDate.toISOString().split('T')[0];
    const quantity = Math.abs(event.unreconciledQuantity);
    
    return `FNSKU ${event.fnsku} (ASIN ${event.asin}) lost in FC ${event.fulfillmentCenter || 'Unknown'} on ${eventDate}. Quantity unreconciled: ${quantity}. Please review and reimburse.`;
  }

  /**
   * Update event status to CLAIMED
   */
  async markEventAsClaimed(eventId: string): Promise<InventoryLedgerEvent> {
    const db = await this.getDb();
    return db.inventoryLedgerEvent.update({
      where: { id: eventId },
      data: { status: 'CLAIMED' }
    });
  }

  /**
   * Update event status to PAID
   */
  async markEventAsPaid(eventId: string): Promise<InventoryLedgerEvent> {
    const db = await this.getDb();
    return db.inventoryLedgerEvent.update({
      where: { id: eventId },
      data: { status: 'PAID' }
    });
  }

  /**
   * Update event status with optional notes
   */
  async updateEventStatus(eventId: string, status: string, notes?: string): Promise<InventoryLedgerEvent> {
    const db = await this.getDb();
    
    // For now, we'll store notes in a simple way
    // In the future, you might want to create a separate notes/audit table
    const updateData: any = { status };
    
    // If you want to store notes, you could add a notes field to the schema
    // For now, we'll just update the status
    
    return db.inventoryLedgerEvent.update({
      where: { id: eventId },
      data: updateData
    });
  }

  /**
   * Clean up old resolved events (optional maintenance)
   */
  async cleanupOldResolvedEvents(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const db = await this.getDb();
    const result = await db.inventoryLedgerEvent.deleteMany({
      where: {
        status: 'RESOLVED',
        updatedAt: {
          lt: cutoffDate
        }
      }
    });

    logger.info('Cleaned up old resolved inventory ledger events', {
      deletedCount: result.count,
      cutoffDate
    });

    return result.count;
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    // Don't disconnect the shared database manager
    // The database manager handles its own connection lifecycle
    this.db = null;
  }
}
