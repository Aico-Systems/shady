declare global {
	interface Window {
		__ENV__?: Record<string, string | undefined>;
	}
}

type RuntimeKey =
	| "VITE_LOGTO_ENDPOINT"
	| "VITE_LOGTO_ACCOUNT_CENTER_ENDPOINT"
	| "VITE_LOGTO_APP_ID"
	| "VITE_LOGTO_API_RESOURCE"
	| "VITE_BACKEND_URL"
	| "VITE_WIDGET_URL"
	| "VITE_AICO_API_URL";

function readRuntimeValue(key: RuntimeKey): string | undefined {
	if (typeof window !== "undefined" && window.__ENV__?.[key]) {
		return window.__ENV__[key];
	}

	const value = import.meta.env[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getRequiredConfig(key: Exclude<RuntimeKey, "VITE_LOGTO_ACCOUNT_CENTER_ENDPOINT" | "VITE_WIDGET_URL" | "VITE_AICO_API_URL">): string {
	const value = readRuntimeValue(key);
	if (!value) {
		throw new Error(`Required configuration missing: ${key}`);
	}
	return value;
}

const LOGTO_ENDPOINT = getRequiredConfig("VITE_LOGTO_ENDPOINT");
const LOGTO_ACCOUNT_CENTER_ENDPOINT =
	readRuntimeValue("VITE_LOGTO_ACCOUNT_CENTER_ENDPOINT") || undefined;
const LOGTO_APP_ID = getRequiredConfig("VITE_LOGTO_APP_ID");
const LOGTO_API_RESOURCE = getRequiredConfig("VITE_LOGTO_API_RESOURCE");
const API_URL = getRequiredConfig("VITE_BACKEND_URL");
const WIDGET_URL =
	readRuntimeValue("VITE_WIDGET_URL") || "http://localhost:5178";
const AICO_API_URL =
	readRuntimeValue("VITE_AICO_API_URL") || "http://localhost:5005";

const apiUrl = new URL(API_URL);

const config = {
	LOGTO_ENDPOINT,
	LOGTO_ACCOUNT_CENTER_ENDPOINT,
	LOGTO_APP_ID,
	LOGTO_API_RESOURCE,
	API_URL,
	WIDGET_URL,
	AICO_API_URL,
	BACKEND_HOST: apiUrl.hostname,
	BACKEND_PORT:
		parseInt(apiUrl.port, 10) || (apiUrl.protocol === "https:" ? 443 : 80),
	APP_NAME: "Shady Admin",
	APP_VERSION: "1.0.0",
};

export default config;
