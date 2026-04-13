// API client for the main AICO backend (flow engine)
// Uses /dev/api routes which bypass auth — requires X-Dev-Organization-Id header
import config from "./config";

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
  const url = `${config.AICO_API_URL}/dev/api${path}`;
  const headers = new Headers(options?.headers);
  headers.set("X-Dev-Organization-Id", organizationId);
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
