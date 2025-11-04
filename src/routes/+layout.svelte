<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Menu } from 'lucide-svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Sidebar.Provider class="overflow-x-hidden">
	<AppSidebar />
	<Sidebar.Inset class="min-w-0">
		<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-2 h-4" />
			<div class="flex flex-1 items-center gap-2">
				<h1 class="text-lg font-semibold">Amazon Review Automation</h1>
			</div>
		</header>
		<main class="flex flex-1 flex-col gap-4 p-4 min-w-0 overflow-x-hidden">
			{@render children?.()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
