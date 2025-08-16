<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let filters: Record<string, any> = {};
  export let loading = false;

  const dispatch = createEventDispatcher();

  let searchTerm = filters.search || '';
  let statusFilter = filters.status || [];
  let reviewStatusFilter = filters.reviewRequestStatus || [];
  let dateFrom = filters.dateFrom || '';
  let dateTo = filters.dateTo || '';
  let isReturned = filters.isReturned;

  const orderStatuses = [
    { value: 'Pending', label: 'Pending' },
    { value: 'Unshipped', label: 'Unshipped' },
    { value: 'PartiallyShipped', label: 'Partially Shipped' },
    { value: 'Shipped', label: 'Shipped' },
    { value: 'Canceled', label: 'Canceled' },
    { value: 'Unfulfillable', label: 'Unfulfillable' }
  ];

  const reviewStatuses = [
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
    { value: 'skipped', label: 'Skipped' },
    { value: 'pending', label: 'Pending' }
  ];

  function applyFilters() {
    const newFilters: Record<string, any> = {
      search: searchTerm.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      reviewRequestStatus: reviewStatusFilter.length > 0 ? reviewStatusFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      isReturned: isReturned
    };

    // Remove undefined values
    Object.keys(newFilters).forEach(key => {
      if (newFilters[key] === undefined) {
        delete newFilters[key];
      }
    });

    dispatch('filterChange', { filters: newFilters });
  }

  function clearFilters() {
    searchTerm = '';
    statusFilter = [];
    reviewStatusFilter = [];
    dateFrom = '';
    dateTo = '';
    isReturned = undefined;
    
    dispatch('filterChange', { filters: {} });
  }

  function handleStatusChange(value: string, checked: boolean) {
    if (checked) {
      statusFilter = [...statusFilter, value];
    } else {
      statusFilter = statusFilter.filter((s: string) => s !== value);
    }
  }

  function handleReviewStatusChange(value: string, checked: boolean) {
    if (checked) {
      reviewStatusFilter = [...reviewStatusFilter, value];
    } else {
      reviewStatusFilter = reviewStatusFilter.filter((s: string) => s !== value);
    }
  }
</script>

<div class="bg-white rounded-lg shadow p-6 mb-6">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Search -->
    <div>
      <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search</label>
      <input
        id="search"
        type="text"
        bind:value={searchTerm}
        placeholder="Search orders..."
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    <!-- Date Range -->
    <div>
      <label for="dateFrom" class="block text-sm font-medium text-gray-700 mb-1">From Date</label>
      <input
        id="dateFrom"
        type="date"
        bind:value={dateFrom}
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    <div>
      <label for="dateTo" class="block text-sm font-medium text-gray-700 mb-1">To Date</label>
      <input
        id="dateTo"
        type="date"
        bind:value={dateTo}
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    <!-- Returned Filter -->
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">Returned Orders</label>
      <select
        bind:value={isReturned}
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        <option value={undefined}>All Orders</option>
        <option value={true}>Returned Only</option>
        <option value={false}>Not Returned</option>
      </select>
    </div>
  </div>

  <!-- Status Filters -->
  <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Order Status -->
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-2">Order Status</label>
      <div class="grid grid-cols-2 gap-2">
        {#each orderStatuses as status}
          <label class="flex items-center">
            <input
              type="checkbox"
              checked={statusFilter.includes(status.value)}
              on:change={(e) => handleStatusChange(status.value, (e.target as HTMLInputElement).checked)}
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span class="ml-2 text-sm text-gray-700">{status.label}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Review Request Status -->
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-2">Review Request Status</label>
      <div class="grid grid-cols-2 gap-2">
        {#each reviewStatuses as status}
          <label class="flex items-center">
            <input
              type="checkbox"
              checked={reviewStatusFilter.includes(status.value)}
              on:change={(e) => handleReviewStatusChange(status.value, (e.target as HTMLInputElement).checked)}
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span class="ml-2 text-sm text-gray-700">{status.label}</span>
          </label>
        {/each}
      </div>
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="mt-4 flex justify-end space-x-3">
    <button
      on:click={clearFilters}
      class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
    >
      Clear Filters
    </button>
    <button
      on:click={applyFilters}
      disabled={loading}
      class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Applying...' : 'Apply Filters'}
    </button>
  </div>
</div>
