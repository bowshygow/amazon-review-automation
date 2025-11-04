import { db } from '../index';
import * as schema from '../schema';
import {
	eq,
	and,
	desc,
	count,
	sum,
	sql,
	gte,
	lte,
	inArray,
	isNull,
	notInArray,
	or
} from 'drizzle-orm';
import { AmazonSPAPI } from '$lib/amazon-api';
import { getAmazonConfig, validateAmazonConfig } from '$lib/config/amazon';
import { logger } from '$lib/logger';

export interface ReimbursementSyncResult {
	success: boolean;
	reportIds: {
		reimbursement?: string;
		customerReturns?: string;
		unsuppressedInventory?: string;
		inventoryLedger?: string;
	};
	processedCounts: {
		reimbursed: number;
		returns: number;
		inventory: number;
		ledgerEvents: number;
		claimable: number;
	};
	errors: string[];
}

export interface ReimbursementItemStats {
	category: string;
	itemCount: number;
	totalQuantity: number;
	totalValue: string;
	currency: string;
}

export class ReimbursementService {
	private api: AmazonSPAPI | null = null;

	/**
	 * Initialize Amazon API with configuration from environment variables
	 */
	private async initializeApi(): Promise<AmazonSPAPI> {
		if (this.api) {
			return this.api;
		}

		const config = getAmazonConfig();

		if (!validateAmazonConfig(config)) {
			throw new Error(
				'Amazon API configuration not found. Please configure your Amazon API credentials in environment variables.'
			);
		}

		this.api = new AmazonSPAPI({
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			refreshToken: config.refreshToken,
			marketplaceId: config.marketplaceId
		});

		return this.api;
	}

	/**
	 * Sync all reimbursement-related reports from Amazon
	 */
	async syncAllReports(
		dataStartTime: string,
		dataEndTime: string
	): Promise<ReimbursementSyncResult> {
		console.log('🚀 Starting reimbursement sync with params:', { dataStartTime, dataEndTime });
		logger.info('🚀 Starting reimbursement sync', { dataStartTime, dataEndTime });

		const syncStartTime = new Date();
		const result: ReimbursementSyncResult = {
			success: false,
			reportIds: {},
			processedCounts: {
				reimbursed: 0,
				returns: 0,
				inventory: 0,
				ledgerEvents: 0,
				claimable: 0
			},
			errors: []
		};

		try {
			console.log('📡 Initializing Amazon API...');
			const api = await this.initializeApi();
			console.log('✅ Amazon API initialized successfully');

			// 1. Sync Reimbursement Report
			try {
				console.log('📊 Step 1: Syncing reimbursement report...');
				const reimbursementResult = await this.syncReimbursementReport(
					api,
					dataStartTime,
					dataEndTime
				);
				result.reportIds.reimbursement = reimbursementResult.reportId;
				result.processedCounts.reimbursed = reimbursementResult.processedCount;
				console.log('✅ Reimbursement report synced successfully:', reimbursementResult);
			} catch (error) {
				const errorMsg = `Failed to sync reimbursement report: ${error instanceof Error ? error.message : 'Unknown error'}`;
				console.error('❌ Reimbursement report sync failed:', error);
				result.errors.push(errorMsg);
			}

			// 2. Sync Customer Returns Report
			try {
				console.log('📋 Step 2: Syncing customer returns report...');
				const returnsResult = await this.syncCustomerReturnsReport(api, dataStartTime, dataEndTime);
				result.reportIds.customerReturns = returnsResult.reportId;
				result.processedCounts.returns = returnsResult.processedCount;
				console.log('✅ Customer returns report synced successfully:', returnsResult);
			} catch (error) {
				const errorMsg = `Failed to sync customer returns report: ${error instanceof Error ? error.message : 'Unknown error'}`;
				console.error('❌ Customer returns report sync failed:', error);
				result.errors.push(errorMsg);
			}

			// 3. Sync Inventory Ledger Report (GET_LEDGER_DETAIL_VIEW_DATA)
			// This is the MOST IMPORTANT report for finding lost/damaged items!
			try {
				console.log('📦 Step 3: Syncing inventory ledger events report...');
				const ledgerResult = await this.syncInventoryLedgerReport(
					api,
					dataStartTime,
					dataEndTime
				);
				result.reportIds.inventoryLedger = ledgerResult.reportId;
				result.processedCounts.ledgerEvents = ledgerResult.processedCount;
				console.log('✅ Inventory ledger synced successfully:', ledgerResult);
			} catch (error) {
				const errorMsg = `Failed to sync inventory ledger report: ${error instanceof Error ? error.message : String(error)}`;
				console.error('❌ Inventory ledger sync failed:', error);
				result.errors.push(errorMsg);
			}

			// 4. Sync Unsuppressed Inventory Report (for pricing/value estimation)
			try {
				console.log('📦 Step 4: Syncing unsuppressed inventory report...');
				const inventoryResult = await this.syncUnsuppressedInventoryReport(
					api,
					dataStartTime,
					dataEndTime
				);
				result.reportIds.unsuppressedInventory = inventoryResult.reportId;
				result.processedCounts.inventory = inventoryResult.processedCount;
				console.log('✅ Unsuppressed inventory report synced successfully:', inventoryResult);
			} catch (error) {
				const errorMsg = `Failed to sync unsuppressed inventory report: ${error instanceof Error ? error.message : String(error)}`;
				console.error('❌ Unsuppressed inventory report sync failed:', error);
				result.errors.push(errorMsg);
			}

			// 5. Analyze and create claimable items
			try {
				console.log('🔍 Step 5: Analyzing data to find claimable items...');
				const claimableCount = await this.analyzeAndCreateClaimableItems();
				result.processedCounts.claimable = claimableCount;
				console.log('✅ Analysis completed:', claimableCount, 'claimable items identified');
			} catch (error) {
				const errorMsg = `Failed to analyze claimable items: ${error instanceof Error ? error.message : 'Unknown error'}`;
				console.error('❌ Analysis failed:', error);
				result.errors.push(errorMsg);
			}

			result.success = result.errors.length === 0;

			// Log sync completion
			const syncEndTime = new Date();
			await db.insert(schema.reimbursementSyncLogs).values({
				syncType: 'REIMBURSEMENT_FULL_SYNC',
				startDate: syncStartTime.toISOString(),
				endDate: syncEndTime.toISOString(),
				status: result.success ? 'SUCCESS' : 'PARTIAL_SUCCESS',
				recordsProcessed:
					result.processedCounts.reimbursed +
					result.processedCounts.returns +
					result.processedCounts.inventory,
				recordsAdded: result.processedCounts.claimable,
				recordsUpdated: 0,
				errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
				completedAt: syncEndTime.toISOString()
			});

			console.log('🎉 Reimbursement sync completed!', {
				success: result.success,
				reportIds: result.reportIds,
				processedCounts: result.processedCounts,
				errorCount: result.errors.length
			});

			return result;
		} catch (error) {
			const errorMsg = `Failed to sync reimbursement reports: ${error instanceof Error ? error.message : 'Unknown error'}`;
			console.error('💥 CRITICAL ERROR in reimbursement sync:', error);
			result.errors.push(errorMsg);
			return result;
		}
	}

	/**
	 * Sync reimbursement report data
	 */
	private async syncReimbursementReport(
		api: AmazonSPAPI,
		dataStartTime: string,
		dataEndTime: string
	): Promise<{ reportId: string; processedCount: number }> {
		const startTime = Date.now();

		// Create report
		const createResponse = (await api.createReimbursementReport(dataStartTime, dataEndTime)) as {
			reportId: string;
		};
		const reportId = createResponse.reportId;

		if (!reportId) {
			throw new Error('No report ID returned from Amazon API');
		}

		logger.info('Reimbursement report created', { reportId });

		// Wait for report to be ready
		const report = await api.waitForReportReady(reportId);

		if (!report.reportDocumentId) {
			throw new Error('No report document ID in completed report');
		}

		// Download and process report data
		const reimbursementData = await api.downloadReimbursementReport(report.reportDocumentId);

		logger.info('Reimbursement report data downloaded', {
			rowCount: reimbursementData.length,
			reportId,
			reportDocumentId: report.reportDocumentId
		});

		// DEBUG: Log first record to see actual field names
		if (reimbursementData.length > 0) {
			console.log('🔍 [DEBUG] First reimbursement record keys:', Object.keys(reimbursementData[0]));
			console.log('🔍 [DEBUG] First reimbursement record sample:', reimbursementData[0]);
		}

		// Process and store individual reimbursement items
		let processedCount = 0;
		let skippedCount = 0;
		for (const record of reimbursementData) {
			try {
				// Amazon reports use kebab-case field names (e.g., 'approval-date')
				// Support both kebab-case (primary) and camelCase (fallback)
				const fnsku = record['fnsku'] || record.fnsku || record.FNSKU || '';
				const asin = record['asin'] || record.asin || record.ASIN || '';
				const sku = record['sku'] || record.sku || record.SKU || '';
				const reimbursementId = record['reimbursement-id'] || record.reimbursementId || '';

				if (!fnsku || !asin || !sku) {
					skippedCount++;
					if (skippedCount <= 3) {
						// Only log first 3 skipped records to avoid spam
						console.log('⚠️ Skipping reimbursement record - missing required fields:', {
							fnsku: fnsku || 'MISSING',
							asin: asin || 'MISSING',
							sku: sku || 'MISSING',
							reimbursementId: reimbursementId || 'MISSING',
							availableFields: Object.keys(record).slice(0, 10) // Show first 10 fields
						});
					}
					continue;
				}

				// Parse amounts - handle empty strings and invalid values
				const amountPerUnit =
					parseFloat(record['amount-per-unit'] || record.amountPerUnit || '0') || 0;
				const amountTotal = parseFloat(record['amount-total'] || record.amountTotal || '0') || 0;

				// Skip if reimbursementId is missing
				if (!reimbursementId) {
					skippedCount++;
					if (skippedCount <= 3) {
						console.log('⚠️ Skipping reimbursement record - missing reimbursement-id');
					}
					continue;
				}

				// Check if already exists
				const existing = await db
					.select()
					.from(schema.reimbursedItems)
					.where(eq(schema.reimbursedItems.reimbursementId, reimbursementId))
					.limit(1);

				// Parse date - handle ISO format from Amazon - ensure it's a string
				const approvalDateStr = record['approval-date'] || record.approvalDate || new Date().toISOString();
				const approvalDate = typeof approvalDateStr === 'string' ? approvalDateStr : new Date(approvalDateStr).toISOString();

				// Parse quantities with proper fallbacks
				const quantityReimbursedCash = parseInt(
					record['quantity-reimbursed-cash'] || record.quantityReimbursedCash || '0',
					10
				) || 0;
				const quantityReimbursedInventory = parseInt(
					record['quantity-reimbursed-inventory'] || record.quantityReimbursedInventory || '0',
					10
				) || 0;
				const quantityReimbursedTotal = parseInt(
					record['quantity-reimbursed-total'] || record.quantityReimbursedTotal || '0',
					10
				) || 0;

				const reimbursementData = {
					approvalDate,
					quantityReimbursedCash,
					quantityReimbursedInventory,
					quantityReimbursedTotal,
					amountPerUnit: amountPerUnit.toFixed(2),
					amountTotal: amountTotal.toFixed(2),
					updatedAt: new Date().toISOString()
				};

				if (existing.length > 0) {
					// Update existing record
					await db
						.update(schema.reimbursedItems)
						.set(reimbursementData)
						.where(eq(schema.reimbursedItems.reimbursementId, reimbursementId));
				} else {
					// Insert new record
					await db.insert(schema.reimbursedItems).values({
						...reimbursementData,
						reimbursementId,
						caseId: record['case-id'] || record.caseId || null,
						amazonOrderId: record['amazon-order-id'] || record.amazonOrderId || null,
						reason: record.reason || null,
						sku,
						fnsku,
						asin,
						productName: record['product-name'] || record.productName || '',
						condition: record.condition || 'NewItem',
						currencyUnit: record['currency-unit'] || record.currencyUnit || 'USD',
						originalReimbursementId:
							record['original-reimbursement-id'] || record.originalReimbursementId || null,
						originalReimbursementType:
							record['original-reimbursement-type'] || record.originalReimbursementType || null
					});
				}
				processedCount++;
			} catch (error) {
				logger.warn('Failed to process reimbursement record', {
					record,
					error
				});
				console.log('❌ [ERROR] Failed to process reimbursement record:', {
					record,
					error
				});
			}
		}

		console.log(`📊 Reimbursement processing summary: ${processedCount} processed, ${skippedCount} skipped out of ${reimbursementData.length} total records`);
		
		logger.info('Reimbursement report processing completed', {
			reportId,
			processedCount,
			skippedCount,
			totalRecords: reimbursementData.length
		});

		return { reportId, processedCount };
	}

	/**
	 * Sync customer returns report data
	 */
	private async syncCustomerReturnsReport(
		api: AmazonSPAPI,
		dataStartTime: string,
		dataEndTime: string
	): Promise<{ reportId: string; processedCount: number }> {
		const startTime = Date.now();

		// Create report
		const createResponse = (await api.createCustomerReturnsReport(dataStartTime, dataEndTime)) as {
			reportId: string;
		};
		const reportId = createResponse.reportId;

		if (!reportId) {
			throw new Error('No report ID returned from Amazon API');
		}

		logger.info('Customer returns report created', { reportId });

		// Wait for report to be ready
		const report = await api.waitForReportReady(reportId);

		if (!report.reportDocumentId) {
			throw new Error('No report document ID in completed report');
		}

		// Download and process report data
		const returnsData = await api.downloadCustomerReturnsReport(report.reportDocumentId);

		logger.info('Customer returns report data downloaded', {
			rowCount: returnsData.length,
			reportId,
			reportDocumentId: report.reportDocumentId
		});

		// DEBUG: Log first record to see actual field names
		if (returnsData.length > 0) {
			console.log('🔍 [DEBUG] First customer return record keys:', Object.keys(returnsData[0]));
			console.log('🔍 [DEBUG] First customer return record sample:', returnsData[0]);
		}

		// Process and store individual return items
		let processedCount = 0;
		let skippedCount = 0;
		for (const record of returnsData) {
			try {
				// Amazon reports use kebab-case field names (e.g., 'return-date', 'order-id')
				// Support both kebab-case (primary) and camelCase (fallback)
				const orderId = record['order-id'] || record.orderId || record['Order ID'] || '';
				const sku = record['sku'] || record.sku || record.SKU || '';
				const asin = record['asin'] || record.asin || record.ASIN || '';
				const fnsku = record['fnsku'] || record.fnsku || record.FNSKU || '';
				const returnDateStr = record['return-date'] || record.returnDate || record['Return Date'] || new Date().toISOString();
				// Convert to ISO string since schema uses mode: 'string' for timestamp
				const returnDate = new Date(returnDateStr).toISOString();

				if (!orderId || !sku || !asin || !fnsku) {
					skippedCount++;
					if (skippedCount <= 3) {
						// Only log first 3 skipped records to avoid spam
						console.log('⚠️ Skipping customer return record - missing required fields:', {
							orderId: orderId || 'MISSING',
							sku: sku || 'MISSING',
							asin: asin || 'MISSING',
							fnsku: fnsku || 'MISSING',
							returnDate: returnDateStr || 'MISSING',
							availableFields: Object.keys(record).slice(0, 10) // Show first 10 fields
						});
					}
					continue;
				}

				// Check if already exists
				const existing = await db
					.select()
					.from(schema.customerReturns)
					.where(
						and(
							eq(schema.customerReturns.orderId, orderId),
							eq(schema.customerReturns.fnsku, fnsku),
							eq(schema.customerReturns.returnDate, returnDate)
						)
					)
					.limit(1);

				if (existing.length === 0) {
					// Parse quantity with proper fallback
					const quantity = parseInt(record['quantity'] || record.quantity || '1', 10) || 1;

					// Insert new return with proper field mapping
					await db.insert(schema.customerReturns).values({
						returnDate,
						orderId,
						sku,
						asin,
						fnsku,
						productName: record['product-name'] || record.productName || '',
						quantity,
						fulfillmentCenterId:
							record['fulfillment-center-id'] || record.fulfillmentCenterId || null,
						detailedDisposition:
							record['detailed-disposition'] || record.detailedDisposition || null,
						reason: record.reason || null,
						status: record.status || null,
						licensePlateNumber: record['license-plate-number'] || record.licensePlateNumber || null,
						customerComments: record['customer-comments'] || record.customerComments || null
					});
					processedCount++;
				}
			} catch (error) {
				logger.warn('Failed to process customer return record', {
					record,
					error
				});
				console.log('❌ [ERROR] Failed to process customer return record:', {
					record,
					error
				});
			}
		}

		console.log(`📊 Customer returns processing summary: ${processedCount} processed, ${skippedCount} skipped out of ${returnsData.length} total records`);
		
		logger.info('Customer returns report processing completed', {
			reportId,
			processedCount,
			skippedCount,
			totalRecords: returnsData.length
		});

		return { reportId, processedCount };
	}

	/**
	 * Sync unsuppressed inventory report data
	 */
	private async syncUnsuppressedInventoryReport(
		api: AmazonSPAPI,
		dataStartTime: string,
		dataEndTime: string
	): Promise<{ reportId: string; processedCount: number }> {
		const startTime = Date.now();

		// Create report
		const createResponse = (await api.createUnsuppressedInventoryReport(
			dataStartTime,
			dataEndTime
		)) as { reportId: string };
		const reportId = createResponse.reportId;

		if (!reportId) {
			throw new Error('No report ID returned from Amazon API');
		}

		logger.info('Unsuppressed inventory report created', { reportId });

		// Wait for report to be ready
		const report = await api.waitForReportReady(reportId);

		if (!report.reportDocumentId) {
			throw new Error('No report document ID in completed report');
		}

		// Download and process report data
		const inventoryData = await api.downloadUnsuppressedInventoryReport(report.reportDocumentId);

		logger.info('Unsuppressed inventory report data downloaded', {
			rowCount: inventoryData.length,
			reportId,
			reportDocumentId: report.reportDocumentId
		});

		// Clear old inventory data
		await db.delete(schema.unsuppressedInventory);

		// Process and store inventory items
		let processedCount = 0;
		for (const record of inventoryData) {
			try {
				const sku = record.sku || record.SKU || '';
				const fnsku = record.fnsku || record.FNSKU || '';
				const asin = record.asin || record.ASIN || '';

				if (!sku || !fnsku || !asin) {
					console.log('⚠️ Skipping inventory record - missing required fields:', record);
					continue;
				}

				await db.insert(schema.unsuppressedInventory).values({
					sku,
					fnsku,
					asin,
					productName: record['product-name'] || record.productName || '',
					condition: record.condition || 'New',
					yourPrice: record['your-price'] ? parseFloat(record['your-price']).toFixed(2) : null,
					mfnListingExists: record['mfn-listing-exists'] || record.mfnListingExists || null,
					mfnFulfillableQuantity: parseInt(record['mfn-fulfillable-quantity'] || '0') || null,
					afnListingExists: record['afn-listing-exists'] || record.afnListingExists || null,
					afnWarehouseQuantity: parseInt(record['afn-warehouse-quantity'] || '0') || null,
					afnFulfillableQuantity: parseInt(record['afn-fulfillable-quantity'] || '0') || null,
					afnUnsellableQuantity: parseInt(record['afn-unsellable-quantity'] || '0') || null,
					afnReservedQuantity: parseInt(record['afn-reserved-quantity'] || '0') || null,
					afnTotalQuantity: parseInt(record['afn-total-quantity'] || '0') || null,
					perUnitVolume: record['per-unit-volume']
						? parseFloat(record['per-unit-volume']).toFixed(2)
						: null,
					afnInboundWorkingQuantity:
						parseInt(record['afn-inbound-working-quantity'] || '0') || null,
					afnInboundShippedQuantity:
						parseInt(record['afn-inbound-shipped-quantity'] || '0') || null,
					afnInboundReceivingQuantity:
						parseInt(record['afn-inbound-receiving-quantity'] || '0') || null,
					afnResearchingQuantity: parseInt(record['afn-researching-quantity'] || '0') || null,
					afnReservedFutureSupply: parseInt(record['afn-reserved-future-supply'] || '0') || null,
					afnFutureSupplyBuyable: parseInt(record['afn-future-supply-buyable'] || '0') || null
				});
				processedCount++;
			} catch (error) {
				logger.warn('Failed to process inventory record', {
					record,
					error
				});
				console.log('❌ [ERROR] Failed to process inventory record:', {
					record,
					error
				});
			}
		}

		logger.info('Unsuppressed inventory report processing completed', {
			reportId,
			processedCount,
			totalRecords: inventoryData.length
		});

		return { reportId, processedCount };
	}

	/**
	 * Sync inventory ledger events report data (GET_LEDGER_DETAIL_VIEW_DATA)
	 * This is the PRIMARY source for finding lost/damaged warehouse inventory
	 */
	private async syncInventoryLedgerReport(
		api: AmazonSPAPI,
		dataStartTime: string,
		dataEndTime: string
	): Promise<{ reportId: string; processedCount: number }> {
		const startTime = Date.now();

		// Create report
		const createResponse = (await api.createInventoryLedgerReport(
			dataStartTime,
			dataEndTime
		)) as { reportId: string };
		const reportId = createResponse.reportId;

		if (!reportId) {
			throw new Error('No report ID returned from Amazon API');
		}

		logger.info('Inventory ledger report created', { reportId });

		// Wait for report to be ready
		const report = await api.waitForReportReady(reportId);

		if (!report.reportDocumentId) {
			throw new Error('No report document ID in completed report');
		}

		// Download and process report data
		const ledgerData = await api.downloadInventoryLedgerReport(report.reportDocumentId);

		logger.info('Inventory ledger report data downloaded', {
			rowCount: ledgerData.length,
			reportId,
			reportDocumentId: report.reportDocumentId
		});

		console.log(`📊 Processing ${ledgerData.length} inventory ledger events...`);

		// Process and store ledger events
		let processedCount = 0;
		let skippedCount = 0;

		for (const event of ledgerData) {
			try {
				const fnsku = event.fnsku || '';
				const asin = event.asin || '';
				const sku = event.sku || '';
				const eventType = event.eventType || '';

				if (!fnsku || !asin || !sku || !eventType) {
					skippedCount++;
					if (skippedCount <= 3) {
						console.log('⚠️ Skipping ledger event - missing required fields:', {
							fnsku: fnsku || 'MISSING',
							asin: asin || 'MISSING',
							sku: sku || 'MISSING',
							eventType: eventType || 'MISSING'
						});
					}
					continue;
				}

				// Check if event already exists (deduplication)
				// Ensure eventDate is a proper ISO string
				const eventDateRaw = event.eventDate || new Date().toISOString();
				const eventDate = typeof eventDateRaw === 'string' ? eventDateRaw : new Date(eventDateRaw).toISOString();
				const referenceId = event.referenceId || null;
				const fulfillmentCenter = event.fulfillmentCenter || null;

				// Build where conditions dynamically to avoid type errors
				const whereConditions = [
					eq(schema.inventoryLedgerEvents.fnsku, fnsku),
					eq(schema.inventoryLedgerEvents.asin, asin),
					eq(schema.inventoryLedgerEvents.eventDate, eventDate),
					eq(schema.inventoryLedgerEvents.eventType, eventType)
				];

				if (referenceId) {
					whereConditions.push(eq(schema.inventoryLedgerEvents.referenceId, referenceId));
				} else {
					whereConditions.push(isNull(schema.inventoryLedgerEvents.referenceId));
				}

				if (fulfillmentCenter) {
					whereConditions.push(eq(schema.inventoryLedgerEvents.fulfillmentCenter, fulfillmentCenter));
				} else {
					whereConditions.push(isNull(schema.inventoryLedgerEvents.fulfillmentCenter));
				}

				const existing = await db
					.select()
					.from(schema.inventoryLedgerEvents)
					.where(and(...whereConditions))
					.limit(1);

				if (existing.length === 0) {
					// Get raw timestamp - ensure it's a string
					const rawTimestampRaw = event.rawTimestamp || eventDateRaw;
					const rawTimestamp = typeof rawTimestampRaw === 'string' ? rawTimestampRaw : new Date(rawTimestampRaw).toISOString();

					// Build insert values - only include optional fields if they have values
					const insertValues: any = {
						eventDate,
						fnsku,
						asin,
						sku,
						productTitle: event.productTitle || '',
						eventType,
						quantity: parseInt(String(event.quantity || 0), 10),
						country: event.country || 'US',
						rawTimestamp,
						unreconciledQuantity: parseInt(String(event.unreconciledQuantity || 0), 10),
						status: 'WAITING',
						updatedAt: new Date().toISOString()
					};

					// Add optional fields only if they have values
					if (referenceId) insertValues.referenceId = referenceId;
					if (fulfillmentCenter) insertValues.fulfillmentCenter = fulfillmentCenter;
					if (event.disposition) insertValues.disposition = event.disposition;
					if (event.reason) insertValues.reason = event.reason;

					// Insert new ledger event
					await db.insert(schema.inventoryLedgerEvents).values(insertValues);
					processedCount++;
				}
			} catch (error) {
				logger.warn('Failed to process inventory ledger event', {
					event,
					error
				});
				console.log('❌ [ERROR] Failed to process inventory ledger event:', {
					event,
					error
				});
			}
		}

		console.log(`📊 Inventory ledger processing summary: ${processedCount} processed, ${skippedCount} skipped out of ${ledgerData.length} total events`);

		logger.info('Inventory ledger report processing completed', {
			reportId,
			processedCount,
			skippedCount,
			duration: Date.now() - startTime
		});

		return { reportId, processedCount };
	}

	/**
	 * Analyze data to identify and create claimable items
	 * Based on business logic from reimbursement.md - Phase 1 Flow
	 */
	private async analyzeAndCreateClaimableItems(): Promise<number> {
		console.log('🔍 Analyzing data to find claimable items...');
		logger.info('Starting reimbursement analysis - Phase 1 Flow');

		let totalClaimableCount = 0;

		try {
			// Step 1: Identify Lost Inventory in Warehouse
			// EventType = "Adjustments" AND Reason IN ("M", "5") AND UnreconciledQuantity > 0
			console.log('📋 Step 1: Finding lost warehouse inventory...');
			const lostWarehouseCount = await this.findLostWarehouseInventory();
			totalClaimableCount += lostWarehouseCount;
			console.log(`✅ Step 1: Found ${lostWarehouseCount} lost warehouse items`);

			// Step 2: Identify Warehouse-Damaged Inventory Not Reimbursed
			// EventType = "Adjustments" AND Reason IN ("D", "W")
			console.log('📋 Step 2: Finding damaged warehouse inventory...');
			const damagedWarehouseCount = await this.findDamagedWarehouseInventory();
			totalClaimableCount += damagedWarehouseCount;
			console.log(`✅ Step 2: Found ${damagedWarehouseCount} damaged warehouse items`);

			// Step 3: Customer Refunded But Item Not Returned
			console.log('📋 Step 3: Finding customer refunds without returns...');
			const refundWithoutReturnCount = await this.findRefundWithoutReturn();
			totalClaimableCount += refundWithoutReturnCount;
			console.log(`✅ Step 3: Found ${refundWithoutReturnCount} refunds without returns`);

			// Step 4: Customer Returned Item BUT Amazon Lost It
			console.log('📋 Step 4: Finding customer returns lost by Amazon...');
			const lostReturnCount = await this.findLostCustomerReturns();
			totalClaimableCount += lostReturnCount;
			console.log(`✅ Step 4: Found ${lostReturnCount} lost customer returns`);

			// Step 5: Returned item came damaged but no reimbursement
			console.log('📋 Step 5: Finding damaged customer returns without reimbursement...');
			const damagedReturnCount = await this.findDamagedCustomerReturns();
			totalClaimableCount += damagedReturnCount;
			console.log(`✅ Step 5: Found ${damagedReturnCount} damaged returns without reimbursement`);

			logger.info('Reimbursement analysis completed', {
				totalClaimableCount,
				byStep: {
					lostWarehouse: lostWarehouseCount,
					damagedWarehouse: damagedWarehouseCount,
					refundWithoutReturn: refundWithoutReturnCount,
					lostReturns: lostReturnCount,
					damagedReturns: damagedReturnCount
				}
			});

			return totalClaimableCount;
		} catch (error) {
			logger.error('Failed to analyze claimable items', {
				error
			});
			console.log('❌ [ERROR] Failed to analyze claimable items:', error);
			throw error;
		}
	}

	/**
	 * Step 1: Find Lost Inventory in Warehouse
	 * EventType = "Adjustments" AND Reason IN ("M", "5") AND UnreconciledQuantity > 0
	 */
	private async findLostWarehouseInventory(): Promise<number> {
		try {
			// Get all Adjustment events with Reasons M or 5 that have unreconciled quantity
			const lostEvents = await db
				.select({
					id: schema.inventoryLedgerEvents.id,
					fnsku: schema.inventoryLedgerEvents.fnsku,
					asin: schema.inventoryLedgerEvents.asin,
					sku: schema.inventoryLedgerEvents.sku,
					productTitle: schema.inventoryLedgerEvents.productTitle,
					eventDate: schema.inventoryLedgerEvents.eventDate,
					fulfillmentCenter: schema.inventoryLedgerEvents.fulfillmentCenter,
					referenceId: schema.inventoryLedgerEvents.referenceId,
					unreconciledQuantity: schema.inventoryLedgerEvents.unreconciledQuantity,
					reason: schema.inventoryLedgerEvents.reason
				})
				.from(schema.inventoryLedgerEvents)
				.where(
					and(
						eq(schema.inventoryLedgerEvents.eventType, 'Adjustments'),
						inArray(schema.inventoryLedgerEvents.reason, ['M', '5']),
						gte(schema.inventoryLedgerEvents.unreconciledQuantity, 1)
					)
				);

			// Check which ones are already reimbursed or already claimable
			let createdCount = 0;
			for (const event of lostEvents) {
				// Check if already reimbursed
				const reimbursed = await db
					.select({ id: schema.reimbursedItems.id })
					.from(schema.reimbursedItems)
					.where(
						and(
							eq(schema.reimbursedItems.fnsku, event.fnsku),
							eq(schema.reimbursedItems.asin, event.asin)
						)
					)
					.limit(1);

				if (reimbursed.length > 0) {
					logger.debug('Skipping lost inventory already reimbursed', {
						fnsku: event.fnsku,
						asin: event.asin
					});
					continue;
				}

				// Check if already claimable
				const existingClaim = await db
					.select({ id: schema.claimableItems.id })
					.from(schema.claimableItems)
					.where(
						and(
							eq(schema.claimableItems.fnsku, event.fnsku),
							eq(schema.claimableItems.category, 'LOST_WAREHOUSE'),
							gte(
								schema.claimableItems.eventDate,
								new Date(event.eventDate).toISOString().split('T')[0]
							)
						)
					)
					.limit(1);

				if (existingClaim.length > 0) {
					logger.debug('Skipping lost inventory already in claimable items', {
						fnsku: event.fnsku
					});
					continue;
				}

				// Get estimated value from unsuppressed inventory
				const inventory = await db
					.select({ yourPrice: schema.unsuppressedInventory.yourPrice })
					.from(schema.unsuppressedInventory)
					.where(eq(schema.unsuppressedInventory.fnsku, event.fnsku))
					.limit(1);

				const estimatedValue =
					inventory.length > 0 && inventory[0].yourPrice
						? (parseFloat(inventory[0].yourPrice) * Math.abs(event.unreconciledQuantity)).toFixed(2)
						: null;

				// Create claimable item
				await db.insert(schema.claimableItems).values({
					fnsku: event.fnsku,
					asin: event.asin,
					sku: event.sku,
					productName: event.productTitle,
					category: 'LOST_WAREHOUSE',
					status: 'PENDING',
					quantity: Math.abs(event.unreconciledQuantity),
					estimatedValue: estimatedValue,
					currency: 'USD',
					fulfillmentCenter: event.fulfillmentCenter,
					eventDate: new Date(event.eventDate).toISOString(),
					referenceId: event.referenceId,
					reason: `Lost in warehouse. Reason: ${event.reason}`
				});

				createdCount++;
			}

			return createdCount;
		} catch (error) {
			logger.error('Failed to find lost warehouse inventory', {
				error
			});
			console.log('❌ [ERROR] Failed to find lost warehouse inventory:', error);
			return 0;
		}
	}

	/**
	 * Step 2: Find Damaged Warehouse Inventory Not Reimbursed
	 * EventType = "Adjustments" AND Reason IN ("D", "W")
	 */
	private async findDamagedWarehouseInventory(): Promise<number> {
		try {
			// Get all Adjustment events with Reasons D or W
			const damagedEvents = await db
				.select({
					id: schema.inventoryLedgerEvents.id,
					fnsku: schema.inventoryLedgerEvents.fnsku,
					asin: schema.inventoryLedgerEvents.asin,
					sku: schema.inventoryLedgerEvents.sku,
					productTitle: schema.inventoryLedgerEvents.productTitle,
					eventDate: schema.inventoryLedgerEvents.eventDate,
					fulfillmentCenter: schema.inventoryLedgerEvents.fulfillmentCenter,
					referenceId: schema.inventoryLedgerEvents.referenceId,
					quantity: schema.inventoryLedgerEvents.quantity,
					reason: schema.inventoryLedgerEvents.reason
				})
				.from(schema.inventoryLedgerEvents)
				.where(
					and(
						eq(schema.inventoryLedgerEvents.eventType, 'Adjustments'),
						inArray(schema.inventoryLedgerEvents.reason, ['D', 'W'])
					)
				);

			let createdCount = 0;
			for (const event of damagedEvents) {
				// Check if already reimbursed for this FNSKU + Date
				const reimbursed = await db
					.select({ id: schema.reimbursedItems.id })
					.from(schema.reimbursedItems)
					.where(
						and(
							eq(schema.reimbursedItems.fnsku, event.fnsku),
							gte(schema.reimbursedItems.approvalDate, new Date(event.eventDate).toISOString())
						)
					)
					.limit(1);

				if (reimbursed.length > 0) {
					continue;
				}

				// Check if already claimable
				const existingClaim = await db
					.select({ id: schema.claimableItems.id })
					.from(schema.claimableItems)
					.where(
						and(
							eq(schema.claimableItems.fnsku, event.fnsku),
							eq(schema.claimableItems.category, 'DAMAGED_WAREHOUSE'),
							gte(
								schema.claimableItems.eventDate,
								new Date(event.eventDate).toISOString().split('T')[0]
							)
						)
					)
					.limit(1);

				if (existingClaim.length > 0) {
					continue;
				}

				// Get estimated value
				const inventory = await db
					.select({ yourPrice: schema.unsuppressedInventory.yourPrice })
					.from(schema.unsuppressedInventory)
					.where(eq(schema.unsuppressedInventory.fnsku, event.fnsku))
					.limit(1);

				const estimatedValue =
					inventory.length > 0 && inventory[0].yourPrice
						? (parseFloat(inventory[0].yourPrice) * Math.abs(event.quantity)).toFixed(2)
						: null;

				// Create claimable item
				await db.insert(schema.claimableItems).values({
					fnsku: event.fnsku,
					asin: event.asin,
					sku: event.sku,
					productName: event.productTitle,
					category: 'DAMAGED_WAREHOUSE',
					status: 'PENDING',
					quantity: Math.abs(event.quantity),
					estimatedValue: estimatedValue,
					currency: 'USD',
					fulfillmentCenter: event.fulfillmentCenter,
					eventDate: new Date(event.eventDate).toISOString(),
					referenceId: event.referenceId,
					reason: `Damaged in warehouse. Reason: ${event.reason}`
				});

				createdCount++;
			}

			return createdCount;
		} catch (error) {
			logger.error('Failed to find damaged warehouse inventory', {
				error
			});
			console.log('❌ [ERROR] Failed to find damaged warehouse inventory:', error);
			return 0;
		}
	}

	/**
	 * Step 3: Customer Refunded But Item Not Returned
	 */
	private async findRefundWithoutReturn(): Promise<number> {
		try {
			// This would require checking refund data from customer returns report
			// where status indicates refund issued but no corresponding CustomerReturn event
			// This is a placeholder as we need more context on refund data structure

			logger.info('Step 3: Refund without return - placeholder implementation');
			return 0;
		} catch (error) {
			logger.error('Failed to find refund without return', {
				error
			});
			console.log('❌ [ERROR] Failed to find refund without return:', error);
			return 0;
		}
	}

	/**
	 * Step 4: Customer Returned Item BUT Amazon Lost It
	 * CustomerReturn event exists BUT item never re-entered sellable inventory AND no reimbursement
	 */
	private async findLostCustomerReturns(): Promise<number> {
		try {
			// Get all customer returns
			const returns = await db
				.select({
					id: schema.customerReturns.id,
					fnsku: schema.customerReturns.fnsku,
					asin: schema.customerReturns.asin,
					sku: schema.customerReturns.sku,
					productName: schema.customerReturns.productName,
					returnDate: schema.customerReturns.returnDate,
					orderId: schema.customerReturns.orderId,
					quantity: schema.customerReturns.quantity,
					status: schema.customerReturns.status
				})
				.from(schema.customerReturns)
				.where(eq(schema.customerReturns.status, 'Unit returned to inventory'));

			let createdCount = 0;
			for (const returnItem of returns) {
				// Check if there's a corresponding CustomerReturn in ledger that shows item re-entered
				const ledgerReturn = await db
					.select({ id: schema.inventoryLedgerEvents.id })
					.from(schema.inventoryLedgerEvents)
					.where(
						and(
							eq(schema.inventoryLedgerEvents.fnsku, returnItem.fnsku),
							eq(schema.inventoryLedgerEvents.eventType, 'CustomerReturns'),
							gte(
								schema.inventoryLedgerEvents.eventDate,
								new Date(returnItem.returnDate).toISOString()
							)
						)
					)
					.limit(1);

				// If there's no CustomerReturn in ledger, or if it's still unreconciled, we may have a lost return
				if (ledgerReturn.length === 0) {
					// Check if already reimbursed
					const reimbursed = await db
						.select({ id: schema.reimbursedItems.id })
						.from(schema.reimbursedItems)
						.where(
							and(
								eq(schema.reimbursedItems.fnsku, returnItem.fnsku),
								eq(schema.reimbursedItems.amazonOrderId, returnItem.orderId)
							)
						)
						.limit(1);

					if (reimbursed.length > 0) {
						continue;
					}

					// Check if already claimable
					const existingClaim = await db
						.select({ id: schema.claimableItems.id })
						.from(schema.claimableItems)
						.where(
							and(
								eq(schema.claimableItems.fnsku, returnItem.fnsku),
								eq(schema.claimableItems.category, 'CUSTOMER_RETURN_NOT_RECEIVED')
							)
						)
						.limit(1);

					if (existingClaim.length > 0) {
						continue;
					}

					// Get estimated value
					const inventory = await db
						.select({ yourPrice: schema.unsuppressedInventory.yourPrice })
						.from(schema.unsuppressedInventory)
						.where(eq(schema.unsuppressedInventory.fnsku, returnItem.fnsku))
						.limit(1);

					const estimatedValue =
						inventory.length > 0 && inventory[0].yourPrice
							? (parseFloat(inventory[0].yourPrice) * returnItem.quantity).toFixed(2)
							: null;

					// Create claimable item
					await db.insert(schema.claimableItems).values({
						fnsku: returnItem.fnsku,
						asin: returnItem.asin,
						sku: returnItem.sku,
						productName: returnItem.productName || 'Unknown Product',
						category: 'CUSTOMER_RETURN_NOT_RECEIVED',
						status: 'PENDING',
						quantity: returnItem.quantity,
						estimatedValue: estimatedValue,
						currency: 'USD',
						eventDate: new Date(returnItem.returnDate).toISOString(),
						referenceId: returnItem.orderId,
						reason: `Customer return not received by Amazon warehouse`
					});

					createdCount++;
				}
			}

			return createdCount;
		} catch (error) {
			logger.error('Failed to find lost customer returns', {
				error
			});
			console.log('❌ [ERROR] Failed to find lost customer returns:', error);
			return 0;
		}
	}

	/**
	 * Step 5: Returned item came damaged but no reimbursement
	 */
	private async findDamagedCustomerReturns(): Promise<number> {
		try {
			// Get customer returns with detailedDisposition = CUSTOMER_DAMAGED
			const damagedReturns = await db
				.select({
					id: schema.customerReturns.id,
					fnsku: schema.customerReturns.fnsku,
					asin: schema.customerReturns.asin,
					sku: schema.customerReturns.sku,
					productName: schema.customerReturns.productName,
					returnDate: schema.customerReturns.returnDate,
					orderId: schema.customerReturns.orderId,
					quantity: schema.customerReturns.quantity,
					detailedDisposition: schema.customerReturns.detailedDisposition
				})
				.from(schema.customerReturns)
				.where(eq(schema.customerReturns.detailedDisposition, 'CUSTOMER_DAMAGED'));

			let createdCount = 0;
			for (const damagedReturn of damagedReturns) {
				// Check if already reimbursed
				const reimbursed = await db
					.select({ id: schema.reimbursedItems.id })
					.from(schema.reimbursedItems)
					.where(
						and(
							eq(schema.reimbursedItems.fnsku, damagedReturn.fnsku),
							eq(schema.reimbursedItems.amazonOrderId, damagedReturn.orderId)
						)
					)
					.limit(1);

				if (reimbursed.length > 0) {
					continue;
				}

				// Check if already claimable
				const existingClaim = await db
					.select({ id: schema.claimableItems.id })
					.from(schema.claimableItems)
					.where(
						and(
							eq(schema.claimableItems.fnsku, damagedReturn.fnsku),
							eq(schema.claimableItems.category, 'CUSTOMER_RETURN_DAMAGED')
						)
					)
					.limit(1);

				if (existingClaim.length > 0) {
					continue;
				}

				// Get estimated value
				const inventory = await db
					.select({ yourPrice: schema.unsuppressedInventory.yourPrice })
					.from(schema.unsuppressedInventory)
					.where(eq(schema.unsuppressedInventory.fnsku, damagedReturn.fnsku))
					.limit(1);

				const estimatedValue =
					inventory.length > 0 && inventory[0].yourPrice
						? (parseFloat(inventory[0].yourPrice) * damagedReturn.quantity).toFixed(2)
						: null;

				// Create claimable item
				await db.insert(schema.claimableItems).values({
					fnsku: damagedReturn.fnsku,
					asin: damagedReturn.asin,
					sku: damagedReturn.sku,
					productName: damagedReturn.productName || 'Unknown Product',
					category: 'CUSTOMER_RETURN_DAMAGED',
					status: 'PENDING',
					quantity: damagedReturn.quantity,
					estimatedValue: estimatedValue,
					currency: 'USD',
					eventDate: new Date(damagedReturn.returnDate).toISOString(),
					referenceId: damagedReturn.orderId,
					reason: `Customer returned item damaged: ${damagedReturn.detailedDisposition}`
				});

				createdCount++;
			}

			return createdCount;
		} catch (error) {
			logger.error('Failed to find damaged customer returns', {
				error
			});
			console.log('❌ [ERROR] Failed to find damaged customer returns:', error);
			return 0;
		}
	}

	/**
	 * Get statistics for reimbursement items grouped by category
	 */
	async getStats(): Promise<ReimbursementItemStats[]> {
		// Get stats for reimbursed items
		const reimbursedStats = await db
			.select({
				category: sql<string>`'RECOVERED'`,
				itemCount: count(),
				totalQuantity: sum(schema.reimbursedItems.quantityReimbursedTotal),
				totalValue: sum(schema.reimbursedItems.amountTotal),
				currency: schema.reimbursedItems.currencyUnit
			})
			.from(schema.reimbursedItems)
			.groupBy(schema.reimbursedItems.currencyUnit);

		// Get stats for claimable items by category
		const claimableStats = await db
			.select({
				category: schema.claimableItems.category,
				itemCount: count(),
				totalQuantity: sum(schema.claimableItems.quantity),
				totalValue: sum(schema.claimableItems.estimatedValue),
				currency: schema.claimableItems.currency
			})
			.from(schema.claimableItems)
			.groupBy(schema.claimableItems.category, schema.claimableItems.currency);

		return [
			...reimbursedStats.map((stat) => ({
				category: 'RECOVERED',
				itemCount: Number(stat.itemCount),
				totalQuantity: Number(stat.totalQuantity) || 0,
				totalValue: stat.totalValue?.toString() || '0',
				currency: stat.currency || 'USD'
			})),
			...claimableStats.map((stat) => ({
				category: stat.category,
				itemCount: Number(stat.itemCount),
				totalQuantity: Number(stat.totalQuantity) || 0,
				totalValue: stat.totalValue?.toString() || '0',
				currency: stat.currency
			}))
		];
	}

	/**
	 * Get all reimbursed items (already recovered)
	 */
	async getReimbursedItems(limit: number = 100, offset: number = 0) {
		const items = await db
			.select()
			.from(schema.reimbursedItems)
			.orderBy(desc(schema.reimbursedItems.approvalDate))
			.limit(limit)
			.offset(offset);

		const total = await db.select({ count: count() }).from(schema.reimbursedItems);

		return {
			items,
			total: Number(total[0]?.count || 0)
		};
	}

	/**
	 * Get all claimable items (yet to recover)
	 */
	async getClaimableItems(limit: number = 100, offset: number = 0, category?: string) {
		const query = db
			.select()
			.from(schema.claimableItems)
			.orderBy(desc(schema.claimableItems.createdAt))
			.limit(limit)
			.offset(offset);

		if (category) {
			query.where(eq(schema.claimableItems.category, category as any));
		}

		const items = await query;

		const countQuery = db.select({ count: count() }).from(schema.claimableItems);

		if (category) {
			countQuery.where(eq(schema.claimableItems.category, category as any));
		}

		const total = await countQuery;

		return {
			items,
			total: Number(total[0]?.count || 0)
		};
	}

	/**
	 * Get reimbursement items by category (combined view of reimbursed and claimable items)
	 */
	async getReimbursementItemsByCategory(
		category?: string,
		limit: number = 100,
		offset: number = 0,
		sortBy: string = 'createdAt',
		sortOrder: 'asc' | 'desc' = 'desc'
	) {
		// If category is RECOVERED, get reimbursed items
		if (category === 'RECOVERED') {
			return this.getReimbursedItems(limit, offset);
		}

		// Otherwise get claimable items filtered by category
		return this.getClaimableItems(limit, offset, category);
	}

	/**
	 * Get all customer returns
	 */
	async getCustomerReturns(limit: number = 100, offset: number = 0) {
		const items = await db
			.select()
			.from(schema.customerReturns)
			.orderBy(desc(schema.customerReturns.returnDate))
			.limit(limit)
			.offset(offset);

		const total = await db.select({ count: count() }).from(schema.customerReturns);

		return {
			items,
			total: Number(total[0]?.count || 0)
		};
	}

	/**
	 * Alias for getStats - matching API endpoint naming
	 */
	async getReimbursementStats(): Promise<ReimbursementItemStats[]> {
		return this.getStats();
	}

	/**
	 * Get reimbursement tickets (alias for getClaimableItems with ticket-like data)
	 */
	async getReimbursementTickets(
		filters: { status?: string; priority?: string; category?: string } = {},
		page: number = 1,
		limit: number = 50
	) {
		let query = db.select().from(schema.claimableItems);

		// Apply filters
		const conditions: any[] = [];
		if (filters.category) {
			conditions.push(eq(schema.claimableItems.category, filters.category as any));
		}
		if (filters.status) {
			conditions.push(eq(schema.claimableItems.status, filters.status as any));
		}
		if (conditions.length > 0) {
			query = query.where(and(...conditions));
		}

		// Get total count
		const totalQuery = db.select({ count: count() }).from(schema.claimableItems);
		if (conditions.length > 0) {
			totalQuery.where(and(...conditions));
		}

		const [tickets, totalResult] = await Promise.all([
			query
				.orderBy(desc(schema.claimableItems.createdAt))
				.limit(limit)
				.offset((page - 1) * limit),
			totalQuery
		]);

		const total = Number(totalResult[0]?.count || 0);
		const totalPages = Math.ceil(total / limit);

		// Map to ticket format
		const ticketsData = tickets.map((item) => ({
			ticketId: item.id,
			item: {
				productTitle: item.productName,
				sku: item.sku,
				asin: item.asin
			},
			status: item.status,
			priority: this.determinePriority(item),
			category: item.category,
			estimatedAmount: parseFloat(item.estimatedValue || '0'),
			currency: item.currency,
			submittedDate: item.eventDate
		}));

		return {
			tickets: ticketsData,
			total,
			page,
			limit,
			totalPages
		};
	}

	/**
	 * Determine priority based on claim value
	 */
	private determinePriority(item: any): string {
		const value = parseFloat(item.estimatedValue || '0');
		if (value >= 500) return 'HIGH';
		if (value >= 100) return 'MEDIUM';
		return 'LOW';
	}

	/**
	 * Get all unique categories from claimable items with their counts
	 */
	async getCategories() {
		try {
			// Get categories from claimable items
			const claimableCategories = await db
				.select({
					category: schema.claimableItems.category,
					count: count()
				})
				.from(schema.claimableItems)
				.groupBy(schema.claimableItems.category);

			// Get reimbursed items count
			const reimbursedCount = await db
				.select({
					count: count()
				})
				.from(schema.reimbursedItems);

			// Build categories array
			const categories = [
				{
					category: 'RECOVERED',
					count: Number(reimbursedCount[0]?.count || 0),
					label: 'Recovered'
				},
				...claimableCategories.map((cat) => ({
					category: cat.category,
					count: Number(cat.count || 0),
					label: this.getCategoryLabel(cat.category)
				}))
			];

			return categories;
		} catch (error) {
			logger.error('Failed to get categories', { error });
			throw error;
		}
	}

	/**
	 * Get human-readable label for category
	 */
	private getCategoryLabel(category: string): string {
		const labels: Record<string, string> = {
			LOST_WAREHOUSE: 'Lost in Warehouse',
			DAMAGED_WAREHOUSE: 'Damaged in Warehouse',
			CUSTOMER_RETURN_NOT_RECEIVED: 'Customer Return Not Received',
			CUSTOMER_RETURN_DAMAGED: 'Customer Return Damaged',
			RECOVERED: 'Recovered'
		};
		return labels[category] || category;
	}
}
