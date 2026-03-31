import { readFile } from 'fs/promises';
import { getLogger } from '../logger';
import { cmsService } from '../services/CmsService';
import {
  cmsMediaExists,
  getCmsMediaContentType,
  parseCmsMediaKey,
  resolveCmsMediaPath,
} from '../services/cmsMediaService';
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

    const mediaMatch = path.match(/^\/api\/public\/cms\/media\/(.+)$/);
    if (mediaMatch && method === 'GET') {
      const key = parseCmsMediaKey(mediaMatch[1]);
      const exists = await cmsMediaExists(key);
      if (!exists) {
        return errorResponse('Not found', 404);
      }

      return new Response(await readFile(resolveCmsMediaPath(key)), {
        headers: {
          'Content-Type': getCmsMediaContentType(key),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Disposition': 'inline',
          'Access-Control-Allow-Origin': '*'
        }
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
