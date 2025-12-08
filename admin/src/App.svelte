<script lang="ts">
	import { onMount } from "svelte";
	import {
		auth,
		authReady,
		currentOrganization,
		isAuthenticated,
		user,
		initLogtoAuth,
	} from "@aico/blueprint";
	import UsersPage from "./lib/pages/UsersPage.svelte";
	import BookingsPage from "./lib/pages/BookingsPage.svelte";
	import ConfigPage from "./lib/pages/ConfigPage.svelte";
	import { t } from "./i18n";

	import {
		MainLayout,
		defineConfig,
		initializeNavigation,
		setNavigationPages,
		type AppConfig,
		type PageDefinition,
		ToastContainer,
	} from "@aico/blueprint";

	type PageKey = "users" | "bookings" | "config";

	initLogtoAuth({
		logtoEndpoint:
			import.meta.env.VITE_LOGTO_ENDPOINT || "http://localhost:3001",
		logtoAppId: import.meta.env.VITE_LOGTO_APP_ID || "",
		logtoApiResource:
			import.meta.env.VITE_LOGTO_API_RESOURCE ||
			"https://api.booking-service.local",
		apiUrl: import.meta.env.VITE_BACKEND_URL || "http://localhost:5006",
		autoSignIn: false,
	});

	const pages: Record<
		PageKey,
		typeof UsersPage | typeof BookingsPage | typeof ConfigPage
	> = {
		users: UsersPage,
		bookings: BookingsPage,
		config: ConfigPage,
	};

	// Configure the app using blueprint's structure
	const config: AppConfig = defineConfig({
		app: {
			name: "Admin Panel",
			description: "Booking Management",
			version: "1.0.0",
		},
		theme: {
			navigationTheme: "dark",
		},
		sidebar: {
			categories: [],
			footerActions: [
				{
					id: "logout",
					title: "Sign Out",
					iconName: "log-out",
					color: "var(--aico-danger)",
					onClick: () => {
						auth.signOut();
					},
				},
			],
		},
		layout: {
			headerHeight: "60px",
		},
	});

	// Create PageDefinition array for blueprint
	const pageDefinitions: PageDefinition[] = [
		{
			id: "users",
			title: "Users",
			iconName: "users-round",
			component: UsersPage,
			color: "var(--aico-lime)",
		},
		{
			id: "bookings",
			title: "Bookings",
			iconName: "calendar-clock",
			component: BookingsPage,
			color: "var(--aico-mint)",
		},
		{
			id: "config",
			title: "Configuration",
			iconName: "settings-2",
			component: ConfigPage,
			color: "var(--aico-flieder)",
		},
	];

	let loading = $derived(!$authReady);

	onMount(() => {
		auth.init();
		initializeNavigation(pageDefinitions);

		const updateRoute = () => {
			const hash = window.location.hash.slice(1) as PageKey;
			if (hash && hash in pages) {
				// Navigate to the page via blueprint's navigation
				const pageIndex = pageDefinitions.findIndex((p) => p.id === hash);
				if (pageIndex >= 0) {
					setNavigationPages(pageDefinitions);
				}
			}
		};

		updateRoute();
		window.addEventListener("hashchange", updateRoute);

		return () => {
			window.removeEventListener("hashchange", updateRoute);
		};
	});
</script>

<svelte:head>
	<title>{$t("app.meta.title")}</title>
</svelte:head>

{#if loading}
	<section class="full-state">
		<div class="glass-card">
			<div class="spinner"></div>
			<p>{$t("states.initializing")}</p>
		</div>
	</section>
{:else if !$isAuthenticated}
	<section class="full-state">
		<div class="glass-card compact">
			<h1>{$t("auth.title")}</h1>
			<p>{$t("auth.subtitle")}</p>
			<button class="cta" type="button" onclick={() => auth.signIn()}>
				{$t("auth.signIn")}
			</button>
		</div>
	</section>
{:else if !$currentOrganization}
	<section class="full-state">
		<div class="glass-card compact">
			<h1>{$t("states.noOrgTitle")}</h1>
			<p>{$t("states.noOrgSubtitle")}</p>
		</div>
	</section>
{:else}
	<MainLayout pages={pageDefinitions} {config} />
	<ToastContainer />
{/if}

<style>
	.full-state {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2.5rem;
		background:
			radial-gradient(
				circle at top,
				rgba(var(--aico-mint-rgb), 0.18),
				transparent 55%
			),
			linear-gradient(
				135deg,
				var(--aico-color-bg-primary),
				var(--aico-color-bg-secondary)
			);
	}

	.glass-card {
		background: color-mix(
			in srgb,
			var(--aico-color-bg-primary) 92%,
			transparent
		);
		border: 1px solid
			color-mix(in srgb, var(--aico-color-border-light) 70%, transparent);
		border-radius: 28px;
		padding: 2.75rem;
		box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
		text-align: center;
		max-width: 420px;
		width: 100%;
		backdrop-filter: blur(14px);
	}

	.glass-card.compact {
		padding: 2rem;
	}

	.glass-card h1 {
		margin-bottom: 1rem;
		font-size: clamp(1.5rem, 2vw, 2rem);
	}

	.glass-card p {
		color: var(--aico-color-text-secondary);
		margin-bottom: 1.5rem;
	}

	.cta {
		width: 100%;
	}

	.spinner {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		border: 4px solid color-mix(in srgb, var(--aico-grey-400) 40%, transparent);
		border-top-color: var(--aico-mint);
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem auto;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
