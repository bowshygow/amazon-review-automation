<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { format } from 'date-fns';

  export let data: any[] = [];
  export let columns: DataTableColumn[] = [];
  export let loading = false;
  export let pagination: PaginationInfo = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  };
  export let filters: Record<string, any> = {};
  export let sortBy: string = '';
  export let sortOrder: 'asc' | 'desc' = 'desc';

  const dispatch = createEventDispatcher();

  export interface DataTableColumn {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
    render?: (value: any, row: any) => string;
    align?: 'left' | 'center' | 'right';
  }

  export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }

  function handleSort(column: DataTableColumn) {
    if (!column.sortable || loading) return;
    
    if (sortBy === column.key) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column.key;
      sortOrder = 'desc';
    }
    
    dispatch('sort', { sortBy, sortOrder });
  }

  function handlePageChange(page: number) {
    if (page < 1 || page > pagination.totalPages || loading) return;
    dispatch('pageChange', { page });
  }

  function handleLimitChange(limit: number) {
    if (loading) return;
    dispatch('limitChange', { limit });
  }

  function handleFilterChange(filters: Record<string, any>) {
    if (loading) return;
    dispatch('filterChange', { filters });
  }

  function getSortIcon(column: DataTableColumn) {
    if (!column.sortable) return '';
    if (sortBy !== column.key) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  }

  function formatValue(value: any, column: DataTableColumn, row: any): string {
    if (column.render) {
      return column.render(value, row);
    }
    
    if (value === null || value === undefined) {
      return '-';
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    
    if (typeof value === 'string') {
      // Check if it's a date
      if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
        try {
          return format(new Date(value), 'MMM dd, yyyy');
        } catch {
          return value;
        }
      }
      return value;
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  $: startItem = (pagination.page - 1) * pagination.limit + 1;
  $: endItem = Math.min(pagination.page * pagination.limit, pagination.total);
</script>

<div class="bg-white rounded-lg shadow-lg border border-gray-200 relative">
  <!-- Loading Overlay -->
  {#if loading}
    <div class="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
      <div class="text-center">
        <div class="inline-flex items-center px-4 py-2 font-semibold leading-6 text-blue-600 transition ease-in-out duration-150">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading data...
        </div>
      </div>
    </div>
  {/if}

  <!-- Table -->
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gradient-to-r from-gray-50 to-gray-100">
        <tr>
          {#each columns as column}
            <th 
              class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider {column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'} border-b border-gray-200"
              style="width: {column.width || 'auto'}"
            >
              <button
                class="flex items-center space-x-2 hover:text-blue-600 transition-colors duration-200 {column.sortable && !loading ? 'cursor-pointer' : 'cursor-default'} {loading ? 'opacity-50' : ''}"
                on:click={() => handleSort(column)}
                disabled={!column.sortable || loading}
              >
                <span class="font-medium">{column.label}</span>
                {#if column.sortable}
                  <span class="text-xs transition-transform duration-200 {sortBy === column.key ? 'text-blue-600' : 'text-gray-400'}">
                    {getSortIcon(column)}
                  </span>
                {/if}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-100">
        {#if loading && data.length === 0}
          <tr>
            <td colspan={columns.length} class="px-6 py-16 text-center">
              <div class="flex flex-col items-center justify-center space-y-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span class="text-gray-500 font-medium">Loading data...</span>
              </div>
            </td>
          </tr>
        {:else if data.length === 0}
          <tr>
            <td colspan={columns.length} class="px-6 py-16 text-center">
              <div class="flex flex-col items-center justify-center space-y-3">
                <svg class="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
                <span class="text-gray-500 font-medium">No data available</span>
                <p class="text-gray-400 text-sm">Try adjusting your filters or search criteria</p>
              </div>
            </td>
          </tr>
        {:else}
          {#each data as row, index}
            <tr class="hover:bg-blue-50 transition-colors duration-150 {index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
              {#each columns as column}
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 {column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'} border-b border-gray-100">
                  <div class="flex items-center">
                    {@html formatValue(row[column.key], column, row)}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {#if pagination.totalPages > 1}
    <div class="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 flex items-center justify-between border-t border-gray-200">
      <div class="flex-1 flex justify-between sm:hidden">
        <button
          on:click={() => handlePageChange(pagination.page - 1)}
          disabled={pagination.page <= 1 || loading}
          class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          Previous
        </button>
        <button
          on:click={() => handlePageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages || loading}
          class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          Next
        </button>
      </div>
      <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div>
          <p class="text-sm text-gray-700 font-medium">
            Showing <span class="font-semibold text-blue-600">{startItem}</span> to <span class="font-semibold text-blue-600">{endItem}</span> of{' '}
            <span class="font-semibold text-blue-600">{pagination.total.toLocaleString()}</span> results
          </p>
        </div>
        <div>
          <nav class="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
            <button
              on:click={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              class="relative inline-flex items-center px-3 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <span class="sr-only">Previous</span>
              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </button>
            
            {#each Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const start = Math.max(1, pagination.page - 2);
              const end = Math.min(pagination.totalPages, start + 4);
              return start + i;
            }) as pageNum}
              {#if pageNum <= pagination.totalPages}
                <button
                  on:click={() => handlePageChange(pageNum)}
                  disabled={loading}
                  class="relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors duration-200 {pageNum === pagination.page ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pageNum}
                </button>
              {/if}
            {/each}
            
            <button
              on:click={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
              class="relative inline-flex items-center px-3 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <span class="sr-only">Next</span>
              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  {/if}
</div>
