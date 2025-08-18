<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ReviewRequestStatus } from '$lib/types';

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
    { value: ReviewRequestStatus.SENT, label: 'Sent' },
    { value: ReviewRequestStatus.FAILED, label: 'Failed' },
    { value: ReviewRequestStatus.SKIPPED, label: 'Skipped' },
    { value: ReviewRequestStatus.PENDING, label: 'Pending' }
  ];

  function applyFilters() {
    if (loading) return;
    
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
    if (loading) return;
    
    searchTerm = '';
    statusFilter = [];
    reviewStatusFilter = [];
    dateFrom = '';
    dateTo = '';
    isReturned = undefined;
    
    dispatch('filterChange', { filters: {} });
  }

  function handleStatusChange(value: string, checked: boolean) {
    if (loading) return;
    
    if (checked) {
      statusFilter = [...statusFilter, value];
    } else {
      statusFilter = statusFilter.filter((s: string) => s !== value);
    }
  }

  function handleReviewStatusChange(value: string, checked: boolean) {
    if (loading) return;
    
    if (checked) {
      reviewStatusFilter = [...reviewStatusFilter, value];
    } else {
      reviewStatusFilter = reviewStatusFilter.filter((s: string) => s !== value);
    }
  }
</script>

<div class="bg-white rounded-lg shadow-lg border border-gray-200 p-6 mb-6">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Search -->
    <div>
      <label for="search" class="block text-sm font-semibold text-gray-700 mb-2">Search</label>
      <input
        id="search"
        type="text"
        bind:value={searchTerm}
        placeholder="Search orders..."
        disabled={loading}
        class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
      />
    </div>

    <!-- Date Range -->
    <div>
      <label for="dateFrom" class="block text-sm font-semibold text-gray-700 mb-2">From Date</label>
      <input
        id="dateFrom"
        type="date"
        bind:value={dateFrom}
        disabled={loading}
        class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
      />
    </div>

    <div>
      <label for="dateTo" class="block text-sm font-semibold text-gray-700 mb-2">To Date</label>
      <input
        id="dateTo"
        type="date"
        bind:value={dateTo}
        disabled={loading}
        class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
      />
    </div>

    <!-- Returned Filter -->
    <div>
      <label class="block text-sm font-semibold text-gray-700 mb-2">Returned Orders</label>
      <select
        bind:value={isReturned}
        disabled={loading}
        class="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <option value={undefined}>All Orders</option>
        <option value={true}>Returned Only</option>
        <option value={false}>Not Returned</option>
      </select>
    </div>
  </div>

  <!-- Status Filters -->
  <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Order Status -->
    <div class="bg-gray-50 rounded-lg p-4">
      <label class="block text-sm font-semibold text-gray-700 mb-3">Order Status</label>
      <div class="grid grid-cols-2 gap-3">
        {#each orderStatuses as status}
          <label class="flex items-center cursor-pointer {loading ? 'opacity-50 cursor-not-allowed' : ''}">
            <input
              type="checkbox"
              checked={statusFilter.includes(status.value)}
              on:change={(e) => handleStatusChange(status.value, (e.target as HTMLInputElement).checked)}
              disabled={loading}
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="ml-3 text-sm text-gray-700 font-medium">{status.label}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Review Request Status -->
    <div class="bg-gray-50 rounded-lg p-4">
      <label class="block text-sm font-semibold text-gray-700 mb-3">Review Request Status</label>
      <div class="grid grid-cols-2 gap-3">
        {#each reviewStatuses as status}
          <label class="flex items-center cursor-pointer {loading ? 'opacity-50 cursor-not-allowed' : ''}">
            <input
              type="checkbox"
              checked={reviewStatusFilter.includes(status.value)}
              on:change={(e) => handleReviewStatusChange(status.value, (e.target as HTMLInputElement).checked)}
              disabled={loading}
              class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="ml-3 text-sm text-gray-700 font-medium">{status.label}</span>
          </label>
        {/each}
      </div>
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="mt-6 flex justify-end space-x-4">
    <button
      on:click={clearFilters}
      disabled={loading}
      class="px-6 py-3 border border-gray-300 rounded-lg shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Clear Filters
    </button>
    <button
      on:click={applyFilters}
      disabled={loading}
      class="px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
    >
      {#if loading}
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Applying...</span>
      {:else}
        <span>Apply Filters</span>
      {/if}
    </button>
  </div>
</div>
