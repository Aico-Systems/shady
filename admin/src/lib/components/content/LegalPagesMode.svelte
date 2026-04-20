<script lang="ts">
  import { onMount } from "svelte";
  import {
    Badge,
    Button,
    FormField,
    RichTextEditor,
    SectionPanel,
    SegmentedToggle,
    StateBlock,
    toastService,
    isSuperAdmin,
  } from "@aico/blueprint";
  import {
    cmsApi,
    type CmsLegalPage,
    type CmsLegalPageInput,
    type CmsLegalPageKey,
  } from "../../api";

  const CMS_LOCALES = ["en", "de"] as const;
  type CmsLocale = (typeof CMS_LOCALES)[number];

  const LOCALE_TOGGLE_ITEMS = CMS_LOCALES.map((code) => ({
    id: code,
    label: code.toUpperCase(),
  }));

  const LEGAL_PAGE_KEYS: CmsLegalPageKey[] = ["imprint", "privacy", "terms"];

  const PAGE_LABELS: Record<CmsLegalPageKey, { en: string; de: string }> = {
    imprint: { en: "Imprint", de: "Impressum" },
    privacy: { en: "Privacy", de: "Datenschutz" },
    terms: { en: "Terms", de: "AGB" },
  };

  let activeLocale = $state<CmsLocale>("en");
  let activePageKey = $state<CmsLegalPageKey>("imprint");

  function createEmptyPage(pageKey: CmsLegalPageKey, locale: CmsLocale): CmsLegalPageInput {
    return {
      pageKey,
      locale,
      title: "",
      description: "",
      eyebrow: "",
      lede: "",
      body: "",
      status: "draft",
      publishedAt: null,
    };
  }

  let pages = $state<CmsLegalPage[]>([]);
  let loadingPages = $state(true);
  let savingPage = $state(false);
  let deletingPage = $state(false);
  let pageForm = $state<CmsLegalPageInput>(createEmptyPage("imprint", "en"));

  const selectedPage = $derived(
    pages.find(
      (p) => p.pageKey === activePageKey && p.locale === activeLocale,
    ) || null,
  );

  onMount(async () => {
    if (!$isSuperAdmin) {
      loadingPages = false;
      return;
    }

    await loadPages();
  });

  async function loadPages() {
    loadingPages = true;
    try {
      pages = await cmsApi.listLegalPages();
      applySelection();
    } catch (error) {
      console.error("Failed to load legal pages", error);
      toastService.error("Failed to load legal pages.");
    } finally {
      loadingPages = false;
    }
  }

  function applySelection() {
    const existing = pages.find(
      (p) => p.pageKey === activePageKey && p.locale === activeLocale,
    );

    if (existing) {
      pageForm = {
        pageKey: existing.pageKey,
        locale: existing.locale,
        title: existing.title,
        description: existing.description,
        eyebrow: existing.eyebrow,
        lede: existing.lede,
        body: existing.body,
        status: existing.status,
        publishedAt: existing.publishedAt,
      };
    } else {
      pageForm = createEmptyPage(activePageKey, activeLocale);
    }
  }

  function switchLocale(id: string) {
    activeLocale = id as CmsLocale;
    applySelection();
  }

  function switchPageKey(id: string) {
    activePageKey = id as CmsLegalPageKey;
    applySelection();
  }

  function buildPagePayload(
    statusOverride?: "draft" | "published",
  ): CmsLegalPageInput {
    return {
      ...pageForm,
      pageKey: activePageKey,
      locale: activeLocale,
      status: statusOverride || pageForm.status,
      publishedAt:
        (statusOverride || pageForm.status) === "published"
          ? pageForm.publishedAt || new Date().toISOString()
          : null,
    };
  }

  async function savePage(statusOverride?: "draft" | "published") {
    savingPage = true;
    try {
      const payload = buildPagePayload(statusOverride);
      const saved = selectedPage
        ? await cmsApi.updateLegalPage(selectedPage.id, payload)
        : await cmsApi.createLegalPage(payload);

      await loadPages();
      activePageKey = saved.pageKey;
      activeLocale = (saved.locale as CmsLocale) ?? activeLocale;
      applySelection();
      toastService.success(
        saved.status === "published"
          ? "Legal page published."
          : "Legal page saved.",
      );
    } catch (error) {
      console.error("Failed to save legal page", error);
      toastService.error((error as Error).message || "Failed to save legal page.");
    } finally {
      savingPage = false;
    }
  }

  async function deleteSelectedPage() {
    if (!selectedPage) return;

    const confirmed = window.confirm(
      `Delete the ${activePageKey} page for locale ${activeLocale.toUpperCase()}?`,
    );
    if (!confirmed) return;

    deletingPage = true;
    try {
      await cmsApi.deleteLegalPage(selectedPage.id);
      toastService.success("Legal page deleted.");
      await loadPages();
      applySelection();
    } catch (error) {
      console.error("Failed to delete legal page", error);
      toastService.error((error as Error).message || "Failed to delete legal page.");
    } finally {
      deletingPage = false;
    }
  }

  const pageKeyToggleItems = $derived(
    LEGAL_PAGE_KEYS.map((key) => ({
      id: key,
      label: PAGE_LABELS[key][activeLocale],
    })),
  );
</script>

<SectionPanel title="Legal Pages" icon="scale">
  {#if loadingPages}
    <StateBlock variant="loading" message="Loading legal pages..." />
  {:else}
    <div class="legal-shell">
      <div class="legal-toolbar">
        <SegmentedToggle
          items={pageKeyToggleItems}
          activeId={activePageKey}
          onChange={switchPageKey}
          ariaLabel="Select legal page"
        />
        <SegmentedToggle
          items={LOCALE_TOGGLE_ITEMS}
          activeId={activeLocale}
          onChange={switchLocale}
          ariaLabel="Select locale"
        />
        <Badge
          tone={pageForm.status === "published" ? "positive" : "muted"}
          size="sm"
          label={pageForm.status}
        />
      </div>

      <div class="page-editor">
        <div class="editor-header">
          <div class="editor-header-copy">
            <h3>
              {PAGE_LABELS[activePageKey][activeLocale]} · {activeLocale.toUpperCase()}
            </h3>
            <p>
              Hero metadata controls the page header. The body is rendered with
              the same Markdown parser as blog posts — use <code>##</code> and
              <code>###</code> for section headings.
            </p>
          </div>
        </div>

        <div class="editor-shell">
          <div class="editor-main">
            <FormField label="Title">
              <input type="text" bind:value={pageForm.title} />
            </FormField>

            <FormField label="Lede" help="Short intro paragraph below the title.">
              <textarea bind:value={pageForm.lede} rows="3"></textarea>
            </FormField>

            <section class="body-section">
              <div class="body-section-head">
                <div>
                  <h4>Body</h4>
                  <p>
                    Structure the document with headings, lists, links, and
                    quotes. Same formatting as blog posts.
                  </p>
                </div>
              </div>

              <RichTextEditor
                bind:content={pageForm.body}
                format="markdown"
                minHeight="540px"
                showToolbar={true}
                toolbarMode="attached"
                allowMedia={false}
                showCharacterCount={true}
                characterLimit={50000}
                placeholder="Write the legal document body using headings, lists, links, and short paragraphs."
              />
            </section>
          </div>

          <div class="editor-sidebar">
            <FormField
              label="Eyebrow"
              help="Small label displayed above the title."
            >
              <input
                type="text"
                bind:value={pageForm.eyebrow}
                placeholder="Pflichtangaben"
              />
            </FormField>

            <FormField label="Meta description" help="Used for SEO and tab title.">
              <textarea
                bind:value={pageForm.description}
                rows="3"
                placeholder="Short description for search engines."
              ></textarea>
            </FormField>

            <div class="panel-actions">
              <Button
                variant="secondary"
                onclick={() => savePage("draft")}
                disabled={savingPage || deletingPage}
              >
                Save Draft
              </Button>
              <Button
                onclick={() => savePage("published")}
                disabled={savingPage || deletingPage}
              >
                Publish
              </Button>
              {#if selectedPage}
                <Button
                  variant="danger"
                  onclick={deleteSelectedPage}
                  disabled={savingPage || deletingPage}
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
  .legal-shell {
    display: grid;
    gap: 20px;
  }

  .legal-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .page-editor {
    border: 1px solid var(--aico-color-border-light, var(--field-border));
    border-radius: var(--blueprint-radius-lg, 16px);
    background: var(--surface-card, var(--aico-color-bg-primary));
    box-shadow: var(--shadow-sm);
    padding: 18px;
    display: grid;
    gap: 16px;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
  }

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

  .editor-header-copy code {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--surface-muted);
    font-size: 0.85em;
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

  .body-section {
    display: grid;
    gap: 12px;
  }

  .body-section-head h4 {
    margin: 0;
    font-size: 1rem;
  }

  .body-section-head p {
    margin: 4px 0 0;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    line-height: 1.5;
  }

  .panel-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  textarea,
  input {
    width: 100%;
  }

  textarea {
    min-height: 80px;
    font-family: inherit;
    line-height: 1.6;
  }

  @media (max-width: 1440px) {
    .editor-shell {
      grid-template-columns: 1fr;
    }
  }
</style>
