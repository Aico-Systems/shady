<script lang="ts">
	import { onMount } from "svelte";
	import {
		auth,
		authReady,
		isAuthenticated,
		openAccountSettings,
		user,
		initLogtoAuth,
		AuthGate,
		defineConfig,
		initializeNavigation,
		setNavigationPages,
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
			color: "var(--aico-cyan-500)",
		},
		{
			id: "bookings",
			title: "Bookings",
			iconName: "calendar-clock",
			component: BookingsPage,
			color: "var(--aico-teal-500)",
		},
		{
			id: "config",
			title: "Configuration",
			iconName: "settings-2",
			component: ConfigPage,
			color: "var(--aico-blue-500)",
		},
	];

	onMount(() => {
		initializeNavigation(pageDefinitions);
		setNavigationPages(pageDefinitions);
	});
</script>

<svelte:head>
	<title>{$t("app.meta.title")}</title>
</svelte:head>

<AuthGate pages={pageDefinitions} config={appConfig} {auth} {authStores} t={t} />
