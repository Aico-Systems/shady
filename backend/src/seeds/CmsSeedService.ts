import { eq } from 'drizzle-orm';
import { db } from '../db';
import { cmsBlogPosts, cmsSiteContent } from '../db/schema';
import { getLogger } from '../logger';
import siteContentSeed from './data/cms-site-content.json';
import blogPostsSeed from './data/cms-blog-posts.json';

const logger = getLogger('cmsSeedService');
const SITE_CONTENT_KEY = 'landing-site-content';
const SYSTEM_USER = 'system:cms-seed';

function hasContent(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).some((localeValue) => {
    if (!localeValue || typeof localeValue !== 'object' || Array.isArray(localeValue)) {
      return false;
    }

    return Object.keys(localeValue as Record<string, unknown>).length > 0;
  });
}

type SeedBlogPost = {
  slug: string;
  locale: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
  coverImageUrl?: string;
  authorName: string;
  authorRole: string;
  seoTitle?: string;
  seoDescription?: string;
  readingTimeMinutes?: number;
  status: 'draft' | 'published';
  publishedAt?: string;
};

export class CmsSeedService {
  async seed(): Promise<void> {
    await this.seedSiteContent();
    await this.seedBlogPosts();
  }

  private async seedSiteContent() {
    const existing = await db.query.cmsSiteContent.findFirst({
      where: eq(cmsSiteContent.key, SITE_CONTENT_KEY)
    });

    if (existing) {
      const draftPresent = hasContent(existing.draftContent);
      const publishedPresent = hasContent(existing.publishedContent);

      if (draftPresent && publishedPresent) {
        logger.debug('CMS site content already present, skipping seed');
        return;
      }

      const now = new Date();
      await db
        .update(cmsSiteContent)
        .set({
          draftContent: draftPresent ? existing.draftContent : siteContentSeed,
          publishedContent: publishedPresent ? existing.publishedContent : siteContentSeed,
          updatedBy: SYSTEM_USER,
          publishedBy: publishedPresent ? existing.publishedBy || SYSTEM_USER : SYSTEM_USER,
          updatedAt: now,
          publishedAt: publishedPresent ? existing.publishedAt || now : now
        })
        .where(eq(cmsSiteContent.key, SITE_CONTENT_KEY));

      logger.info('Backfilled CMS site content', {
        draftSeeded: !draftPresent,
        publishedSeeded: !publishedPresent
      });
      return;
    }

    const now = new Date();
    await db.insert(cmsSiteContent).values({
      key: SITE_CONTENT_KEY,
      draftContent: siteContentSeed,
      publishedContent: siteContentSeed,
      updatedBy: SYSTEM_USER,
      publishedBy: SYSTEM_USER,
      createdAt: now,
      updatedAt: now,
      publishedAt: now
    });

    logger.info('Seeded CMS site content');
  }

  private async seedBlogPosts() {
    let inserted = 0;

    for (const post of blogPostsSeed as SeedBlogPost[]) {
      const now = new Date();
      const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null;

      const result = await db
        .insert(cmsBlogPosts)
        .values({
          slug: post.slug,
          locale: post.locale,
          title: post.title,
          excerpt: post.excerpt,
          body: post.body,
          category: post.category,
          tags: post.tags,
          coverImageUrl: post.coverImageUrl || null,
          authorName: post.authorName,
          authorRole: post.authorRole,
          seoTitle: post.seoTitle || null,
          seoDescription: post.seoDescription || null,
          readingTimeMinutes: post.readingTimeMinutes || null,
          status: post.status,
          createdBy: SYSTEM_USER,
          updatedBy: SYSTEM_USER,
          publishedBy: post.status === 'published' ? SYSTEM_USER : null,
          createdAt: now,
          updatedAt: now,
          publishedAt
        })
        .onConflictDoNothing({
          target: [cmsBlogPosts.slug, cmsBlogPosts.locale]
        })
        .returning({ id: cmsBlogPosts.id });

      inserted += result.length;
    }

    logger.info('CMS blog post seeding complete', { inserted });
  }
}

export const cmsSeedService = new CmsSeedService();
