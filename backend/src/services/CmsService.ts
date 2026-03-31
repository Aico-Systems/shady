import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { cmsBlogPosts, cmsSiteContent } from '../db/schema';

const SITE_CONTENT_KEY = 'landing-site-content';

const localizedContentSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown())
);

const blogPostInputSchema = z.object({
  slug: z.string().min(1),
  locale: z.string().default('en'),
  title: z.string().min(1),
  excerpt: z.string().default(''),
  body: z.string().default(''),
  category: z.string().default('Journal'),
  tags: z.array(z.string()).default([]),
  coverImageUrl: z.string().trim().url().nullable().optional(),
  authorName: z.string().default('AICO'),
  authorRole: z.string().default('Editorial'),
  seoTitle: z.string().trim().nullable().optional(),
  seoDescription: z.string().trim().nullable().optional(),
  readingTimeMinutes: z.number().int().positive().nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  publishedAt: z.string().datetime().nullable().optional()
});

export type LocalizedSiteContent = z.infer<typeof localizedContentSchema>;
export type CmsBlogPostInput = z.infer<typeof blogPostInputSchema>;

function normalizeLocale(value: string | null | undefined): string {
  const normalized = (value || 'en').trim().toLowerCase();
  return normalized || 'en';
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeNullableText(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function inferReadingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function normalizeTags(tags: string[]): string[] {
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index);
}

function hasLocalizedContent(value: unknown): boolean {
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

function mapBlogPost(row: typeof cmsBlogPosts.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    coverImageUrl: row.coverImageUrl || null,
    authorName: row.authorName,
    authorRole: row.authorRole,
    seoTitle: row.seoTitle || null,
    seoDescription: row.seoDescription || null,
    readingTimeMinutes: row.readingTimeMinutes || inferReadingTimeMinutes(row.body),
    status: row.status,
    createdAt: row.createdAt?.toISOString() || null,
    updatedAt: row.updatedAt?.toISOString() || null,
    publishedAt: row.publishedAt?.toISOString() || null
  };
}

export class CmsService {
  async getAdminSiteContent() {
    const row = await db.query.cmsSiteContent.findFirst({
      where: eq(cmsSiteContent.key, SITE_CONTENT_KEY)
    });

    const draftContent = localizedContentSchema.parse(row?.draftContent || {});
    const publishedContent = localizedContentSchema.parse(row?.publishedContent || {});
    const effectiveDraftContent = hasLocalizedContent(draftContent)
      ? draftContent
      : publishedContent;

    return {
      key: SITE_CONTENT_KEY,
      draftContent: effectiveDraftContent,
      publishedContent,
      updatedAt: row?.updatedAt?.toISOString() || null,
      publishedAt: row?.publishedAt?.toISOString() || null,
      updatedBy: row?.updatedBy || null,
      publishedBy: row?.publishedBy || null
    };
  }

  async saveSiteContentDraft(content: unknown, userId: string) {
    const parsed = localizedContentSchema.parse(content);
    const now = new Date();

    await db
      .insert(cmsSiteContent)
      .values({
        key: SITE_CONTENT_KEY,
        draftContent: parsed,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: cmsSiteContent.key,
        set: {
          draftContent: parsed,
          updatedBy: userId,
          updatedAt: now
        }
      });

    return this.getAdminSiteContent();
  }

  async publishSiteContent(content: unknown | undefined, userId: string) {
    if (content !== undefined) {
      await this.saveSiteContentDraft(content, userId);
    }

    const current = await db.query.cmsSiteContent.findFirst({
      where: eq(cmsSiteContent.key, SITE_CONTENT_KEY)
    });

    const draftContent = localizedContentSchema.parse(current?.draftContent || {});
    const now = new Date();

    await db
      .insert(cmsSiteContent)
      .values({
        key: SITE_CONTENT_KEY,
        draftContent,
        publishedContent: draftContent,
        updatedBy: userId,
        publishedBy: userId,
        createdAt: now,
        updatedAt: now,
        publishedAt: now
      })
      .onConflictDoUpdate({
        target: cmsSiteContent.key,
        set: {
          draftContent,
          publishedContent: draftContent,
          updatedBy: userId,
          publishedBy: userId,
          updatedAt: now,
          publishedAt: now
        }
      });

    return this.getAdminSiteContent();
  }

  async getPublishedSiteContent(): Promise<LocalizedSiteContent> {
    const row = await db.query.cmsSiteContent.findFirst({
      where: eq(cmsSiteContent.key, SITE_CONTENT_KEY)
    });

    return localizedContentSchema.parse(row?.publishedContent || {});
  }

  async listBlogPostsAdmin() {
    const rows = await db
      .select()
      .from(cmsBlogPosts)
      .orderBy(desc(cmsBlogPosts.updatedAt), desc(cmsBlogPosts.createdAt));

    return rows.map(mapBlogPost);
  }

  async createBlogPost(input: unknown, userId: string) {
    const parsed = this.normalizeBlogPostInput(input);
    const now = new Date();
    const publishedAt =
      parsed.status === 'published'
        ? parsed.publishedAt
          ? new Date(parsed.publishedAt)
          : now
        : null;

    const [row] = await db
      .insert(cmsBlogPosts)
      .values({
        slug: parsed.slug,
        locale: parsed.locale,
        title: parsed.title,
        excerpt: parsed.excerpt,
        body: parsed.body,
        category: parsed.category,
        tags: parsed.tags,
        coverImageUrl: parsed.coverImageUrl,
        authorName: parsed.authorName,
        authorRole: parsed.authorRole,
        seoTitle: parsed.seoTitle,
        seoDescription: parsed.seoDescription,
        readingTimeMinutes: parsed.readingTimeMinutes,
        status: parsed.status,
        createdBy: userId,
        updatedBy: userId,
        publishedBy: parsed.status === 'published' ? userId : null,
        createdAt: now,
        updatedAt: now,
        publishedAt
      })
      .returning();

    return mapBlogPost(row);
  }

  async updateBlogPost(id: string, input: unknown, userId: string) {
    const existing = await db.query.cmsBlogPosts.findFirst({
      where: eq(cmsBlogPosts.id, id)
    });

    if (!existing) {
      throw new Error('Blog post not found');
    }

    const parsed = this.normalizeBlogPostInput(input);
    const now = new Date();
    const nextPublishedAt =
      parsed.status === 'published'
        ? parsed.publishedAt
          ? new Date(parsed.publishedAt)
          : existing.publishedAt || now
        : null;

    const [row] = await db
      .update(cmsBlogPosts)
      .set({
        slug: parsed.slug,
        locale: parsed.locale,
        title: parsed.title,
        excerpt: parsed.excerpt,
        body: parsed.body,
        category: parsed.category,
        tags: parsed.tags,
        coverImageUrl: parsed.coverImageUrl,
        authorName: parsed.authorName,
        authorRole: parsed.authorRole,
        seoTitle: parsed.seoTitle,
        seoDescription: parsed.seoDescription,
        readingTimeMinutes: parsed.readingTimeMinutes,
        status: parsed.status,
        updatedBy: userId,
        updatedAt: now,
        publishedBy: parsed.status === 'published' ? userId : null,
        publishedAt: nextPublishedAt
      })
      .where(eq(cmsBlogPosts.id, id))
      .returning();

    return mapBlogPost(row);
  }

  async deleteBlogPost(id: string) {
    const [row] = await db
      .delete(cmsBlogPosts)
      .where(eq(cmsBlogPosts.id, id))
      .returning();

    if (!row) {
      throw new Error('Blog post not found');
    }

    return mapBlogPost(row);
  }

  async listPublishedBlogPosts(locale?: string) {
    const normalizedLocale = normalizeLocale(locale);
    const exact = await db
      .select()
      .from(cmsBlogPosts)
      .where(
        and(
          eq(cmsBlogPosts.status, 'published'),
          eq(cmsBlogPosts.locale, normalizedLocale)
        )
      )
      .orderBy(desc(cmsBlogPosts.publishedAt), desc(cmsBlogPosts.updatedAt));

    return exact.map(mapBlogPost);
  }

  async getPublishedBlogPostBySlug(slug: string, locale?: string) {
    const normalizedLocale = normalizeLocale(locale);
    const normalizedSlug = normalizeSlug(slug);

    const exact = await db.query.cmsBlogPosts.findFirst({
      where: and(
        eq(cmsBlogPosts.status, 'published'),
        eq(cmsBlogPosts.locale, normalizedLocale),
        eq(cmsBlogPosts.slug, normalizedSlug)
      )
    });

    return exact ? mapBlogPost(exact) : null;
  }

  private normalizeBlogPostInput(input: unknown): CmsBlogPostInput {
    const parsed = blogPostInputSchema.parse(input);
    const slug = normalizeSlug(parsed.slug);

    if (!slug) {
      throw new Error('Slug is required');
    }

    return {
      ...parsed,
      slug,
      locale: normalizeLocale(parsed.locale),
      title: parsed.title.trim(),
      excerpt: parsed.excerpt.trim(),
      body: parsed.body.trim(),
      category: parsed.category.trim() || 'Journal',
      tags: normalizeTags(parsed.tags),
      coverImageUrl: normalizeNullableText(parsed.coverImageUrl ?? null),
      authorName: parsed.authorName.trim() || 'AICO',
      authorRole: parsed.authorRole.trim() || 'Editorial',
      seoTitle: normalizeNullableText(parsed.seoTitle ?? null),
      seoDescription: normalizeNullableText(parsed.seoDescription ?? null),
      readingTimeMinutes:
        parsed.readingTimeMinutes && parsed.readingTimeMinutes > 0
          ? parsed.readingTimeMinutes
          : inferReadingTimeMinutes(parsed.body)
    };
  }
}

export const cmsService = new CmsService();
