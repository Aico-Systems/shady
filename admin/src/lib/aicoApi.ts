// API client for the main AICO backend (flow engine)
// Dev: /dev/api routes (no auth, X-Dev-Organization-Id header)
// Prod: /api routes with Logto Bearer token (same Logto instance)
import { auth, currentOrganization } from "@aico/blueprint";
import { get } from "svelte/store";
import config from "./config";

const isDev = config.AICO_API_URL.includes("localhost");

export interface AicoFlow {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface TriggerRequest {
  destination?: string;
  callerId?: string;
  variables?: Record<string, unknown>;
  userId?: string;
  sync?: boolean;
  syncTimeout?: number;
  webhookUrl?: string;
}

export interface TriggerResponse {
  sessionId: string;
  status: "started" | "completed" | "failed" | "timeout";
  roomName?: string;
  returnValue?: unknown;
  duration?: number;
  error?: string;
}

async function aicoCall<T>(
  path: string,
  organizationId: string,
  options?: RequestInit,
): Promise<T> {
  const prefix = isDev ? "/dev/api" : "/api";
  const url = `${config.AICO_API_URL}${prefix}${path}`;
  const headers = new Headers(options?.headers);

  if (isDev) {
    headers.set("X-Dev-Organization-Id", organizationId);
  } else {
    // Same Logto instance — get token for the AICO API resource
    const organization = get(currentOrganization);
    const token = auth.getAccessToken
      ? await auth.getAccessToken(config.AICO_API_URL, organization?.id)
      : null;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  if (options?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AICO API ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export const aicoFlowsApi = {
  list: (orgId: string) =>
    aicoCall<{ flows: AicoFlow[] }>("/flows", orgId).then((r) => r.flows),

  trigger: (orgId: string, flowIdOrSlug: string, body: TriggerRequest) =>
    aicoCall<TriggerResponse>(`/flows/${flowIdOrSlug}/trigger`, orgId, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
