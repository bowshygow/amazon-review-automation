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
    if (!column.sortable) return;
    
    if (sortBy === column.key) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column.key;
      sortOrder = 'desc';
    }
    
    dispatch('sort', { sortBy, sortOrder });
  }

  function handlePageChange(page: number) {
    if (page < 1 || page > pagination.totalPages) return;
    dispatch('pageChange', { page });
  }

  function handleLimitChange(limit: number) {
    dispatch('limitChange', { limit });
  }

  function handleFilterChange(filters: Record<string, any>) {
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

<div class="bg-white rounded-lg shadow">
  <!-- Table -->
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          {#each columns as column}
            <th 
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider {column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'}"
              style="width: {column.width || 'auto'}"
            >
              <button
                class="flex items-center space-x-1 hover:text-gray-700 transition-colors {column.sortable ? 'cursor-pointer' : 'cursor-default'}"
                on:click={() => handleSort(column)}
                disabled={!column.sortable}
              >
                <span>{column.label}</span>
                {#if column.sortable}
                  <span class="text-xs">{getSortIcon(column)}</span>
                {/if}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {#if loading}
          <tr>
            <td colspan={columns.length} class="px-6 py-12 text-center">
              <div class="flex justify-center items-center">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span class="ml-2 text-gray-500">Loading...</span>
              </div>
            </td>
          </tr>
        {:else if data.length === 0}
          <tr>
            <td colspan={columns.length} class="px-6 py-12 text-center text-gray-500">
              No data available
            </td>
          </tr>
        {:else}
          {#each data as row, index}
            <tr class="hover:bg-gray-50">
              {#each columns as column}
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 {column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : 'text-left'}">
                  {formatValue(row[column.key], column, row)}
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
    <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
      <div class="flex-1 flex justify-between sm:hidden">
        <button
          on:click={() => handlePageChange(pagination.page - 1)}
          disabled={pagination.page <= 1}
          class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          on:click={() => handlePageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages}
          class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
      <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div>
          <p class="text-sm text-gray-700">
            Showing <span class="font-medium">{startItem}</span> to <span class="font-medium">{endItem}</span> of{' '}
            <span class="font-medium">{pagination.total}</span> results
          </p>
        </div>
        <div>
          <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
            <button
              on:click={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  class="relative inline-flex items-center px-4 py-2 border text-sm font-medium {pageNum === pagination.page ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}"
                >
                  {pageNum}
                </button>
              {/if}
            {/each}
            
            <button
              on:click={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
