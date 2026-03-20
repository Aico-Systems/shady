<script lang="ts">
	import { onMount } from "svelte";
	import {
		auth,
		authReady,
		currentOrganization,
		isAuthenticated,
		openAccountSettings,
		user,
		initLogtoAuth,
		MainLayout,
		defineConfig,
		initializeNavigation,
		setNavigationPages,
		ToastContainer,
		type AppConfig,
		type PageDefinition,
	} from "@aico/blueprint";
	import runtimeConfig from "./lib/config";
	import { ALL_BOOKING_SCOPES } from "./lib/scopes";
	import UsersPage from "./lib/pages/UsersPage.svelte";
	import BookingsPage from "./lib/pages/BookingsPage.svelte";
	import ConfigPage from "./lib/pages/ConfigPage.svelte";
	import { t } from "./i18n";

	initLogtoAuth({
		logtoEndpoint: runtimeConfig.LOGTO_ENDPOINT,
		logtoAppId: runtimeConfig.LOGTO_APP_ID,
		logtoApiResource: runtimeConfig.LOGTO_API_RESOURCE,
		apiUrl: runtimeConfig.API_URL,
		autoSignIn: false,
		scopes: [
			"openid",
			"profile",
			"email",
			"organizations",
			"urn:logto:scope:organizations",
			"urn:logto:scope:organization_roles",
			...ALL_BOOKING_SCOPES,
		],
	});

	const authStores = {
		isAuthenticated,
		user,
		authReady,
	};

	// Configure the app using blueprint's structure
	const appConfig: AppConfig = defineConfig({
		app: {
			name: runtimeConfig.APP_NAME,
			description: "Standalone booking-service operations console",
			version: runtimeConfig.APP_VERSION,
		},
		theme: {
			navigationTheme: "dark",
		},
		sidebar: {
			categories: [],
			footerActions: [
				{
					id: "account-settings",
					title: "Account Settings",
					iconName: "user",
					color: "var(--text-secondary)",
					onClick: () => {
						openAccountSettings();
					},
				},
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
		auth: {
			logtoEndpoint: runtimeConfig.LOGTO_ENDPOINT,
			accountCenterEndpoint: runtimeConfig.LOGTO_ACCOUNT_CENTER_ENDPOINT,
			apiUrl: runtimeConfig.API_URL,
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
		setNavigationPages(pageDefinitions);
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
	<MainLayout pages={pageDefinitions} config={appConfig} {auth} {authStores} t={t} />
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
