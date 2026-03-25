import { getLogger } from '../logger';
import { cmsService } from '../services/CmsService';
import { errorResponse, jsonResponse } from './router';

const logger = getLogger('cmsPublicRoutes');

export async function handleCmsPublicRoutes(
  request: Request,
  url: URL
): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  try {
    if (path === '/api/public/cms/site-content' && method === 'GET') {
      return jsonResponse({
        success: true,
        data: await cmsService.getPublishedSiteContent()
      });
    }

    if (path === '/api/public/cms/posts' && method === 'GET') {
      const locale = url.searchParams.get('locale') || undefined;
      return jsonResponse({
        success: true,
        data: await cmsService.listPublishedBlogPosts(locale)
      });
    }

    const postMatch = path.match(/^\/api\/public\/cms\/posts\/([^/]+)$/);
    if (postMatch && method === 'GET') {
      const locale = url.searchParams.get('locale') || undefined;
      const post = await cmsService.getPublishedBlogPostBySlug(
        postMatch[1],
        locale
      );

      if (!post) {
        return errorResponse('Not found', 404);
      }

      return jsonResponse({ success: true, data: post });
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    logger.error('CMS public route error', { error: error.message, path, method });
    return errorResponse(error.message || 'Internal server error', 500);
  }
}
