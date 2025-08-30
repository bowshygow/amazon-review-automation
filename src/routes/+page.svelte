<script lang="ts">
  import { onMount } from 'svelte';
  import type { DashboardStats, LegacyAmazonOrder } from '$lib/types';
  import type { DataTableAction } from '$lib/components/DataTable.types';
  import DataTable from '$lib/components/DataTable.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import { format } from 'date-fns';

  let stats: DashboardStats | null = null;
  let orders: LegacyAmazonOrder[] = [];
  let loading = true;
  let tableLoading = false;
  let error = '';
  let automationLoading = false;
  let retryLoading = false;
  let syncLoading = false;
  let solicitationLoading: Record<string, boolean> = {};
  let reviewTriggerLoading: Record<string, boolean> = {};
  
  // Pagination and filtering state
  let currentPage = 1;
  let pageSize = 20;
  let totalOrders = 0;
  let totalPages = 0;
  let currentFilters: Record<string, any> = {};
  let sortBy = 'deliveryDate';
  let sortOrder: 'asc' | 'desc' = 'desc';

  onMount(async () => {
    await loadDashboardData();
  });

  async function loadOrders() {
    try {
      tableLoading = true;
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder
      });

      // Add filters to params
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v));
          } else {
            params.append(key, value.toString());
          }
        }
      });

      const ordersResponse = await fetch(`/api/orders?${params.toString()}`);
      const ordersResult = await ordersResponse.json();
      
      if (ordersResult.success && ordersResult.data) {
        orders = ordersResult.data;
        totalOrders = ordersResult.total;
        totalPages = ordersResult.totalPages;
      }
    } catch (err: any) {
      console.error('Error loading orders:', err);
    } finally {
      tableLoading = false;
    }
  }

  async function loadDashboardData() {
    try {
      loading = true;
      tableLoading = true;
      error = '';

      // Load dashboard stats
      const statsResponse = await fetch('/api/stats');
      const statsResult = await statsResponse.json();
      
      if (statsResult.success && statsResult.data) {
        stats = statsResult.data;
      } else {
        error = statsResult.error || 'Failed to load dashboard stats';
      }

      // Load orders with pagination
      await loadOrders();

    } catch (err: any) {
      error = err.message || 'An error occurred';
    } finally {
      loading = false;
      tableLoading = false;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'SENT': return 'text-green-600 bg-green-100';
      case 'FAILED': return 'text-red-600 bg-red-100';
      case 'SKIPPED': return 'text-yellow-600 bg-yellow-100';
      case 'PENDING': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }

  function formatCurrency(amount: string, currency: string) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(parseFloat(amount));
  }

  async function runDailyAutomation() {
    try {
      automationLoading = true;
      const response = await fetch('/api/automation/run-daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Automation completed successfully!\n\nProcessed: ${result.processed}\nSent: ${result.sent}\nFailed: ${result.failed}\nSkipped: ${result.skipped}`);
        await loadDashboardData(); // Refresh data
        await loadOrders(); // Refresh orders
      } else {
        alert(`Automation failed: ${result.error}`);
      }
    } catch (err: any) {
      alert(`Error running automation: ${err.message}`);
    } finally {
      automationLoading = false;
    }
  }

  async function retryFailedRequests() {
    try {
      retryLoading = true;
      const response = await fetch('/api/automation/retry-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Retry completed successfully!\n\nRetried: ${result.retried}\nSuccessful: ${result.successCount}`);
        await loadDashboardData(); // Refresh data
        await loadOrders(); // Refresh orders
      } else {
        alert(`Retry failed: ${result.error}`);
      }
    } catch (err: any) {
      alert(`Error retrying requests: ${err.message}`);
    } finally {
      retryLoading = false;
    }
  }

  async function checkSolicitationActions(orderId: string) {
    try {
      solicitationLoading[orderId] = true;
      
      const response = await fetch(`/api/orders/check-solicitation?orderId=${orderId}`);
      const result = await response.json();
      
      if (result.success) {
        // Update the order in the local state
        orders = orders.map(order => {
          if (order.amazonOrderId === orderId) {
            return {
              ...order,
              hasSolicitationActions: result.data.hasActions,
              solicitationActions: result.data.actions || []
            };
          }
          return order;
        });
        
        // Show success message
        if (result.data.hasActions) {
          console.log(`Order ${orderId} is eligible for review requests`);
        } else {
          console.log(`Order ${orderId} is not eligible for review requests`);
        }
      } else {
        console.error('Failed to check solicitation actions:', result.error);
        alert(`Failed to check solicitation actions: ${result.error}`);
      }
    } catch (error) {
      console.error('Error checking solicitation actions:', error);
      alert('Error checking solicitation actions. Please try again.');
    } finally {
      solicitationLoading[orderId] = false;
    }
  }

  async function triggerReviewRequest(orderId: string) {
    try {
      reviewTriggerLoading[orderId] = true;
      
      const response = await fetch('/api/orders/trigger-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update the order in the local state
        orders = orders.map(order => {
          if (order.amazonOrderId === orderId) {
            return {
              ...order,
              reviewRequestSent: true,
              reviewRequestDate: new Date().toISOString(),
              reviewRequestStatus: 'SENT'
            };
          }
          return order;
        });
        
        // Reload dashboard data to update stats
        await loadDashboardData();
        
        // Show success message
        alert(`Review request sent successfully for order ${orderId}!`);
      } else {
        console.error('Failed to trigger review request:', result.error);
        alert(`Failed to trigger review request: ${result.error}`);
      }
    } catch (error) {
      console.error('Error triggering review request:', error);
      alert('Error triggering review request. Please try again.');
    } finally {
      reviewTriggerLoading[orderId] = false;
    }
  }

  async function syncOrders() {
    try {
      syncLoading = true;
      const response = await fetch('/api/orders/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ daysBack: 30 })
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Sync completed successfully!\n\nExisting Orders: ${result.existingOrders}\nNew Orders: ${result.newOrders}\nUpdated Orders: ${result.updatedOrders}\nErrors: ${result.errors}\n\nTotal Processed: ${result.totalProcessed}`);
        await loadDashboardData(); // Refresh data
        await loadOrders(); // Refresh orders
      } else {
        alert(`Sync failed: ${result.error}`);
      }
    } catch (err: any) {
      alert(`Error syncing orders: ${err.message}`);
    } finally {
      syncLoading = false;
    }
  }


</script>

<svelte:head>
  <title>Amazon Review Automation - Dashboard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-6">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Amazon Review Automation</h1>
          <p class="text-gray-600">Automated review requests for Amazon orders</p>
        </div>
        <div class="flex space-x-4">
          <button 
            on:click={async () => {
              await loadDashboardData();
              await loadOrders();
            }}
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {#if loading}
      <div class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    {:else if error}
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Error</h3>
            <p class="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    {:else}
      <!-- Stats Grid -->
      {#if stats}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <!-- Total Orders -->
          <div class="bg-white rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">Total Orders</p>
                <p class="text-2xl font-semibold text-gray-900">{stats.totalOrders}</p>
              </div>
            </div>
          </div>

          <!-- Eligible for Review -->
          <div class="bg-white rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">Eligible for Review</p>
                <p class="text-2xl font-semibold text-gray-900">{stats.eligibleForReview}</p>
              </div>
            </div>
          </div>

          <!-- Review Requests Sent -->
          <div class="bg-white rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">Requests Sent</p>
                <p class="text-2xl font-semibold text-gray-900">{stats.reviewRequestsSent}</p>
              </div>
            </div>
          </div>

          <!-- Failed Requests -->
          <div class="bg-white rounded-lg shadow p-6">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">Failed Requests</p>
                <p class="text-2xl font-semibold text-gray-900">{stats.reviewRequestsFailed}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Additional Stats -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Review Request Status</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Pending Review Requests</span>
                <span class="text-sm font-medium text-blue-600">{stats.pendingReviewRequests}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Review Requests Sent</span>
                <span class="text-sm font-medium text-green-600">{stats.reviewRequestsSent}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Failed Review Requests</span>
                <span class="text-sm font-medium text-red-600">{stats.reviewRequestsFailed}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Skipped Review Requests</span>
                <span class="text-sm font-medium text-yellow-600">{stats.reviewRequestsSkipped}</span>
              </div>
            </div>
            <div class="mt-4 p-3 bg-blue-50 rounded-lg">
              <p class="text-xs text-blue-700">
                <strong>Pending Review Requests:</strong> Orders that are eligible for review requests but haven't been processed yet (delivered 25+ days ago, not returned, shipped status)
              </p>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Order Summary</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Total Orders</span>
                <span class="text-sm font-medium text-gray-900">{stats.totalOrders}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Returned Orders</span>
                <span class="text-sm font-medium text-red-600">{stats.returnedOrders}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Ineligible for Review</span>
                <span class="text-sm font-medium text-gray-600">{stats.ineligibleForReview}</span>
              </div>
              <div class="flex justify-between border-t pt-2">
                <span class="text-sm font-medium text-gray-700">Review-Eligible Orders</span>
                <span class="text-sm font-medium text-green-700">{stats.eligibleForReview}</span>
              </div>
            </div>
            <div class="mt-4 p-3 bg-gray-50 rounded-lg">
              <p class="text-xs text-gray-600">
                <strong>Total Orders =</strong> Returned + Ineligible + Review-Eligible
              </p>
              <p class="text-xs text-gray-600 mt-1">
                <strong>Calculation:</strong> {stats.returnedOrders} + {stats.ineligibleForReview} + {stats.eligibleForReview} = {stats.returnedOrders + stats.ineligibleForReview + stats.eligibleForReview}
              </p>
              <p class="text-xs text-gray-600 mt-1">
                <strong>Total in DB:</strong> {stats.totalOrders} | <strong>Match:</strong> {stats.totalOrders === (stats.returnedOrders + stats.ineligibleForReview + stats.eligibleForReview) ? '✅' : '❌'}
              </p>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white rounded-lg shadow p-6 mb-8">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button 
              on:click={runDailyAutomation}
              disabled={automationLoading}
              class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {automationLoading ? 'Running...' : 'Run Daily Automation'}
            </button>
            <button 
              on:click={retryFailedRequests}
              disabled={retryLoading}
              class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retryLoading ? 'Retrying...' : 'Retry Failed Requests'}
            </button>
            <button 
              on:click={syncOrders}
              disabled={syncLoading}
              class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncLoading ? 'Syncing...' : 'Sync Orders'}
            </button>
          </div>
        </div>
      {/if}

      <!-- Orders Table -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-medium text-gray-900">Orders</h2>
        </div>
        
        <!-- Filter Bar -->
        <FilterBar 
          filters={currentFilters} 
          loading={tableLoading}
          on:filterChange={async (event) => {
            currentFilters = event.detail.filters;
            currentPage = 1;
            await loadOrders();
          }}
        />
        
        <!-- Data Table -->
        <DataTable
          data={orders}
          columns={[
            {
              key: 'amazonOrderId',
              label: 'Order ID',
              sortable: true,
              width: '200px'
            },
            {
              key: 'purchaseDate',
              label: 'Purchase Date',
              sortable: true,
              width: '150px',
              render: (value) => value ? format(new Date(value), 'MMM dd, yyyy') : '—'
            },
            {
              key: 'deliveryDate',
              label: 'Delivery Date',
              sortable: true,
              width: '150px',
              render: (value) => value ? format(new Date(value), 'MMM dd, yyyy') : '—'
            },
            {
              key: 'orderStatus',
              label: 'Status',
              sortable: true,
              width: '120px',
              render: (value) => {
                const colorClass = getStatusColor(value);
                return `<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">${value}</span>`;
              }
            },
            {
              key: 'reviewRequestStatus',
              label: 'Review Request',
              sortable: true,
              width: '140px',
              render: (value, row) => {
                if (value) {
                  const colorClass = getStatusColor(value);
                  return `<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass}">${value}</span>`;
                }
                return 'Not sent';
              }
            },
            {
              key: 'orderTotal',
              label: 'Total',
              sortable: true,
              width: '120px',
              align: 'right',
              render: (value) => formatCurrency(value.amount, value.currencyCode)
            },
            {
              key: 'solicitationActions',
              label: 'Actions',
              width: '200px',
              align: 'center',
              actions: (row) => {
                const actions = [];
                
                // Check if we need to check solicitation actions
                if (row.hasSolicitationActions === undefined) {
                  actions.push({
                    label: 'Check Actions',
                    icon: '🔍',
                    onClick: () => checkSolicitationActions(row.amazonOrderId),
                    disabled: solicitationLoading[row.amazonOrderId] || false,
                    variant: 'secondary' as const
                  });
                } else if (row.hasSolicitationActions && !row.reviewRequestSent) {
                  // Show trigger review button if actions are available and review not sent
                  actions.push({
                    label: 'Trigger Review',
                    icon: '⭐',
                    onClick: () => triggerReviewRequest(row.amazonOrderId),
                    disabled: reviewTriggerLoading[row.amazonOrderId] || false,
                    variant: 'success' as const
                  });
                } else if (row.hasSolicitationActions === false) {
                  // Show not available message
                  actions.push({
                    label: 'Not Available',
                    icon: '❌',
                    onClick: () => {},
                    disabled: true,
                    variant: 'secondary' as const
                  });
                } else if (row.reviewRequestSent) {
                  // Show already sent message
                  actions.push({
                    label: 'Already Sent',
                    icon: '✅',
                    onClick: () => {},
                    disabled: true,
                    variant: 'primary' as const
                  });
                }
                
                return actions;
              }
            }
          ]}
          loading={tableLoading}
          pagination={{
            page: currentPage,
            limit: pageSize,
            total: totalOrders,
            totalPages: totalPages
          }}
          filters={currentFilters}
          {sortBy}
          {sortOrder}
          on:sort={async (event) => {
            sortBy = event.detail.sortBy;
            sortOrder = event.detail.sortOrder;
            await loadOrders();
          }}
          on:pageChange={async (event) => {
            currentPage = event.detail.page;
            await loadOrders();
          }}
        />
      </div>
    {/if}
  </main>
</div>
