<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import InventoryLedgerFilterBar from '$lib/components/InventoryLedgerFilterBar.svelte';
  import type { InventoryLedgerEvent, InventoryLedgerStats } from '$lib/types';

  let { 
    stats = null, 
    claimableEvents = [], 
    loading = false, 
    error = null, 
    refreshing = false 
  }: {
    stats?: InventoryLedgerStats | null;
    claimableEvents?: InventoryLedgerEvent[];
    loading?: boolean;
    error?: string | null;
    refreshing?: boolean;
  } = $props();

  // Local state for sync operations
  let inventoryRefreshing = $state(false);
  let inventoryError = $state<string | null>(null);

  // Internal state for dynamic loading
  let inventoryEvents = $state({ events: claimableEvents, total: 0, page: 1, limit: 50, totalPages: 0 });
  let currentEvents = $derived(inventoryEvents.events);

  // Table columns for claimable events
  const columns = [
    { 
      key: 'eventDate', 
      label: 'Date', 
      sortable: true, 
      width: '120px',
      render: (value: Date) => formatDate(value)
    },
    { key: 'sku', label: 'SKU', sortable: true, width: '150px' },
    { key: 'asin', label: 'ASIN', sortable: true, width: '120px' },
    { 
      key: 'productTitle', 
      label: 'Product Title', 
      sortable: false, 
      width: '300px',
      render: (value: string) => value.length > 50 ? value.substring(0, 50) + '...' : value
    },
    { key: 'eventType', label: 'Event Type', sortable: true, width: '120px' },
    { 
      key: 'fulfillmentCenter', 
      label: 'FC', 
      sortable: true, 
      width: '80px',
      render: (value: string | null) => value || 'N/A'
    },
    { 
      key: 'unreconciledQuantity', 
      label: 'Qty Lost', 
      sortable: true, 
      width: '100px',
      render: (value: number) => Math.abs(value).toString()
    },
    { 
      key: 'status', 
      label: 'Status', 
      sortable: true, 
      width: '100px',
      render: (value: string) => {
        const statusColors = {
          'WAITING': 'bg-yellow-100 text-yellow-800',
          'CLAIMABLE': 'bg-orange-100 text-orange-800',
          'CLAIM_INITIATED': 'bg-blue-100 text-blue-800',
          'CLAIMED': 'bg-green-100 text-green-800',
          'PAID': 'bg-emerald-100 text-emerald-800',
          'INVALID': 'bg-red-100 text-red-800',
          'RESOLVED': 'bg-gray-100 text-gray-800'
        };
        const colorClass = statusColors[value] || 'bg-gray-100 text-gray-800';
        return `<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">${value}</span>`;
      }
    },
    { 
      key: 'actions', 
      label: 'Actions', 
      sortable: false, 
      width: '120px',
      actions: (event: InventoryLedgerEvent) => {
        const actions = [];
        
        // Only show claim text action for claimable events
        if (['CLAIMABLE', 'CLAIM_INITIATED'].includes(event.status)) {
          actions.push({
            label: 'View Claim Text',
            icon: '📋',
            variant: 'primary' as const,
            onClick: () => viewClaimText(event.id),
            disabled: refreshing
          });
        }
        
        // Always show status update action
        actions.push({
          label: 'Update Status',
          icon: '🔄',
          variant: 'secondary' as const,
          onClick: () => updateEventStatus(event.id),
          disabled: refreshing
        });
        
        return actions;
      }
    }
  ];

  // Pagination state
  let currentPage = 1;
  let pageSize = 20;
  const totalPages = $derived(Math.ceil(claimableEvents.length / pageSize));

  // Sorting state
  let sortBy = 'eventDate';
  let sortOrder: 'asc' | 'desc' = 'desc';

  // Filter state - show all statuses by default
  let filters = $state({
    status: [] as string[], // Empty means show all statuses
    eventType: [] as string[],
    fulfillmentCenter: [] as string[],
    dateFrom: null as Date | null,
    dateTo: null as Date | null,
    fnsku: '',
    asin: '',
    sku: ''
  });

  // Sync date range state
  let syncDateRange = $state({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date() // today
  });

  // Claim text modal state
  let showClaimTextModal = $state(false);
  let currentClaimText = $state('');
  let currentClaimEvent = $state(null);
  let claimTextLoading = $state(false);

  // Status update modal state
  let showStatusModal = $state(false);
  let currentEventForStatus = $state(null);
  let statusUpdateLoading = $state(false);
  let newStatus = $state('');
  let statusNotes = $state('');

  // Computed pagination info
  const pagination = $derived({
    page: currentPage,
    limit: pageSize,
    total: claimableEvents.length,
    totalPages: totalPages
  });

  // Computed paginated data
  const paginatedEvents = $derived(claimableEvents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  ));

  // Event handlers
  const dispatch = createEventDispatcher();

  // Load all events when component mounts
  onMount(() => {
    loadInventoryEvents(1, filters);
  });

  function handleRefresh() {
    dispatch('refresh');
  }

  async function loadInventoryEvents(page: number = 1, filters: any = {}) {
    try {
      refreshing = true;
      error = null;

      // Build query parameters
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50'
      });

      // Add status filter if specified
      if (filters.status && filters.status.length > 0) {
        params.append('status', filters.status.join(','));
      }

      // Add other filters
      if (filters.eventType && filters.eventType.length > 0) {
        params.append('eventType', filters.eventType.join(','));
      }

      if (filters.fulfillmentCenter && filters.fulfillmentCenter.length > 0) {
        params.append('fulfillmentCenter', filters.fulfillmentCenter.join(','));
      }

      if (filters.fnsku) {
        params.append('fnsku', filters.fnsku);
      }

      if (filters.asin) {
        params.append('asin', filters.asin);
      }

      if (filters.sku) {
        params.append('sku', filters.sku);
      }

      if (filters.dateFrom) {
        params.append('dateFrom', filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        params.append('dateTo', filters.dateTo.toISOString());
      }

      const response = await fetch(`/api/inventory-ledger?${params.toString()}&cache=no-cache`);
      
      if (!response.ok) {
        throw new Error(`Failed to load inventory events: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load inventory events');
      }

      inventoryEvents = data.data;

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Failed to load inventory events:', err);
    } finally {
      refreshing = false;
    }
  }

  async function handleSyncInventoryLedger() {
    try {
      inventoryRefreshing = true;
      inventoryError = null;

      const response = await fetch('/api/inventory-ledger/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dataStartTime: syncDateRange.startDate.toISOString(),
          dataEndTime: syncDateRange.endDate.toISOString()
        })
      });

      const data = await response.json();

      if (data.success) {
        const result = data.data;
        alert(`Inventory ledger sync completed successfully!\n\nEvents processed: ${result.eventsProcessed || 0}\nNew events: ${result.newEvents || 0}\nUpdated events: ${result.updatedEvents || 0}\n\nDate range: ${syncDateRange.startDate.toLocaleDateString()} - ${syncDateRange.endDate.toLocaleDateString()}`);
        // Refresh the data after successful sync
        handleRefresh();
      } else {
        inventoryError = data.error || 'Failed to sync inventory ledger';
        alert(`Sync failed: ${inventoryError}`);
      }
    } catch (err) {
      inventoryError = err instanceof Error ? err.message : 'Unknown error occurred';
      alert(`Sync error: ${inventoryError}`);
    } finally {
      inventoryRefreshing = false;
    }
  }

  function handleSort(event: CustomEvent<{ sortBy: string; sortOrder: 'asc' | 'desc' }>) {
    sortBy = event.detail.sortBy;
    sortOrder = event.detail.sortOrder;
    dispatch('sort', event.detail);
  }

  function handlePageChange(event: CustomEvent<{ page: number }>) {
    currentPage = event.detail.page;
    loadInventoryEvents(event.detail.page, filters);
  }

  function handleLimitChange(event: CustomEvent<{ limit: number }>) {
    pageSize = event.detail.limit;
    currentPage = 1; // Reset to first page
  }

  function handleFilterChange(event: CustomEvent<{ filters: Record<string, any> }>) {
    const newFilters = event.detail.filters;
    filters.status = newFilters.status || [];
    filters.eventType = newFilters.eventType || [];
    filters.fulfillmentCenter = newFilters.fulfillmentCenter || [];
    filters.dateFrom = newFilters.dateFrom || null;
    filters.dateTo = newFilters.dateTo || null;
    filters.fnsku = newFilters.fnsku || '';
    filters.asin = newFilters.asin || '';
    filters.sku = newFilters.sku || '';
    currentPage = 1; // Reset to first page
    
    // Load data with new filters
    loadInventoryEvents(1, filters);
    
    dispatch('filterChange', event.detail);
  }

  async function viewClaimText(eventId: string) {
    try {
      claimTextLoading = true;
      const response = await fetch(`/api/inventory-ledger/claim-text/${eventId}`);
      const data = await response.json();

      if (data.success) {
        currentClaimText = data.data.claimText;
        currentClaimEvent = data.data.event;
        showClaimTextModal = true;
      } else {
        alert(`Failed to generate claim text: ${data.error}`);
      }
    } catch (err) {
      alert(`Error generating claim text: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      claimTextLoading = false;
    }
  }

  async function updateEventStatus(eventId: string) {
    // Find the event to get current status
    const event = claimableEvents.find(e => e.id === eventId);
    if (!event) return;

    currentEventForStatus = event;
    newStatus = event.status;
    statusNotes = '';
    showStatusModal = true;
  }

  async function submitStatusUpdate() {
    if (!currentEventForStatus || !newStatus) return;

    try {
      statusUpdateLoading = true;
      const response = await fetch(`/api/inventory-ledger/${currentEventForStatus.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus,
          notes: statusNotes
        })
      });

      const data = await response.json();

      if (data.success) {
        showStatusModal = false;
        handleRefresh(); // Refresh data
      } else {
        alert(`Failed to update status: ${data.error}`);
      }
    } catch (err) {
      alert(`Error updating status: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      statusUpdateLoading = false;
    }
  }

  async function copyClaimText() {
    try {
      await navigator.clipboard.writeText(currentClaimText);
      alert('Claim text copied to clipboard!');
    } catch (err) {
      alert('Failed to copy text to clipboard');
    }
  }

  function closeClaimTextModal() {
    showClaimTextModal = false;
    currentClaimText = '';
    currentClaimEvent = null;
  }

  function closeStatusModal() {
    showStatusModal = false;
    currentEventForStatus = null;
    newStatus = '';
    statusNotes = '';
  }

  function formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString();
  }
</script>

<div class="space-y-8">
  <!-- Stats Cards -->
  {#if stats && !loading && !error}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Total Claimable Units -->
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Claimable Units</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.totalClaimableUnits}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <!-- Total Waiting -->
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Waiting</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.totalWaiting}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <!-- Claimable Events Count -->
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Claimable Events</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.claimableEventsCount}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <!-- Total Resolved -->
      <div class="bg-white overflow-hidden shadow rounded-lg">
        <div class="p-5">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div class="ml-5 w-0 flex-1">
              <dl>
                <dt class="text-sm font-medium text-gray-500 truncate">Total Resolved</dt>
                <dd class="text-lg font-medium text-gray-900">{stats.totalResolved}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Sync Actions -->
  <div class="bg-white rounded-lg shadow p-6 mb-8">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-medium text-gray-900">Amazon Inventory Ledger Sync</h3>
        <p class="text-sm text-gray-500 mt-1">
          Fetch and process the latest Amazon Inventory Ledger Report (AIRPA) to detect lost/damaged/missing inventory
        </p>
        <div class="mt-3 text-xs text-gray-400">
          <p><strong>What this does:</strong> Fetches daily inventory events from Amazon, applies business logic to identify potential losses (quantity &lt; 0 AND unreconciled_quantity &gt; 0), and updates event statuses based on age and reconciliation status.</p>
        </div>
      </div>
      <div class="flex flex-col space-y-4">
        <!-- Date Range Selector -->
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <label for="sync-start-date" class="text-sm font-medium text-gray-700">From:</label>
            <input
              id="sync-start-date"
              type="date"
              value={syncDateRange.startDate.toISOString().split('T')[0]}
              oninput={(e) => syncDateRange.startDate = new Date((e.target as HTMLInputElement).value)}
              disabled={inventoryRefreshing}
              class="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div class="flex items-center space-x-2">
            <label for="sync-end-date" class="text-sm font-medium text-gray-700">To:</label>
            <input
              id="sync-end-date"
              type="date"
              value={syncDateRange.endDate.toISOString().split('T')[0]}
              oninput={(e) => syncDateRange.endDate = new Date((e.target as HTMLInputElement).value)}
              disabled={inventoryRefreshing}
              class="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <button
            onclick={() => {
              syncDateRange.startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
              syncDateRange.endDate = new Date();
            }}
            disabled={inventoryRefreshing}
            class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Last 30 days
          </button>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex space-x-3">
          <button
          onclick={handleSyncInventoryLedger}
          disabled={inventoryRefreshing}
          class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {#if inventoryRefreshing}
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Syncing...
          {:else}
            <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Inventory Ledger
          {/if}
        </button>
        <button
          onclick={handleRefresh}
          disabled={inventoryRefreshing}
          class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Data
        </button>
      </div>
    </div>
    
    {#if inventoryError}
      <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Sync Error</h3>
            <p class="text-sm text-red-700 mt-1">{inventoryError}</p>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Filter Bar -->
  <InventoryLedgerFilterBar 
    filters={filters} 
    loading={loading}
    onfilterchange={handleFilterChange}
  />

  <!-- Claimable Events Table -->
  <div class="bg-white shadow rounded-lg">
    <div class="px-4 py-5 sm:p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg leading-6 font-medium text-gray-900">
            All Inventory Events ({inventoryEvents.total || 0})
          </h3>
          <p class="text-sm text-gray-500 mt-1">
            Complete inventory ledger with all events. Use filters to narrow down by status, event type, or fulfillment center.
          </p>
          <div class="mt-2 flex items-center space-x-4 text-sm text-gray-500">
            <span>Showing: {currentEvents.length} of {inventoryEvents.total || 0} events</span>
            <span>Page: {inventoryEvents.page || 1} of {inventoryEvents.totalPages || 1}</span>
          </div>
        </div>
        <button
          onclick={handleRefresh}
          disabled={refreshing}
          class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if refreshing}
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Refreshing...
          {:else}
            <svg class="-ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          {/if}
        </button>
      </div>

      {#if currentEvents.length === 0}
        <div class="text-center py-12">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No inventory events found</h3>
          <p class="mt-1 text-sm text-gray-500">No events match your current filters. Try adjusting the filters or sync new data.</p>
        </div>
      {:else}
        <DataTable
          data={currentEvents}
          columns={columns}
          pagination={{
            page: inventoryEvents.page,
            limit: inventoryEvents.limit,
            total: inventoryEvents.total,
            totalPages: inventoryEvents.totalPages
          }}
          loading={refreshing}
          onsort={handleSort}
          onpagechange={handlePageChange}
          onlimitchange={handleLimitChange}
        />
      {/if}
    </div>
  </div>

  <!-- Claim Text Modal -->
  {#if showClaimTextModal}
    <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900">Generated Claim Text</h3>
            <button 
              onclick={closeClaimTextModal}
              class="text-gray-400 hover:text-gray-600"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {#if currentClaimEvent}
            <div class="mb-4 p-4 bg-gray-50 rounded-lg">
              <h4 class="font-semibold text-gray-700 mb-2">Event Details:</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div><strong>FNSKU:</strong> {currentClaimEvent.fnsku}</div>
                <div><strong>ASIN:</strong> {currentClaimEvent.asin}</div>
                <div><strong>SKU:</strong> {currentClaimEvent.sku}</div>
                <div><strong>Event Type:</strong> {currentClaimEvent.eventType}</div>
                <div><strong>FC:</strong> {currentClaimEvent.fulfillmentCenter || 'N/A'}</div>
                <div><strong>Quantity Lost:</strong> {Math.abs(currentClaimEvent.unreconciledQuantity)}</div>
                <div><strong>Event Date:</strong> {formatDate(currentClaimEvent.eventDate)}</div>
                <div><strong>Status:</strong> <span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">{currentClaimEvent.status}</span></div>
              </div>
            </div>
          {/if}

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Claim Text Template:</label>
            <div class="relative">
              <textarea 
                class="w-full h-40 p-3 border border-gray-300 rounded-md font-mono text-sm"
                readonly
                value={currentClaimText}
              ></textarea>
            </div>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              onclick={closeClaimTextModal}
              class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Close
            </button>
            <button
              onclick={copyClaimText}
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Copy to Clipboard
            </button>
            <button
              onclick={() => {
                // Mark as CLAIM_INITIATED when user submits claim
                if (currentClaimEvent) {
                  newStatus = 'CLAIM_INITIATED';
                  statusNotes = 'Claim text generated and submitted to Amazon';
                  currentEventForStatus = currentClaimEvent;
                  closeClaimTextModal();
                  showStatusModal = true;
                }
              }}
              class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Mark as Claim Submitted
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Status Update Modal -->
  {#if showStatusModal}
    <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900">Update Event Status</h3>
            <button 
              onclick={closeStatusModal}
              class="text-gray-400 hover:text-gray-600"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {#if currentEventForStatus}
            <div class="mb-4 p-4 bg-gray-50 rounded-lg">
              <h4 class="font-semibold text-gray-700 mb-2">Event Details:</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div><strong>FNSKU:</strong> {currentEventForStatus.fnsku}</div>
                <div><strong>ASIN:</strong> {currentEventForStatus.asin}</div>
                <div><strong>Current Status:</strong> <span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">{currentEventForStatus.status}</span></div>
              </div>
            </div>
          {/if}

          <div class="mb-4">
            <label for="status-select" class="block text-sm font-medium text-gray-700 mb-2">New Status:</label>
            <select 
              id="status-select"
              bind:value={newStatus}
              class="w-full p-3 border border-gray-300 rounded-md"
            >
              <option value="WAITING">WAITING</option>
              <option value="CLAIMABLE">CLAIMABLE</option>
              <option value="CLAIM_INITIATED">CLAIM_INITIATED</option>
              <option value="CLAIMED">CLAIMED</option>
              <option value="PAID">PAID</option>
              <option value="INVALID">INVALID</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>

          <div class="mb-4">
            <label for="status-notes" class="block text-sm font-medium text-gray-700 mb-2">Notes (Optional):</label>
            <textarea 
              id="status-notes"
              bind:value={statusNotes}
              placeholder="Add any notes about this status change..."
              class="w-full h-24 p-3 border border-gray-300 rounded-md"
            ></textarea>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              onclick={closeStatusModal}
              class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              disabled={statusUpdateLoading}
            >
              Cancel
            </button>
            <button
              onclick={submitStatusUpdate}
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={statusUpdateLoading}
            >
              {statusUpdateLoading ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
</div>

