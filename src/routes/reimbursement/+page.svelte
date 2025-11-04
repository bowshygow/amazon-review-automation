<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import {
		DollarSign,
		Package,
		TrendingUp,
		AlertCircle,
		CheckCircle,
		Clock,
		RefreshCw,
		Download,
		Search,
		Filter,
		Calendar,
		FileText
	} from 'lucide-svelte';
	import { format } from 'date-fns';

	export const data: any = undefined;

	// Data state
	let stats: any[] = [];
	let items: any[] = [];
	let filteredItems: any[] = [];
	let loading = false;
	let syncing = false;
	let syncError = '';
	let syncSuccess = false;
	let syncResult: any = null;

	// Filter state
	let filterCategory = 'ALL';
	let filterStatus = 'ALL';
	let searchQuery = '';
	let activeTab = 'overview';

	// Date range for sync
	let customDateRange = false;
	let startDate = '';
	let endDate = '';

	// Category labels and colors
	const categoryLabels: Record<string, string> = {
		ALL: 'All Categories',
		LOST_WAREHOUSE: 'Lost in Warehouse',
		DAMAGED_WAREHOUSE: 'Damaged in Warehouse',
		CUSTOMER_RETURN_NOT_RECEIVED: 'Lost Customer Return',
		CUSTOMER_RETURN_DAMAGED: 'Damaged Customer Return',
		RECOVERED: 'Already Recovered'
	};

	const statusLabels: Record<string, string> = {
		ALL: 'All Statuses',
		CLAIMABLE: 'Claimable (Ready to Submit)',
		PENDING: 'Pending Analysis',
		CLAIMED: 'Claimed (Submitted)',
		REIMBURSED: 'Reimbursed (Paid)',
		DENIED: 'Denied by Amazon'
	};

	onMount(async () => {
		await loadReimbursementData();
	});

	async function loadReimbursementData() {
		try {
			loading = true;
			syncError = '';

			// Load stats
			const statsResponse = await fetch('/api/reimbursement/stats');
			const statsResult = await statsResponse.json();

			if (statsResult.success) {
				stats = statsResult.stats || [];
			}

			// Load items
			const itemsResponse = await fetch('/api/reimbursement/items');
			const itemsResult = await itemsResponse.json();

			if (itemsResult.success) {
				items = itemsResult.items || [];
				applyFilters();
			}
		} catch (error) {
			console.error('Error loading reimbursement data:', error);
			syncError = 'Failed to load reimbursement data';
		} finally {
			loading = false;
		}
	}

	function applyFilters() {
		filteredItems = items.filter((item) => {
			// Category filter
			if (filterCategory !== 'ALL' && item.category !== filterCategory) {
				return false;
			}

			// Status filter
			if (filterStatus !== 'ALL' && item.status !== filterStatus) {
				return false;
			}

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			return (
				item.fnsku?.toLowerCase().includes(query) ||
				item.asin?.toLowerCase().includes(query) ||
				item.productName?.toLowerCase().includes(query) ||
				item.productTitle?.toLowerCase().includes(query) ||
				item.reason?.toLowerCase().includes(query)
			);
		}

			return true;
		});
	}

	function getCategoryBadge(category: string): { variant: 'destructive' | 'secondary' | 'outline' | 'default', class: string } {
		switch (category) {
			case 'LOST_WAREHOUSE':
				return { variant: 'destructive', class: 'bg-red-100 text-red-800' };
			case 'DAMAGED_WAREHOUSE':
				return { variant: 'secondary', class: 'bg-orange-100 text-orange-800' };
			case 'CUSTOMER_RETURN_NOT_RECEIVED':
				return { variant: 'outline', class: 'bg-yellow-100 text-yellow-800' };
			case 'CUSTOMER_RETURN_DAMAGED':
				return { variant: 'secondary', class: 'bg-purple-100 text-purple-800' };
			case 'RECOVERED':
				return { variant: 'default', class: 'bg-green-100 text-green-800' };
			default:
				return { variant: 'outline', class: 'bg-gray-100 text-gray-800' };
		}
	}

	function getStatusBadge(status: string): { variant: 'destructive' | 'secondary' | 'outline' | 'default', icon: any, class?: string } {
		switch (status) {
			case 'CLAIMABLE':
				return { variant: 'default', icon: CheckCircle };
			case 'PENDING':
				return { variant: 'outline', icon: Clock };
			case 'CLAIMED':
				return { variant: 'secondary', icon: FileText };
			case 'REIMBURSED':
				return { variant: 'default', icon: CheckCircle, class: 'bg-green-100 text-green-800' };
			case 'DENIED':
				return { variant: 'destructive', icon: AlertCircle };
			default:
				return { variant: 'outline', icon: Clock };
		}
	}

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}

	async function syncReimbursementData() {
		try {
			syncing = true;
			syncError = '';
			syncSuccess = false;

			const body: any = {};
			if (customDateRange && startDate && endDate) {
				body.startDate = startDate;
				body.endDate = endDate;
			}

			const response = await fetch('/api/reimbursement/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await response.json();

			if (result.success) {
				syncSuccess = true;
				syncResult = result;
				await loadReimbursementData();
			} else {
				syncError = result.error || 'Sync failed';
			}
		} catch (error) {
			console.error('Sync error:', error);
			syncError = 'Network error during sync';
		} finally {
			syncing = false;
		}
	}

	function handleSearch() {
		applyFilters();
	}

	function handleFilterChange() {
		applyFilters();
	}

	// Calculate totals
	$: totalValue = filteredItems.reduce((sum, item) => sum + (item.reimbursementAmount || 0), 0);
	$: claimableItems = items.filter(item => item.status === 'CLAIMABLE');
	$: claimableValue = claimableItems.reduce((sum, item) => sum + (item.reimbursementAmount || 0), 0);
	$: reimbursedItems = items.filter(item => item.status === 'REIMBURSED');
	$: reimbursedValue = reimbursedItems.reduce((sum, item) => sum + (item.reimbursementAmount || 0), 0);
</script>

<svelte:head>
	<title>Reimbursements - Amazon Review Automation</title>
</svelte:head>

<div class="space-y-6 w-full max-w-full overflow-x-hidden">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Reimbursements</h1>
			<p class="text-muted-foreground">
				Track and manage Amazon FBA reimbursement claims
			</p>
		</div>
		<div class="flex items-center gap-2 flex-shrink-0">
			<Button onclick={loadReimbursementData} disabled={loading} variant="outline" class="gap-2">
				<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
				Refresh
			</Button>
			<Button onclick={syncReimbursementData} disabled={syncing} class="gap-2">
				<RefreshCw class="h-4 w-4 {syncing ? 'animate-spin' : ''}" />
				{syncing ? 'Syncing...' : 'Sync Data'}
			</Button>
		</div>
	</div>

	<!-- Sync Status -->
	{#if syncError}
		<Card.Root class="border-destructive">
			<Card.Content class="pt-6">
				<div class="flex items-center gap-2 text-destructive">
					<AlertCircle class="h-5 w-5" />
					<span class="font-medium">Sync Error</span>
				</div>
				<p class="text-sm text-muted-foreground mt-2">{syncError}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if syncSuccess && syncResult}
		<Card.Root class="border-green-200 bg-green-50">
			<Card.Content class="pt-6">
				<div class="flex items-center gap-2 text-green-800">
					<CheckCircle class="h-5 w-5" />
					<span class="font-medium">Sync Completed Successfully</span>
				</div>
				<p class="text-sm text-green-700 mt-2">
					Processed {syncResult.totalProcessed} items, found {syncResult.newItems} new items
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Stats Overview -->
	<div class="grid gap-4 md:grid-cols-4">
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Total Items</Card.Title>
				<Package class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				{#if loading}
					<Skeleton class="h-8 w-20" />
				{:else}
					<div class="text-2xl font-bold">{items.length.toLocaleString()}</div>
					<p class="text-xs text-muted-foreground">All reimbursement items</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Claimable Value</Card.Title>
				<DollarSign class="h-4 w-4 text-green-500" />
			</Card.Header>
			<Card.Content>
				{#if loading}
					<Skeleton class="h-8 w-20" />
				{:else}
					<div class="text-2xl font-bold text-green-600">{formatCurrency(claimableValue)}</div>
					<p class="text-xs text-muted-foreground">{claimableItems.length} items ready</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Reimbursed</Card.Title>
				<CheckCircle class="h-4 w-4 text-green-500" />
			</Card.Header>
			<Card.Content>
				{#if loading}
					<Skeleton class="h-8 w-20" />
				{:else}
					<div class="text-2xl font-bold">{formatCurrency(reimbursedValue)}</div>
					<p class="text-xs text-muted-foreground">{reimbursedItems.length} items paid</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Success Rate</Card.Title>
				<TrendingUp class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				{#if loading}
					<Skeleton class="h-8 w-20" />
				{:else}
					<div class="text-2xl font-bold">
						{items.length > 0 ? ((reimbursedItems.length / items.length) * 100).toFixed(1) : 0}%
					</div>
					<p class="text-xs text-muted-foreground">Reimbursement rate</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Main Content -->
	<Tabs.Root bind:value={activeTab} class="space-y-4">
		<Tabs.List>
			<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
			<Tabs.Trigger value="items">Items</Tabs.Trigger>
			<Tabs.Trigger value="categories">Categories</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="overview" class="space-y-4">
			<!-- Category Breakdown -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Category Breakdown</Card.Title>
					<Card.Description>Reimbursement items by category</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if loading}
						<div class="space-y-2">
							{#each Array(5) as _}
								<Skeleton class="h-8 w-full" />
							{/each}
						</div>
					{:else}
						<div class="space-y-3">
							{#each Object.entries(categoryLabels) as [category, label]}
								{@const categoryItems = items.filter(item => category === 'ALL' || item.category === category)}
								{@const categoryValue = categoryItems.reduce((sum, item) => sum + (item.reimbursementAmount || 0), 0)}
								{#if categoryItems.length > 0}
									{@const badgeInfo = getCategoryBadge(category)}
									<div class="flex items-center justify-between p-3 rounded-lg border">
										<div class="flex items-center gap-3">
											<Badge variant={badgeInfo.variant} class={badgeInfo.class}>
												{label}
											</Badge>
											<span class="text-sm text-muted-foreground">
												{categoryItems.length} items
											</span>
										</div>
										<div class="text-right">
											<div class="font-medium">{formatCurrency(categoryValue)}</div>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="items" class="space-y-4">
			<!-- Filters -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Filters</Card.Title>
				</Card.Header>
				<Card.Content>
				<div class="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
					<div class="space-y-2">
						<label for="search-input" class="text-sm font-medium">Search</label>
						<div class="relative">
							<Search class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							id="search-input"
							placeholder="Search items..."
							bind:value={searchQuery}
							oninput={handleSearch}
							class="pl-8"
						/>
						</div>
					</div>
					<div class="space-y-2">
						<label for="category-select" class="text-sm font-medium">Category</label>
						<select
							id="category-select"
							bind:value={filterCategory}
							onchange={handleFilterChange}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each Object.entries(categoryLabels) as [value, label]}
								<option {value}>{label}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<label for="status-select" class="text-sm font-medium">Status</label>
						<select
							id="status-select"
							bind:value={filterStatus}
							onchange={handleFilterChange}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each Object.entries(statusLabels) as [value, label]}
								<option {value}>{label}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<div class="text-sm font-medium">Results</div>
						<div class="text-sm text-muted-foreground pt-2">
							{filteredItems.length} of {items.length} items
						</div>
					</div>
				</div>
				</Card.Content>
			</Card.Root>

			<!-- Items Table -->
			<Card.Root class="w-full overflow-hidden">
				<Card.Header>
					<Card.Title>Reimbursement Items</Card.Title>
					<Card.Description>
						Showing {filteredItems.length} items • Total value: {formatCurrency(totalValue)}
					</Card.Description>
				</Card.Header>
				<Card.Content class="p-0 overflow-x-auto max-w-full">
					{#if loading}
						<div class="space-y-2 p-6">
							{#each Array(10) as _}
								<Skeleton class="h-12 w-full" />
							{/each}
						</div>
					{:else if filteredItems.length > 0}
						<div class="px-6 pb-6">
							<Table.Root class="w-full min-w-[1000px]">
								<Table.Header>
									<Table.Row>
										<Table.Head>Product</Table.Head>
										<Table.Head>Category</Table.Head>
										<Table.Head>Status</Table.Head>
										<Table.Head>Amount</Table.Head>
										<Table.Head>Date</Table.Head>
										<Table.Head>Actions</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each filteredItems as item}
										<Table.Row>
											<Table.Cell>
												<div class="space-y-1">
													<div class="font-medium text-sm">
														{item.productName || item.productTitle || 'Unknown Product'}
													</div>
													<div class="text-xs text-muted-foreground">
														FNSKU: {item.fnsku} • ASIN: {item.asin}
													</div>
												</div>
											</Table.Cell>
											<Table.Cell>
												{@const badgeInfo = getCategoryBadge(item.category)}
												<Badge variant={badgeInfo.variant} class={badgeInfo.class}>
													{categoryLabels[item.category] || item.category}
												</Badge>
											</Table.Cell>
											<Table.Cell>
												{@const statusInfo = getStatusBadge(item.status)}
												<Badge variant={statusInfo.variant} class="gap-1 {statusInfo.class || ''}">
													<svelte:component this={statusInfo.icon} class="h-3 w-3" />
													{item.status}
												</Badge>
											</Table.Cell>
											<Table.Cell class="font-medium">
												{formatCurrency(item.reimbursementAmount || 0)}
											</Table.Cell>
											<Table.Cell class="text-sm text-muted-foreground">
												{item.eventDate ? format(new Date(item.eventDate), 'MMM dd, yyyy') : 'N/A'}
											</Table.Cell>
											<Table.Cell>
												{#if item.status === 'CLAIMABLE'}
													<Button size="sm" class="gap-1">
														<FileText class="h-3 w-3" />
														Claim
													</Button>
												{:else}
													<Button size="sm" variant="outline" disabled>
														View
													</Button>
												{/if}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					{:else}
						<div class="text-center py-8">
							<Package class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
							<h3 class="text-lg font-medium">No items found</h3>
							<p class="text-muted-foreground">Try adjusting your filters or sync new data.</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="categories" class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>Category Statistics</Card.Title>
					<Card.Description>Detailed breakdown by reimbursement category</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if stats.length > 0}
						<div class="grid gap-4 md:grid-cols-2">
							{#each stats as stat}
								<Card.Root>
									<Card.Header class="pb-3">
										<Card.Title class="text-base">
											{categoryLabels[stat.category] || stat.category}
										</Card.Title>
									</Card.Header>
									<Card.Content>
										<div class="space-y-2">
											<div class="flex justify-between">
												<span class="text-sm text-muted-foreground">Total Items:</span>
												<span class="font-medium">{stat.totalItems}</span>
											</div>
											<div class="flex justify-between">
												<span class="text-sm text-muted-foreground">Total Value:</span>
												<span class="font-medium">{formatCurrency(stat.totalValue)}</span>
											</div>
											<div class="flex justify-between">
												<span class="text-sm text-muted-foreground">Avg Value:</span>
												<span class="font-medium">{formatCurrency(stat.avgValue)}</span>
											</div>
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8">
							<TrendingUp class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
							<h3 class="text-lg font-medium">No statistics available</h3>
							<p class="text-muted-foreground">Sync data to see category statistics.</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>