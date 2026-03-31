<script lang="ts">
  import { onMount } from "svelte";
  import {
    Badge,
    Button,
    SegmentedToggle,
    SectionPanel,
    StateBlock,
    toastService,
    isSuperAdmin,
  } from "@aico/blueprint";
  import { cmsApi, type CmsSiteContentRecord } from "../../api";
  import CmsContentEditor from "../CmsContentEditor.svelte";

  const CMS_LOCALES = ["en", "de"] as const;
  const LANDING_SECTION_ORDER = [
    "nav",
    "hero",
    "waveform",
    "howItWorks",
    "features",
    "useCases",
    "booking",
    "testimonials",
    "contact",
    "cta",
    "footer",
  ] as const;
  const LANDING_SECTION_META: Record<string, { label: string; description: string }> = {
    nav: { label: "Navigation", description: "Header labels, menu items, and top-level CTA copy." },
    hero: { label: "Hero", description: "Above-the-fold headline, supporting copy, and trust elements." },
    waveform: { label: "Phone Demo", description: "Interactive call demo labels, states, and consent messaging." },
    howItWorks: { label: "Launch Plan", description: "Rollout steps, body copy, and support-card language." },
    features: { label: "Platform", description: "Feature grid titles, descriptions, and supporting proof points." },
    useCases: { label: "Use Cases", description: "Use-case tabs, statistics, highlights, and customer quotes." },
    booking: { label: "Booking", description: "Booking section content and embedded widget messaging." },
    testimonials: { label: "Testimonials", description: "Customer proof, spotlight copy, and section framing." },
    contact: { label: "Contact", description: "Support channels, team blurbs, and highlight metadata." },
    cta: { label: "Closing CTA", description: "Final conversion block, form copy, and footnote messaging." },
    footer: { label: "Footer", description: "Footer links, legal text, and meta labels." },
  };
  const LOCALE_TOGGLE_ITEMS = CMS_LOCALES.map((localeCode) => ({
    id: localeCode,
    label: localeCode.toUpperCase(),
  }));

  type CmsLocale = (typeof CMS_LOCALES)[number];

  function formatJson(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2);
  }

  function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? {}));
  }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function countLeafFields(value: unknown): number {
    if (!isPlainObject(value)) {
      return value === undefined ? 0 : 1;
    }

    return Object.values(value).reduce<number>(
      (total, current) => total + countLeafFields(current),
      0,
    );
  }

  function sectionLabel(section: string): string {
    return LANDING_SECTION_META[section]?.label || section;
  }

  function setNestedValue(target: Record<string, unknown>, path: string[], nextValue: unknown) {
    if (path.length === 0) {
      return;
    }

    let cursor: Record<string, unknown> = target;
    for (let index = 0; index < path.length - 1; index += 1) {
      const segment = path[index];
      const existing = cursor[segment];
      if (!isPlainObject(existing)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[path[path.length - 1]] = nextValue;
  }

  let siteRecord = $state<CmsSiteContentRecord | null>(null);
  let siteContentByLocale = $state<Record<CmsLocale, Record<string, unknown>>>({
    en: {},
    de: {},
  });
  let activeCmsLocale = $state<CmsLocale>("en");
  let activeCmsSection = $state<string>("hero");
  let loadingSite = $state(true);
  let savingSite = $state(false);

  onMount(async () => {
    if (!$isSuperAdmin) {
      loadingSite = false;
      return;
    }

    await loadSiteContent();
  });

  async function loadSiteContent() {
    loadingSite = true;
    try {
      siteRecord = await cmsApi.getSiteContent();
      syncSiteContent(siteRecord.draftContent);
    } catch (error) {
      console.error("Failed to load site content", error);
      toastService.error("Failed to load site content.");
    } finally {
      loadingSite = false;
    }
  }

  function getAvailableSections() {
    const sectionSet = new Set<string>();

    for (const sectionKey of LANDING_SECTION_ORDER) {
      if (siteContentByLocale.en[sectionKey] || siteContentByLocale.de[sectionKey]) {
        sectionSet.add(sectionKey);
      }
    }

    for (const localeCode of CMS_LOCALES) {
      for (const sectionKey of Object.keys(siteContentByLocale[localeCode] || {})) {
        sectionSet.add(sectionKey);
      }
    }

    return [...sectionSet];
  }

  function ensureActiveSection(sectionCandidates?: string[]) {
    const sections = sectionCandidates || getAvailableSections();
    if (sections.length === 0) {
      activeCmsSection = "hero";
      return;
    }

    if (!sections.includes(activeCmsSection)) {
      activeCmsSection = sections[0];
    }
  }

  function syncSiteContent(content: Record<string, Record<string, unknown>> | undefined) {
    siteContentByLocale = {
      en: cloneJson(content?.en || {}),
      de: cloneJson(content?.de || {}),
    };

    ensureActiveSection();
  }

  function parseSiteContent() {
    const parsed = {} as Record<CmsLocale, Record<string, unknown>>;

    for (const localeCode of CMS_LOCALES) {
      const value = cloneJson(siteContentByLocale[localeCode] || {});
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Invalid ${localeCode.toUpperCase()} content structure.`);
      }

      parsed[localeCode] = value as Record<string, unknown>;
    }

    return parsed;
  }

  function updateSiteContentField(path: string[], nextValue: unknown) {
    const nextLocaleContent = cloneJson(siteContentByLocale[activeCmsLocale] || {});
    setNestedValue(nextLocaleContent, path, nextValue);

    siteContentByLocale = {
      ...siteContentByLocale,
      [activeCmsLocale]: nextLocaleContent,
    };
  }

  function getActiveSectionContent(): Record<string, unknown> {
    const current = siteContentByLocale[activeCmsLocale]?.[activeCmsSection];
    return isPlainObject(current) ? current : {};
  }

  async function saveSiteContent(action: "saveDraft" | "publish") {
    savingSite = true;
    try {
      const content = parseSiteContent();
      siteRecord =
        action === "publish"
          ? await cmsApi.publishSiteContent(content)
          : await cmsApi.saveSiteContentDraft(content);
      syncSiteContent(siteRecord.draftContent);
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
</script>

<SectionPanel
  title="Landing Copy"
  icon="layout-template"
>
  {#if loadingSite}
    <StateBlock variant="loading" message="Loading content document..." />
  {:else}
    <div class="locale-toolbar">
      <div class="locale-toolbar-main">
        <SegmentedToggle
          items={LOCALE_TOGGLE_ITEMS}
          activeId={activeCmsLocale}
          onChange={(id) => (activeCmsLocale = id as CmsLocale)}
          ariaLabel="Select content locale"
        />
        <div class="meta-line">
          <Badge
            tone={siteRecord?.publishedAt ? "positive" : "muted"}
            size="sm"
            label={siteRecord?.publishedAt ? "Published" : "Draft"}
          />
          <Badge tone="muted" size="sm" label={`${getAvailableSections().length} sections`} />
          {#if siteRecord?.updatedAt}
            <span>Updated {new Date(siteRecord.updatedAt).toLocaleString()}</span>
          {/if}
        </div>
      </div>
      <div class="panel-actions">
        <Button
          variant="secondary"
          onclick={() => saveSiteContent("saveDraft")}
          disabled={savingSite}
        >
          Save Draft
        </Button>
        <Button onclick={() => saveSiteContent("publish")} disabled={savingSite}>
          Publish
        </Button>
      </div>
    </div>

    {#if getAvailableSections().length === 0}
      <StateBlock variant="empty" message="No landing content sections found." />
    {:else}
      <div class="site-editor-shell">
        <div class="section-list">
          <div class="section-list-header">
            <h3>Sections</h3>
          </div>

          <div class="section-list-items">
            {#each getAvailableSections() as sectionKey}
              <button
                type="button"
                class="section-list-item"
                class:active={activeCmsSection === sectionKey}
                onclick={() => (activeCmsSection = sectionKey)}
              >
                <div class="section-list-item-head">
                  <strong>{sectionLabel(sectionKey)}</strong>
                  <Badge
                    tone={activeCmsSection === sectionKey ? "info" : "muted"}
                    size="sm"
                    label={`${countLeafFields(siteContentByLocale[activeCmsLocale]?.[sectionKey])} fields`}
                  />
                </div>
              </button>
            {/each}
          </div>
        </div>

        <div class="section-editor">
          <div class="section-editor-header">
            <h3>{sectionLabel(activeCmsSection)}</h3>
            <Badge
              tone="muted"
              size="sm"
              label={`${countLeafFields(getActiveSectionContent())} fields`}
            />
          </div>

          <div class="section-editor-meta">
            <span>
              {LANDING_SECTION_META[activeCmsSection]?.description ||
                "Edit the localized content for this section."}
            </span>
            <Badge tone="muted" size="sm" label={activeCmsLocale.toUpperCase()} />
          </div>

          <div class="section-editor-body">
            <CmsContentEditor
              value={getActiveSectionContent()}
              path={[activeCmsSection]}
              on:change={(event) => updateSiteContentField(event.detail.path, event.detail.value)}
            />

            <details class="json-preview">
              <summary>JSON Preview</summary>
              <pre>{formatJson(getActiveSectionContent())}</pre>
            </details>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</SectionPanel>

<style>
  .locale-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .locale-toolbar-main {
    display: grid;
    gap: 10px;
    min-width: 180px;
  }

  .meta-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    font-size: 13px;
  }

  .site-editor-shell {
    display: grid;
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }

  .section-list,
  .section-editor,
  .json-preview {
    border: 1px solid var(--aico-color-border-light, var(--field-border));
    border-radius: var(--blueprint-radius-lg, 16px);
    background: var(--surface-card, var(--aico-color-bg-primary));
    box-shadow: var(--shadow-sm);
  }

  .section-list,
  .section-editor {
    padding: 18px;
  }

  .section-list-header,
  .section-editor-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
    margin-bottom: 16px;
  }

  .section-list-header h3,
  .section-editor-header h3 {
    margin: 0;
  }

  .section-list {
    position: sticky;
    top: var(--blueprint-spacing-md, 16px);
  }

  .section-list-items {
    display: grid;
    gap: 12px;
  }

  .section-list-item {
    display: grid;
    gap: 0;
    padding: 12px 14px;
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

  .section-list-item.active {
    border-color: var(--field-border-focus, var(--accent-color-primary));
    box-shadow: inset 0 0 0 1px var(--field-border-focus, var(--accent-color-primary));
  }

  .section-list-item:hover {
    background: var(--field-bg-hover, var(--surface-secondary, var(--aico-color-bg-secondary)));
    border-color: var(--field-border-hover, var(--aico-color-border-medium));
  }

  .section-list-item-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 12px;
  }

  .section-list-item-head strong {
    color: var(--text-primary, var(--aico-color-text-primary));
  }

  .section-editor {
    display: grid;
    gap: 16px;
  }

  .section-editor-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    font-size: 13px;
    line-height: 1.5;
  }

  .section-editor-body {
    display: grid;
    gap: 16px;
    max-width: 980px;
  }

  .panel-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .json-preview {
    overflow: hidden;
  }

  .json-preview summary {
    cursor: pointer;
    padding: 12px 14px;
    font-weight: 600;
    background: var(--surface-secondary, var(--aico-color-bg-secondary));
    color: var(--text-primary, var(--aico-color-text-primary));
  }

  .json-preview pre {
    margin: 0;
    padding: 16px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.55;
    background: var(--surface-secondary, var(--aico-color-bg-secondary));
  }

  @media (max-width: 960px) {
    .site-editor-shell {
      grid-template-columns: 1fr;
    }

    .section-list {
      position: static;
    }
  }
</style>
