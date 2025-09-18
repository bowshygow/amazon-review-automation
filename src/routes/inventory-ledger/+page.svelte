<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import DataTable from '$lib/components/DataTable.svelte';
  import type { InventoryLedgerEvent, InventoryLedgerStats } from '$lib/types';
  import type { PageData } from './$types';

  // Props from page data
  let { data }: { data: PageData } = $props();

  // Reactive state
  let stats = $state(data.stats);
  let inventoryEvents = $state(data.inventoryEvents);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let refreshing = $state(false);

  // Extract events array and pagination info
  let claimableEvents = $derived(inventoryEvents.events || []);
  let totalEvents = $derived(inventoryEvents.total || 0);
  let currentPage = $derived(inventoryEvents.page || 1);
  let totalPages = $derived(inventoryEvents.totalPages || 0);

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
            onClick: () => generateClaimText(event.id),
            disabled: refreshing
          });
        }
        
        // Always show status update action
        actions.push({
          label: 'Update Status',
          icon: '🔄',
          variant: 'secondary' as const,
          onClick: () => alert('Status update feature available in the full tab view'),
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

  async function refreshData(page: number = 1) {
    try {
      refreshing = true;
      error = null;

      // Load fresh data with pagination
      const [statsResponse, inventoryResponse] = await Promise.all([
        fetch('/api/inventory-ledger/stats?cache=no-cache'),
        fetch(`/api/inventory-ledger?page=${page}&limit=50&cache=no-cache`)
      ]);

      if (!statsResponse.ok) {
        throw new Error(`Failed to load stats: ${statsResponse.statusText}`);
      }

      if (!inventoryResponse.ok) {
        throw new Error(`Failed to load inventory events: ${inventoryResponse.statusText}`);
      }

      const statsData = await statsResponse.json();
      const inventoryData = await inventoryResponse.json();

      if (!statsData.success) {
        throw new Error(statsData.error || 'Failed to load stats');
      }

      if (!inventoryData.success) {
        throw new Error(inventoryData.error || 'Failed to load inventory events');
      }

      stats = statsData.data;
      inventoryEvents = inventoryData.data;

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Failed to refresh inventory ledger data:', err);
    } finally {
      refreshing = false;
    }
  }

  function handleSort(event: CustomEvent<{ sortBy: string; sortOrder: 'asc' | 'desc' }>) {
    sortBy = event.detail.sortBy;
    sortOrder = event.detail.sortOrder;
    refreshData();
  }

  function handlePageChange(event: CustomEvent<{ page: number }>) {
    refreshData(event.detail.page);
  }

  function handleLimitChange(event: CustomEvent<{ limit: number }>) {
    pageSize = event.detail.limit;
    refreshData(1); // Reset to first page
  }

  async function generateClaimText(eventId: string) {
    try {
      const response = await fetch(`/api/inventory-ledger/claim-text/${eventId}`);
      const data = await response.json();

      if (data.success) {
        // Show the claim text in a modal-like alert
        const claimText = data.data.claimText;
        const eventDetails = data.data.event;
        
        const modalContent = `
Event Details:
- FNSKU: ${eventDetails.fnsku}
- ASIN: ${eventDetails.asin}
- SKU: ${eventDetails.sku}
- Event Type: ${eventDetails.eventType}
- FC: ${eventDetails.fulfillmentCenter || 'N/A'}
- Quantity Lost: ${Math.abs(eventDetails.unreconciledQuantity)}
- Event Date: ${formatDate(eventDetails.eventDate)}
- Status: ${eventDetails.status}

Claim Text Template:
${claimText}

(Text copied to clipboard)
        `;
        
        alert(modalContent);
        
        // Also copy to clipboard
        await navigator.clipboard.writeText(claimText);
      } else {
        alert(`Failed to generate claim text: ${data.error}`);
      }
    } catch (err) {
      alert(`Error generating claim text: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function markAsClaimed(eventId: string) {
    if (!confirm('Are you sure you want to mark this event as claimed?')) {
      return;
    }

    try {
      const response = await fetch(`/api/inventory-ledger/${eventId}/claim`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert('Event marked as claimed successfully!');
        await refreshData(); // Refresh data
      } else {
        alert(`Failed to mark as claimed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error marking as claimed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString();
  }

  function formatQuantity(quantity: number): string {
    return Math.abs(quantity).toString();
  }
</script>

<svelte:head>
  <title>Inventory Ledger - Amazon Review Automation</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Inventory Ledger</h1>
      <p class="mt-2 text-gray-600">
        Monitor lost, damaged, and missing inventory from Amazon Inventory Ledger Report (AIRPA)
      </p>
    </div>

    <!-- Loading State -->
    {#if loading}
      <div class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span class="ml-3 text-gray-600">Loading inventory ledger data...</span>
      </div>
    {/if}

    <!-- Error State -->
    {#if error}
      <div class="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Error loading data</h3>
            <div class="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div class="mt-4">
              <button
                onclick={refreshData}
                class="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Stats Cards -->
    {#if stats && !loading && !error}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

      <!-- Claimable Events Table -->
      <div class="bg-white shadow rounded-lg">
        <div class="px-4 py-5 sm:p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg leading-6 font-medium text-gray-900">
                Claimable Events ({claimableEvents.length})
              </h3>
              <p class="text-sm text-gray-500 mt-1">
                Events that are 7+ days old and still have unreconciled quantities. These are ready for claims.
              </p>
            </div>
            <button
              onclick={refreshData}
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

          {#if claimableEvents.length === 0}
            <div class="text-center py-12">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 class="mt-2 text-sm font-medium text-gray-900">No inventory events</h3>
              <p class="mt-1 text-sm text-gray-500">No inventory events found for the current filters.</p>
            </div>
          {:else}
            <DataTable
              data={claimableEvents}
              columns={columns}
              pagination={{
                page: currentPage,
                limit: 50,
                total: totalEvents,
                totalPages: totalPages
              }}
              loading={refreshing}
              onsort={handleSort}
              onpagechange={handlePageChange}
              onlimitchange={handleLimitChange}
            />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>



