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
		OrganizationSelector,
		type AppConfig,
		type PageDefinition,
	} from "@aico/blueprint";
	import runtimeConfig from "./lib/config";
	import { ALL_BOOKING_SCOPES } from "./lib/scopes";
	import UsersPage from "./lib/pages/UsersPage.svelte";
	import BookingsPage from "./lib/pages/BookingsPage.svelte";
	import ConfigPage from "./lib/pages/ConfigPage.svelte";
	import ContentPage from "./lib/pages/ContentPage.svelte";
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
			id: "content",
			title: "Content",
			iconName: "file-pen-line",
			component: ContentPage,
			color: "var(--aico-green-500)",
			description: "Landing copy and blog publishing for the Shady marketing surface.",
			defaultMode: "landing",
			modes: [
				{
					id: "landing",
					title: "Landing",
					iconName: "layout-template",
					description: "Structured editing for the localized landing document.",
					status: "live",
				},
				{
					id: "blog",
					title: "Blog Posts",
					iconName: "notebook-tabs",
					description: "Draft and publish editorial content from a focused surface.",
					status: "live",
				},
			],
		},
		{
			id: "users",
			title: "Users",
			iconName: "users-round",
			component: UsersPage,
			color: "var(--aico-blue-500)",
			description: "Manage bookable teammates, calendar connections, and working hours.",
			defaultMode: "team",
			modes: [
				{
					id: "team",
					title: "Team",
					iconName: "users-round",
					description: "Roster, activation state, and Google Calendar connection health.",
					status: "live",
				},
				{
					id: "availability",
					title: "Availability",
					iconName: "calendar-range",
					description: "Weekly booking windows per teammate from a dedicated planning surface.",
					status: "live",
				},
			],
		},
		{
			id: "bookings",
			title: "Bookings",
			iconName: "calendar-clock",
			component: BookingsPage,
			color: "var(--aico-purple-500)",
			description: "Monitor the live booking pipeline, upcoming calls, and booking history.",
			defaultMode: "upcoming",
			modes: [
				{
					id: "upcoming",
					title: "Upcoming",
					iconName: "calendar-clock",
					description: "Confirmed future calls and quick operational actions.",
					status: "live",
				},
				{
					id: "history",
					title: "History",
					iconName: "history",
					description: "Past completed bookings and visitor context.",
					status: "live",
				},
				{
					id: "cancelled",
					title: "Cancelled",
					iconName: "calendar-x-2",
					description: "Cancelled appointments and their original visitor details.",
					status: "live",
				},
			],
		},
		{
			id: "config",
			title: "Configuration",
			iconName: "settings-2",
			component: ConfigPage,
			color: "var(--aico-amber-500)",
			description: "Shape the widget, intake form, booking rules, and notification behavior.",
			defaultMode: "widget",
			modes: [
				{
					id: "widget",
					title: "Widget",
					iconName: "code-2",
					description: "Public slug and embed installation details.",
					status: "live",
				},
				{
					id: "intake",
					title: "Intake",
					iconName: "list-ordered",
					description: "Visitor fields and booking form structure.",
					status: "live",
				},
				{
					id: "policies",
					title: "Policies",
					iconName: "calendar-range",
					description: "Scheduling rules, buffers, and email confirmation behavior.",
					status: "live",
				},
			],
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

<AuthGate pages={pageDefinitions} config={appConfig} {auth} {authStores} t={t}>
	{#snippet headerActions()}
		<OrganizationSelector />
	{/snippet}
</AuthGate>
