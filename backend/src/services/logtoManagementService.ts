import { config } from '../config';
import { getLogger } from '../logger';

const logger = getLogger('logtoManagementService');

interface ManagementToken {
  accessToken: string;
  expiresAt: number;
}

export interface LogtoOrganization {
  id: string;
  name: string;
  description?: string;
  customData?: Record<string, unknown>;
}

export interface LogtoRole {
  id: string;
  name: string;
  description?: string;
}

export interface LogtoUser {
  id: string;
  primaryEmail?: string;
  primaryPhone?: string;
  username?: string;
  name?: string;
  avatar?: string;
  customData?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  [key: string]: unknown;
}

class LogtoManagementService {
  private tokenCache: ManagementToken | null = null;
  private refreshing = false;

  private ensureConfig() {
    if (!config.LOGTO_MANAGEMENT_APP_ID || !config.LOGTO_MANAGEMENT_APP_SECRET) {
      throw new Error(
        'Logto management credentials are not configured. Set LOGTO_MANAGEMENT_APP_ID and LOGTO_MANAGEMENT_APP_SECRET.'
      );
    }
  }

  private get tokenEndpoint() {
    return `${config.LOGTO_BACKEND_ENDPOINT.replace(/\/$/, '')}/oidc/token`;
  }

  private get apiBaseUrl() {
    return `${config.LOGTO_BACKEND_ENDPOINT.replace(/\/$/, '')}/api`;
  }

  private get externalHost() {
    return new URL(config.LOGTO_ENDPOINT).host;
  }

  private asList<T>(data: unknown): T[] {
    if (!data) return [];
    if (Array.isArray(data)) return data as T[];
    if (typeof data !== 'object') return [];

    const record = data as { items?: unknown; data?: unknown };
    const candidate = record.items ?? record.data;
    return Array.isArray(candidate) ? (candidate as T[]) : [];
  }

  private async fetchToken(): Promise<ManagementToken> {
    this.ensureConfig();

    const resourceCandidates = [
      'https://default.logto.app/api',
      config.LOGTO_API_RESOURCE,
      `${config.LOGTO_ENDPOINT.replace(/\/$/, '')}/api`
    ].filter(Boolean);

    const errors: string[] = [];

    for (const resource of resourceCandidates) {
      const basicAuth = Buffer.from(
        `${config.LOGTO_MANAGEMENT_APP_ID}:${config.LOGTO_MANAGEMENT_APP_SECRET}`
      ).toString('base64');

      const attempts: Array<RequestInit> = [
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
            Host: this.externalHost
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            resource,
            scope: 'all'
          }).toString()
        },
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Host: this.externalHost
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.LOGTO_MANAGEMENT_APP_ID,
            client_secret: config.LOGTO_MANAGEMENT_APP_SECRET,
            resource,
            scope: 'all'
          }).toString()
        }
      ];

      for (const init of attempts) {
        const response = await fetch(this.tokenEndpoint, init);
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          errors.push(`${resource}: ${response.status} ${text.slice(0, 200)}`);
          continue;
        }

        const json = await response.json();
        if (!json.access_token) {
          errors.push(`${resource}: missing access_token`);
          continue;
        }

        const expiresIn =
          typeof json.expires_in === 'number' ? json.expires_in : 3600;

        const token = {
          accessToken: json.access_token as string,
          expiresAt: Date.now() + (expiresIn - 30) * 1000
        };

        this.tokenCache = token;
        return token;
      }
    }

    throw new Error(`Failed to obtain Logto management token: ${errors.join(' | ')}`);
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.accessToken;
    }

    if (this.refreshing) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
        return this.tokenCache.accessToken;
      }
    }

    this.refreshing = true;
    try {
      const token = await this.fetchToken();
      return token.accessToken;
    } finally {
      this.refreshing = false;
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    attempt = 0
  ): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Host: this.externalHost,
        ...(method === 'GET' || method === 'DELETE'
          ? {}
          : { 'Content-Type': 'application/json' })
      },
      body:
        method === 'GET' || method === 'DELETE'
          ? undefined
          : JSON.stringify(body)
    });

    if (response.status === 401 && attempt === 0) {
      logger.warn('Logto management token expired, refreshing');
      this.tokenCache = null;
      return this.request(method, path, body, attempt + 1);
    }

    if (response.status === 404) {
      return null as T;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }

    if (response.status === 204 || method === 'DELETE') {
      return null as T;
    }

    const text = await response.text();
    if (!text) {
      return null as T;
    }

    return JSON.parse(text) as T;
  }

  async getUser(userId: string): Promise<LogtoUser | null> {
    return await this.request<LogtoUser | null>('GET', `/users/${userId}`);
  }

  async listOrganizations(): Promise<LogtoOrganization[]> {
    const data = await this.request<unknown>('GET', '/organizations');
    return this.asList<LogtoOrganization>(data);
  }

  async getOrganization(orgId: string): Promise<LogtoOrganization | null> {
    return await this.request<LogtoOrganization | null>('GET', `/organizations/${orgId}`);
  }

  async getUserOrganizations(userId: string): Promise<LogtoOrganization[]> {
    const data = await this.request<unknown>('GET', `/users/${userId}/organizations`);
    return this.asList<LogtoOrganization>(data);
  }

  async getUserOrganizationRoles(userId: string, orgId: string): Promise<LogtoRole[]> {
    const data = await this.request<unknown>('GET', `/organizations/${orgId}/users/${userId}/roles`);
    return this.asList<LogtoRole>(data);
  }

  async listRoles(): Promise<LogtoRole[]> {
    const data = await this.request<unknown>('GET', '/organization-roles');
    return this.asList<LogtoRole>(data);
  }

  async createOrganization(params: {
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<LogtoOrganization> {
    return await this.request<LogtoOrganization>('POST', '/organizations', {
      name: params.name,
      description: params.description,
      customData: params.metadata ?? {}
    });
  }

  async addUsersToOrganization(orgId: string, userIds: string[]): Promise<void> {
    await this.request('POST', `/organizations/${orgId}/users`, { userIds });
  }

  async assignRolesToUser(orgId: string, userId: string, roleIds: string[]): Promise<void> {
    await this.request('POST', `/organizations/${orgId}/users/${userId}/roles`, { organizationRoleIds: roleIds });
  }
}

export const logtoManagementService = new LogtoManagementService();
