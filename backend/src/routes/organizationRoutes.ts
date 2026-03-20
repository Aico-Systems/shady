import { getLogger } from '../logger';
import { jsonResponse, errorResponse } from './router';
import { requireUserContext } from '../utils/logtoAuth';
import { organizationSyncService } from '../services/organizationSyncService';

const logger = getLogger('organizationRoutes');

export async function handleOrganizationRoutes(request: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method;
  const userContext = requireUserContext(request);

  try {
    if (path === '/api/organizations' && method === 'GET') {
      const organizations = await organizationSyncService.syncOrganizationsForUser(userContext.id);
      const preferredOrganizationId =
        userContext.organizationId &&
        organizations.some((organization) => organization.id === userContext.organizationId)
          ? userContext.organizationId
          : null;
      const activeOrganizationId =
        preferredOrganizationId ??
        organizations[0]?.id ??
        null;

      return jsonResponse({
        organizations,
        activeOrganizationId,
        isSuperAdmin: userContext.isSuperAdmin,
        scopes: userContext.scopes,
        organizationScopes: userContext.organizationScopes,
        userId: userContext.id
      });
    }

    if (path === '/api/organizations/ensure-personal' && method === 'POST') {
      const result = await organizationSyncService.ensurePersonalOrganization(userContext.id);

      return jsonResponse({
        organizationId: result.organizationId,
        created: result.created,
        message: result.created ? 'Personal organization created' : 'Organization already available'
      });
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    logger.error('Organization route error', { error: error.message, path, userId: userContext.id });
    return errorResponse(error.message || 'Internal server error', 500);
  }
}
