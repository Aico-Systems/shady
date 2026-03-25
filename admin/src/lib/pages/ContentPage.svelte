<script lang="ts">
  import { onMount } from "svelte";
  import {
    Badge,
    Button,
    FormField,
    PageLayout,
    SectionPanel,
    StateBlock,
    toastService,
    isSuperAdmin,
  } from "@aico/blueprint";
  import {
    cmsApi,
    type CmsBlogPost,
    type CmsBlogPostInput,
    type CmsSiteContentRecord,
  } from "../api";

  const CMS_LOCALES = ["en", "de"] as const;

  type CmsLocale = (typeof CMS_LOCALES)[number];

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

  function formatJson(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2);
  }

  let siteRecord = $state<CmsSiteContentRecord | null>(null);
  let siteJsonByLocale = $state<Record<CmsLocale, string>>({
    en: "{}",
    de: "{}",
  });
  let activeCmsLocale = $state<CmsLocale>("en");
  let loadingSite = $state(true);
  let savingSite = $state(false);

  let posts = $state<CmsBlogPost[]>([]);
  let loadingPosts = $state(true);
  let savingPost = $state(false);
  let deletingPost = $state(false);
  let selectedPostId = $state<string | null>(null);
  let postForm = $state<CmsBlogPostInput>(createEmptyPost());
  let tagsInput = $state("");

  onMount(async () => {
    if (!$isSuperAdmin) {
      loadingSite = false;
      loadingPosts = false;
      return;
    }

    await Promise.all([loadSiteContent(), loadPosts()]);
  });

  async function loadSiteContent() {
    loadingSite = true;
    try {
      siteRecord = await cmsApi.getSiteContent();
      syncSiteJson(siteRecord.draftContent);
    } catch (error) {
      console.error("Failed to load site content", error);
      toastService.error("Failed to load site content.");
    } finally {
      loadingSite = false;
    }
  }

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

  function syncSiteJson(content: Record<string, Record<string, unknown>> | undefined) {
    siteJsonByLocale = {
      en: formatJson(content?.en || {}),
      de: formatJson(content?.de || {}),
    };
  }

  function parseSiteContent() {
    const parsed = {} as Record<CmsLocale, Record<string, unknown>>;

    for (const localeCode of CMS_LOCALES) {
      try {
        const value = JSON.parse(siteJsonByLocale[localeCode] || "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Content must be a JSON object.");
        }
        parsed[localeCode] = value as Record<string, unknown>;
      } catch (error) {
        throw new Error(`Invalid ${localeCode.toUpperCase()} JSON: ${(error as Error).message}`);
      }
    }

    return parsed;
  }

  async function saveSiteContent(action: "saveDraft" | "publish") {
    savingSite = true;
    try {
      const content = parseSiteContent();
      siteRecord =
        action === "publish"
          ? await cmsApi.publishSiteContent(content)
          : await cmsApi.saveSiteContentDraft(content);
      syncSiteJson(siteRecord.draftContent);
      toastService.success(
        action === "publish"
          ? "Landing content published."
          : "Landing draft saved.",
      );
    } catch (error) {
      console.error("Failed to save site content", error);
      toastService.error((error as Error).message || "Failed to save site content.");
    } finally {
      savingSite = false;
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

  let selectedPost = $derived(
    selectedPostId ? posts.find((candidate) => candidate.id === selectedPostId) || null : null,
  );
</script>

<PageLayout
  title="Content Management"
  description="Manage published landing page copy and future blog posts from Shady."
  maxWidth="full"
  spacing="md"
>
  {#if !$isSuperAdmin}
    <SectionPanel>
      <StateBlock
        variant="empty"
        message="Super admin access is required to manage global AICO content."
      />
    </SectionPanel>
  {:else}
    <SectionPanel
      title="Landing Copy"
      subtitle="Edit the full locale-scoped content document. Published content is the landing page source of truth."
      icon="layout-template"
    >
      {#if loadingSite}
        <StateBlock variant="loading" message="Loading content document..." />
      {:else}
        <div class="locale-toolbar">
          <div class="locale-switcher">
            {#each CMS_LOCALES as localeCode}
              <button
                type="button"
                class:active={activeCmsLocale === localeCode}
                onclick={() => (activeCmsLocale = localeCode)}
              >
                {localeCode.toUpperCase()}
              </button>
            {/each}
          </div>
          <div class="meta-line">
            <Badge
              tone={siteRecord?.publishedAt ? "positive" : "muted"}
              size="sm"
              label={siteRecord?.publishedAt ? "Published" : "Draft only"}
            />
            {#if siteRecord?.updatedAt}
              <span>Updated {new Date(siteRecord.updatedAt).toLocaleString()}</span>
            {/if}
            {#if siteRecord?.publishedAt}
              <span>Published {new Date(siteRecord.publishedAt).toLocaleString()}</span>
            {/if}
          </div>
        </div>

        <FormField
          label={`${activeCmsLocale.toUpperCase()} JSON`}
          help="Use the same message structure as the seeded landing locale document. Keep the document complete; there is no runtime fallback."
        >
          <textarea
            value={siteJsonByLocale[activeCmsLocale]}
            rows="22"
            spellcheck="false"
            class="json-editor"
            oninput={(event) => {
              siteJsonByLocale[activeCmsLocale] = (event.currentTarget as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </FormField>

        <div class="panel-actions">
          <Button
            variant="secondary"
            onclick={() => saveSiteContent("saveDraft")}
            disabled={savingSite}
          >
            Save Draft
          </Button>
          <Button onclick={() => saveSiteContent("publish")} disabled={savingSite}>
            Publish Landing Copy
          </Button>
        </div>
      {/if}
    </SectionPanel>

    <SectionPanel
      title="Blog Posts"
      subtitle="Draft, publish, and iterate on landing blog content from the same backend."
      icon="notebook-tabs"
    >
      {#if loadingPosts}
        <StateBlock variant="loading" message="Loading blog posts..." />
      {:else}
        <div class="blog-shell">
          <div class="post-list">
            <div class="post-list-header">
              <h3>Posts</h3>
              <Button variant="secondary" onclick={createNewPost}>New Post</Button>
            </div>

            {#if posts.length === 0}
              <StateBlock variant="empty" message="No blog posts yet." />
            {:else}
              <div class="post-list-items">
                {#each posts as post}
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
                      <span>{post.locale.toUpperCase()}</span>
                      <span>{post.category}</span>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <div class="post-editor">
            <div class="editor-header">
              <div>
                <h3>{selectedPost ? "Edit Post" : "Create Post"}</h3>
                <p>Published posts appear on `/blog/` and `/blog/:slug/`.</p>
              </div>
              {#if selectedPost}
                <Badge
                  tone={selectedPost.status === "published" ? "positive" : "muted"}
                  size="sm"
                  label={selectedPost.status}
                />
              {/if}
            </div>

            <div class="editor-grid">
              <FormField label="Title">
                <input type="text" bind:value={postForm.title} />
              </FormField>

              <FormField label="Slug" help="Lowercase URL segment. Spaces are normalized automatically on save.">
                <input type="text" bind:value={postForm.slug} placeholder="voice-ai-postmortem" />
              </FormField>

              <FormField label="Locale">
                <select bind:value={postForm.locale}>
                  {#each CMS_LOCALES as localeCode}
                    <option value={localeCode}>{localeCode.toUpperCase()}</option>
                  {/each}
                </select>
              </FormField>

              <FormField label="Category">
                <input type="text" bind:value={postForm.category} placeholder="Journal" />
              </FormField>

              <FormField label="Author Name">
                <input type="text" bind:value={postForm.authorName} />
              </FormField>

              <FormField label="Author Role">
                <input type="text" bind:value={postForm.authorRole} />
              </FormField>
            </div>

            <FormField label="Excerpt">
              <textarea bind:value={postForm.excerpt} rows="3"></textarea>
            </FormField>

            <FormField label="Cover Image URL">
              <input
                type="url"
                bind:value={postForm.coverImageUrl}
                placeholder="https://..."
              />
            </FormField>

            <div class="editor-grid">
              <FormField label="Tags" help="Comma-separated.">
                <input type="text" bind:value={tagsInput} placeholder="ops, voice-ai, rollout" />
              </FormField>

              <FormField label="Reading Time (minutes)">
                <input
                  type="number"
                  min="1"
                  bind:value={postForm.readingTimeMinutes}
                />
              </FormField>
            </div>

            <div class="editor-grid">
              <FormField label="SEO Title">
                <input type="text" bind:value={postForm.seoTitle} />
              </FormField>

              <FormField label="SEO Description">
                <input type="text" bind:value={postForm.seoDescription} />
              </FormField>
            </div>

            <FormField label="Body" help="Plain text or lightweight markdown is fine. Paragraph spacing is preserved on the landing page.">
              <textarea bind:value={postForm.body} rows="16" class="body-editor"></textarea>
            </FormField>

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
                Publish Post
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
      {/if}
    </SectionPanel>
  {/if}
</PageLayout>

<style>
  .locale-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .locale-switcher {
    display: inline-flex;
    gap: 8px;
  }

  .locale-switcher button,
  .post-list-item {
    border: 1px solid var(--aico-color-border-default);
    background: var(--aico-color-bg-elevated);
    color: inherit;
    border-radius: 12px;
    transition: 160ms ease;
  }

  .locale-switcher button {
    padding: 10px 14px;
    font: inherit;
    cursor: pointer;
  }

  .locale-switcher button.active,
  .post-list-item.active {
    border-color: var(--aico-color-primary);
    background: color-mix(in srgb, var(--aico-color-primary) 10%, var(--aico-color-bg-elevated));
  }

  .meta-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--aico-color-text-secondary);
    font-size: 13px;
  }

  .json-editor,
  .body-editor,
  textarea,
  input,
  select {
    width: 100%;
  }

  .json-editor,
  .body-editor,
  textarea {
    min-height: 180px;
    font-family:
      "SFMono-Regular",
      Consolas,
      "Liberation Mono",
      monospace;
    line-height: 1.6;
  }

  .panel-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 20px;
  }

  .blog-shell {
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }

  .post-list,
  .post-editor {
    border: 1px solid var(--aico-color-border-subtle);
    border-radius: 18px;
    padding: 18px;
    background: var(--aico-color-bg-elevated);
  }

  .post-list-header,
  .editor-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
    margin-bottom: 16px;
  }

  .editor-header p {
    margin: 6px 0 0;
    color: var(--aico-color-text-secondary);
    font-size: 14px;
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
  }

  .post-list-item-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .post-list-item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--aico-color-text-secondary);
    font-size: 12px;
  }

  .post-editor {
    display: grid;
    gap: 16px;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  @media (max-width: 960px) {
    .blog-shell,
    .editor-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
