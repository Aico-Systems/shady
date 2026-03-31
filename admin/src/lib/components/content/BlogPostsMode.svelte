<script lang="ts">
  import { onMount } from "svelte";
  import {
    Badge,
    Button,
    FormField,
    RichTextEditor,
    SectionPanel,
    StateBlock,
    toastService,
    isSuperAdmin,
  } from "@aico/blueprint";
  import { SegmentedToggle } from "@aico/blueprint";
  import { cmsApi, type CmsBlogPost, type CmsBlogPostInput } from "../../api";

  const CMS_LOCALES = ["en", "de"] as const;
  type CmsLocale = (typeof CMS_LOCALES)[number];

  const LOCALE_TOGGLE_ITEMS = CMS_LOCALES.map((code) => ({
    id: code,
    label: code.toUpperCase(),
  }));

  let activeLocale = $state<CmsLocale>("en");

  function switchLocale(id: string) {
    activeLocale = id as CmsLocale;
    const firstInLocale = posts.find((p) => p.locale === activeLocale);
    selectPost(firstInLocale?.id ?? null);
  }

  function createEmptyPost(): CmsBlogPostInput {
    return {
      slug: "",
      locale: "en",
      title: "",
      excerpt: "",
      body: "",
      category: "Journal",
      tags: [],
      coverImageUrl: "",
      authorName: "AICO",
      authorRole: "Editorial",
      seoTitle: "",
      seoDescription: "",
      readingTimeMinutes: null,
      status: "draft",
      publishedAt: null,
    };
  }

  function slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  let posts = $state<CmsBlogPost[]>([]);
  let loadingPosts = $state(true);
  let savingPost = $state(false);
  let deletingPost = $state(false);
  let coverImageUploading = $state(false);
  let selectedPostId = $state<string | null>(null);
  let postForm = $state<CmsBlogPostInput>(createEmptyPost());
  let tagsInput = $state("");
  let coverImageInput = $state<HTMLInputElement>();

  onMount(async () => {
    if (!$isSuperAdmin) {
      loadingPosts = false;
      return;
    }

    await loadPosts();
  });

  async function loadPosts() {
    loadingPosts = true;
    try {
      posts = await cmsApi.listPosts();
      if (posts.length > 0 && !selectedPostId) {
        selectPost(posts[0].id);
      }
    } catch (error) {
      console.error("Failed to load blog posts", error);
      toastService.error("Failed to load blog posts.");
    } finally {
      loadingPosts = false;
    }
  }

  function selectPost(postId: string | null) {
    selectedPostId = postId;

    if (!postId) {
      postForm = createEmptyPost();
      tagsInput = "";
      return;
    }

    const post = posts.find((candidate) => candidate.id === postId);
    if (!post) return;

    postForm = {
      slug: post.slug,
      locale: post.locale,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      category: post.category,
      tags: [...post.tags],
      coverImageUrl: post.coverImageUrl || "",
      authorName: post.authorName,
      authorRole: post.authorRole,
      seoTitle: post.seoTitle || "",
      seoDescription: post.seoDescription || "",
      readingTimeMinutes: post.readingTimeMinutes,
      status: post.status,
      publishedAt: post.publishedAt,
    };
    tagsInput = post.tags.join(", ");
  }

  function createNewPost() {
    selectPost(null);
    postForm.locale = activeLocale;
  }

  function buildPostPayload(statusOverride?: "draft" | "published"): CmsBlogPostInput {
    return {
      ...postForm,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: statusOverride || postForm.status,
      coverImageUrl: postForm.coverImageUrl?.trim() || null,
      seoTitle: postForm.seoTitle?.trim() || null,
      seoDescription: postForm.seoDescription?.trim() || null,
      publishedAt:
        (statusOverride || postForm.status) === "published"
          ? postForm.publishedAt || new Date().toISOString()
          : null,
    };
  }

  async function savePost(statusOverride?: "draft" | "published") {
    savingPost = true;
    try {
      const payload = buildPostPayload(statusOverride);
      const saved = selectedPostId
        ? await cmsApi.updatePost(selectedPostId, payload)
        : await cmsApi.createPost(payload);

      await loadPosts();
      selectPost(saved.id);
      toastService.success(
        saved.status === "published"
          ? "Blog post published."
          : "Blog post saved.",
      );
    } catch (error) {
      console.error("Failed to save blog post", error);
      toastService.error((error as Error).message || "Failed to save blog post.");
    } finally {
      savingPost = false;
    }
  }

  async function deleteSelectedPost() {
    if (!selectedPostId) return;

    const confirmed = window.confirm("Delete this blog post?");
    if (!confirmed) return;

    deletingPost = true;
    try {
      await cmsApi.deletePost(selectedPostId);
      toastService.success("Blog post deleted.");
      selectedPostId = null;
      postForm = createEmptyPost();
      tagsInput = "";
      await loadPosts();
    } catch (error) {
      console.error("Failed to delete blog post", error);
      toastService.error((error as Error).message || "Failed to delete blog post.");
    } finally {
      deletingPost = false;
    }
  }

  async function uploadEditorMedia(file: File, kind: "image" | "video") {
    try {
      return await cmsApi.uploadMedia(file, kind);
    } catch (error) {
      console.error("Failed to upload media", error);
      throw error instanceof Error ? error : new Error("Failed to upload media.");
    }
  }

  function triggerCoverImageUpload() {
    if (coverImageUploading) return;
    coverImageInput?.click();
  }

  async function handleCoverImageSelect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    coverImageUploading = true;
    try {
      const uploaded = await cmsApi.uploadMedia(file, "image");
      postForm.coverImageUrl = uploaded.url;
      toastService.success("Cover image uploaded.");
    } catch (error) {
      console.error("Failed to upload cover image", error);
      toastService.error((error as Error).message || "Failed to upload cover image.");
    } finally {
      coverImageUploading = false;
    }
  }

  let selectedPost = $derived(
    selectedPostId ? posts.find((candidate) => candidate.id === selectedPostId) || null : null,
  );

  const filteredPosts = $derived(posts.filter((p) => p.locale === activeLocale));

  const resolvedSlug = $derived(slugify(postForm.slug || postForm.title || ""));
  const effectiveSeoTitle = $derived((postForm.seoTitle || postForm.title || "").trim());
  const effectiveSeoDescription = $derived((postForm.seoDescription || postForm.excerpt || "").trim());
  const headingMatches = $derived(
    postForm.body.match(/^#{2,3}\s+.+$/gm)?.length || 0,
  );
  const tagCount = $derived(
    tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean).length,
  );
</script>

<SectionPanel
  title="Blog Posts"
  icon="notebook-tabs"
  actions={[
    {
      label: "New Post",
      onClick: createNewPost,
      variant: "secondary",
      icon: "plus",
    },
  ]}
>
  {#if loadingPosts}
    <StateBlock variant="loading" message="Loading blog posts..." />
  {:else}
    <div class="blog-shell">
      <div class="post-list">
        <div class="post-list-header">
          <h3>Posts</h3>
          <SegmentedToggle
            items={LOCALE_TOGGLE_ITEMS}
            activeId={activeLocale}
            onChange={switchLocale}
            ariaLabel="Filter posts by locale"
          />
        </div>

        {#if filteredPosts.length === 0}
          <StateBlock variant="empty" message="No blog posts yet." />
        {:else}
          <div class="post-list-items">
            {#each filteredPosts as post}
              <button
                type="button"
                class="post-list-item"
                class:active={selectedPostId === post.id}
                onclick={() => selectPost(post.id)}
              >
                <div class="post-list-item-head">
                  <strong>{post.title}</strong>
                  <Badge
                    tone={post.status === "published" ? "positive" : "muted"}
                    size="sm"
                    label={post.status}
                  />
                </div>
                <div class="post-list-item-meta">
                  <span>/{post.slug}</span>
                  <span>{post.category}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="post-editor">
        <div class="editor-header">
          <div class="editor-header-copy">
            <h3>{selectedPost ? "Edit Post" : "Create Post"}</h3>
            <p>Write the article first, then tighten slug, SEO, and publishing metadata.</p>
          </div>
          <div class="editor-header-meta">
            <Badge
              tone={postForm.status === "published" ? "positive" : "muted"}
              size="sm"
              label={postForm.status}
            />
            <Badge tone="muted" size="sm" label={resolvedSlug ? `/blog/${resolvedSlug}/` : "Slug needed"} />
          </div>
        </div>

        <div class="editor-shell">
          <div class="editor-main">
            <div class="field-stack">
              <FormField label="Title">
                <input type="text" bind:value={postForm.title} />
              </FormField>

              <FormField label="Excerpt">
                <textarea bind:value={postForm.excerpt} rows="3"></textarea>
              </FormField>
            </div>

            <section class="body-section">
              <div class="body-section-head">
                <div>
                  <h4>Body</h4>
                  <p>Structure the article with headings, lists, quotes, links, and short sections.</p>
                </div>
              </div>

              <RichTextEditor
                bind:content={postForm.body}
                format="markdown"
                minHeight="540px"
                showToolbar={true}
                toolbarMode="attached"
                allowMedia={true}
                onUploadMedia={uploadEditorMedia}
                showCharacterCount={true}
                characterLimit={50000}
                placeholder="Write the article body with headings, lists, quotes, links, images, videos, and inline code."
              />
            </section>

            <div class="body-guidance">
              <strong>Formatting</strong>
              <span>Use `##` and `###` headings, lists, quotes, dividers, links, bold, italics, inline images, and inline videos. Keep paragraphs short so the landing page reads like an editorial article, not a wall of text.</span>
              <div class="meta-strip">
                <Badge tone="muted" size="sm" label={`${headingMatches} headings`} />
              </div>
            </div>
          </div>

          <div class="editor-sidebar">
            <div class="seo-card">
              <div class="seo-card-head">
                <h4>SEO snapshot</h4>
              </div>

              <div class="seo-metrics">
                <Badge
                  tone={effectiveSeoTitle.length >= 40 && effectiveSeoTitle.length <= 65 ? "positive" : "warning"}
                  size="sm"
                  label={`Title ${effectiveSeoTitle.length}/65`}
                />
                <Badge
                  tone={effectiveSeoDescription.length >= 120 && effectiveSeoDescription.length <= 160 ? "positive" : "warning"}
                  size="sm"
                  label={`Description ${effectiveSeoDescription.length}/160`}
                />
              </div>

              <div class="seo-preview">
                <strong>{effectiveSeoTitle || "SEO title preview"}</strong>
                <span>{resolvedSlug ? `https://aicoyo.com/blog/${resolvedSlug}/` : "https://aicoyo.com/blog/your-slug/"}</span>
                <p>{effectiveSeoDescription || "Your meta description preview will appear here."}</p>
              </div>
            </div>

            <div class="editor-grid compact">
              <FormField label="Slug" help="Lowercase URL segment.">
                <input type="text" bind:value={postForm.slug} placeholder="voice-ai-postmortem" />
              </FormField>

              <FormField label="Category">
                <input type="text" bind:value={postForm.category} placeholder="Journal" />
              </FormField>

              <FormField label="Reading Time">
                <input type="number" min="1" bind:value={postForm.readingTimeMinutes} />
              </FormField>
            </div>

            <div class="editor-grid compact">
              <FormField label="Author Name">
                <input type="text" bind:value={postForm.authorName} />
              </FormField>

              <FormField label="Author Role">
                <input type="text" bind:value={postForm.authorRole} />
              </FormField>
            </div>

            <FormField label="Tags" help="Comma-separated">
              <input type="text" bind:value={tagsInput} placeholder="ops, voice-ai, rollout" />
            </FormField>

            <div class="meta-strip">
              <Badge tone="muted" size="sm" label={`${tagCount} tags`} />
              <Badge tone="muted" size="sm" label={`${postForm.excerpt.trim().length} excerpt chars`} />
            </div>

            <FormField label="Cover Image URL">
              <input
                type="url"
                bind:value={postForm.coverImageUrl}
                placeholder="https://..."
              />
            </FormField>

            <div class="cover-upload-row">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                bind:this={coverImageInput}
                onchange={handleCoverImageSelect}
                class="visually-hidden-input"
              />
              <Button
                variant="secondary"
                size="sm"
                icon="upload"
                onclick={triggerCoverImageUpload}
                loading={coverImageUploading}
              >
                Upload cover image
              </Button>
              <span>Use upload for local assets or paste a hosted image URL above.</span>
            </div>

            {#if postForm.coverImageUrl}
              <div class="cover-preview">
                <img src={postForm.coverImageUrl} alt="" />
              </div>
            {/if}

            <div class="editor-grid compact">
              <FormField label="SEO Title">
                <input type="text" bind:value={postForm.seoTitle} />
              </FormField>

              <FormField label="SEO Description">
                <input type="text" bind:value={postForm.seoDescription} />
              </FormField>
            </div>

            <div class="panel-actions">
              <Button
                variant="secondary"
                onclick={() => savePost("draft")}
                disabled={savingPost || deletingPost}
              >
                Save Draft
              </Button>
              <Button
                onclick={() => savePost("published")}
                disabled={savingPost || deletingPost}
              >
                Publish
              </Button>
              {#if selectedPostId}
                <Button
                  variant="danger"
                  onclick={deleteSelectedPost}
                  disabled={savingPost || deletingPost}
                >
                  Delete
                </Button>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</SectionPanel>

<style>
  .blog-shell {
    display: grid;
    grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }

  .post-list,
  .post-editor {
    border: 1px solid var(--aico-color-border-light, var(--field-border));
    border-radius: var(--blueprint-radius-lg, 16px);
    background: var(--surface-card, var(--aico-color-bg-primary));
    box-shadow: var(--shadow-sm);
    padding: 18px;
  }

  .post-list,
  .post-editor {
    display: grid;
    gap: 16px;
  }

  .post-list {
    position: sticky;
    top: 24px;
  }

  .post-list-header,
  .editor-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
  }

  .post-list-header h3,
  .editor-header h3 {
    margin: 0;
  }

  .editor-header-copy {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .editor-header-copy p {
    margin: 0;
    max-width: 58ch;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    line-height: 1.55;
  }

  .editor-header-meta,
  .seo-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .post-list-items {
    display: grid;
    gap: 12px;
  }

  .post-list-item {
    display: grid;
    gap: 8px;
    padding: 14px;
    text-align: left;
    cursor: pointer;
    color: var(--text-primary, var(--aico-color-text-primary));
    font: inherit;
    appearance: none;
    border: 1px solid var(--field-border, var(--aico-color-border-light));
    background: var(--surface-card, var(--aico-color-bg-primary));
    border-radius: var(--blueprint-radius-md, 10px);
    box-shadow: var(--shadow-sm);
    transition:
      var(--transition-colors-shadow),
      transform var(--transition-timing-fast);
  }

  .post-list-item.active {
    border-color: var(--field-border-focus, var(--accent-color-primary));
    box-shadow: inset 0 0 0 1px var(--field-border-focus, var(--accent-color-primary));
  }

  .post-list-item:hover {
    background: var(--field-bg-hover, var(--surface-secondary, var(--aico-color-bg-secondary)));
    border-color: var(--field-border-hover, var(--aico-color-border-medium));
  }

  .post-list-item-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .post-list-item-head strong {
    color: var(--text-primary, var(--aico-color-text-primary));
  }

  .post-list-item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    font-size: 12px;
  }

  .editor-shell {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.9fr);
    gap: 20px;
    align-items: start;
  }

  .editor-main,
  .editor-sidebar {
    display: grid;
    gap: 16px;
  }

  .field-stack {
    display: grid;
    gap: 16px;
  }

  .body-section {
    display: grid;
    gap: 12px;
  }

  .body-section-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 16px;
  }

  .body-section-head > div {
    display: grid;
    gap: 6px;
  }

  .body-section-head h4 {
    margin: 0;
    font-size: 1rem;
  }

  .body-section-head p {
    margin: 0;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    line-height: 1.5;
  }

  .seo-card,
  .cover-preview,
  .body-guidance {
    border: 1px solid var(--aico-color-border-light, var(--field-border));
    border-radius: var(--blueprint-radius-lg, 16px);
    background: var(--surface-card, var(--aico-color-bg-primary));
    box-shadow: var(--shadow-sm);
    padding: 14px;
  }

  .seo-card,
  .body-guidance {
    display: grid;
    gap: 12px;
  }

  .editor-sidebar > * {
    min-width: 0;
  }

  .seo-card-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .seo-card-head h4 {
    margin: 0;
    font-size: 0.92rem;
  }

  .seo-preview {
    display: grid;
    gap: 6px;
  }

  .seo-preview strong {
    color: #8ab4f8;
    font-size: 1rem;
    line-height: 1.35;
  }

  .seo-preview span {
    color: #34a853;
    font-size: 0.82rem;
    word-break: break-all;
  }

  .seo-preview p,
  .body-guidance span {
    margin: 0;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    line-height: 1.55;
  }

  .body-guidance strong {
    font-size: 0.92rem;
  }

  .cover-preview {
    overflow: hidden;
    padding: 0;
  }

  .cover-upload-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .visually-hidden-input {
    display: none;
  }

  .cover-preview img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .editor-grid.compact {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .meta-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .panel-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  textarea,
  input,
  select {
    width: 100%;
  }

  textarea {
    min-height: 180px;
    font-family: inherit;
    line-height: 1.6;
  }

  @media (max-width: 1440px) {
    .editor-shell {
      grid-template-columns: 1fr;
    }

    .post-list {
      position: static;
    }
  }

  @media (max-width: 960px) {
    .blog-shell,
    .editor-grid {
      grid-template-columns: 1fr;
    }

    .editor-header,
    .body-section-head {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
