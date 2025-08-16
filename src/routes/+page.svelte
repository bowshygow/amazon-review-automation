<script lang="ts">
  import { onMount } from 'svelte';
  import type { DashboardStats, LegacyAmazonOrder } from '$lib/types';
  import { format } from 'date-fns';

  let stats: DashboardStats | null = null;
  let recentOrders: LegacyAmazonOrder[] = [];
  let loading = true;
  let error = '';
  let automationLoading = false;
  let retryLoading = false;
  let syncLoading = false;

  onMount(async () => {
    await loadDashboardData();
  });

  async function loadDashboardData() {
    try {
      loading = true;
      error = '';

      // Load dashboard stats
      const statsResponse = await fetch('/api/stats');
      const statsResult = await statsResponse.json();
      
      if (statsResult.success && statsResult.data) {
        stats = statsResult.data;
      } else {
        error = statsResult.error || 'Failed to load dashboard stats';
      }

      // Load recent orders
      const ordersResponse = await fetch('/api/orders?page=1&limit=10');
      const ordersResult = await ordersResponse.json();
      
      if (ordersResult.success && ordersResult.data) {
        recentOrders = ordersResult.data;
      }

    } catch (err: any) {
      error = err.message || 'An error occurred';
    } finally {
      loading = false;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'sent': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'skipped': return 'text-yellow-600 bg-yellow-100';
      case 'pending': return 'text-blue-600 bg-blue-100';
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
        alert(`Automation completed successfully!\nProcessed: ${result.processed}\nErrors: ${result.errors.length}`);
        await loadDashboardData(); // Refresh data
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
        alert(`Retry completed successfully!\nRetried: ${result.retried}\nErrors: ${result.errors.length}`);
        await loadDashboardData(); // Refresh data
      } else {
        alert(`Retry failed: ${result.error}`);
      }
    } catch (err: any) {
      alert(`Error retrying requests: ${err.message}`);
    } finally {
      retryLoading = false;
    }
  }

  async function syncOrders() {
    try {
      syncLoading = true;
      const response = await fetch('/api/automation/sync-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ daysBack: 30 })
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`Sync completed successfully!\nSynced: ${result.synced}\nErrors: ${result.errors.length}`);
        await loadDashboardData(); // Refresh data
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
            on:click={loadDashboardData}
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Today's Requests</span>
                <span class="text-sm font-medium">{stats.todayRequests}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">This Week</span>
                <span class="text-sm font-medium">{stats.thisWeekRequests}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">This Month</span>
                <span class="text-sm font-medium">{stats.thisMonthRequests}</span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Order Status</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Returned Orders</span>
                <span class="text-sm font-medium">{stats.returnedOrders}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">Skipped Requests</span>
                <span class="text-sm font-medium">{stats.reviewRequestsSkipped}</span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div class="space-y-3">
              <button 
                on:click={runDailyAutomation}
                disabled={automationLoading}
                class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {automationLoading ? 'Running...' : 'Run Daily Automation'}
              </button>
              <button 
                on:click={retryFailedRequests}
                disabled={retryLoading}
                class="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retryLoading ? 'Retrying...' : 'Retry Failed Requests'}
              </button>
              <button 
                on:click={syncOrders}
                disabled={syncLoading}
                class="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncLoading ? 'Syncing...' : 'Sync Orders'}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Recent Orders -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-medium text-gray-900">Recent Orders</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Date</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Review Request</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each recentOrders as order}
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {order.amazonOrderId}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(order.deliveryDate), 'MMM dd, yyyy')}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(order.orderStatus)}">
                      {order.orderStatus}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    {#if order.reviewRequestStatus}
                      <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full {getStatusColor(order.reviewRequestStatus)}">
                        {order.reviewRequestStatus}
                      </span>
                    {:else}
                      <span class="text-sm text-gray-500">Not sent</span>
                    {/if}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(order.orderTotal.amount, order.orderTotal.currencyCode)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </main>
</div>
