import { getLogger } from '../logger';
import { cmsService } from '../services/CmsService';
import { storeCmsMedia } from '../services/cmsMediaService';
import { errorResponse, jsonResponse } from './router';

const logger = getLogger('cmsAdminRoutes');

export async function handleCmsAdminRoutes(
  request: Request,
  url: URL,
  userId: string
): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  try {
    if (path === '/api/admin/cms/site-content' && method === 'GET') {
      return jsonResponse({ success: true, data: await cmsService.getAdminSiteContent() });
    }

    if (path === '/api/admin/cms/site-content' && method === 'PUT') {
      const body = await request.json();
      const action = body?.action === 'publish' ? 'publish' : 'saveDraft';
      const content = body?.content;

      const data =
        action === 'publish'
          ? await cmsService.publishSiteContent(content, userId)
          : await cmsService.saveSiteContentDraft(content, userId);

      return jsonResponse({ success: true, data });
    }

    if (path === '/api/admin/cms/posts' && method === 'GET') {
      return jsonResponse({ success: true, data: await cmsService.listBlogPostsAdmin() });
    }

    if (path === '/api/admin/cms/posts' && method === 'POST') {
      const body = await request.json();
      return jsonResponse(
        { success: true, data: await cmsService.createBlogPost(body, userId) },
        201
      );
    }

    if (path === '/api/admin/cms/media' && method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return errorResponse('Expected multipart/form-data', 400);
      }

      const formData = await request.formData();
      const file = formData.get('file');
      const kindValue = formData.get('kind');
      const kind = kindValue === 'video' ? 'video' : 'image';

      if (!(file instanceof File)) {
        return errorResponse("Missing 'file' field in form data", 400);
      }

      const stored = await storeCmsMedia(kind, userId, file);
      return jsonResponse({ success: true, data: stored }, 201);
    }

    const postMatch = path.match(/^\/api\/admin\/cms\/posts\/([^/]+)$/);
    if (postMatch && method === 'PUT') {
      const body = await request.json();
      return jsonResponse({
        success: true,
        data: await cmsService.updateBlogPost(postMatch[1], body, userId)
      });
    }

    if (postMatch && method === 'DELETE') {
      return jsonResponse({
        success: true,
        data: await cmsService.deleteBlogPost(postMatch[1])
      });
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    logger.error('CMS admin route error', { error: error.message, path, method });
    return errorResponse(error.message || 'Internal server error', 500);
  }
}
