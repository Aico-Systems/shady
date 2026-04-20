<script lang="ts">
  import {
    PageLayout,
    StateBlock,
    currentPageQueryStore,
    isSuperAdmin,
  } from "@aico/blueprint";
  import LandingContentMode from "../components/content/LandingContentMode.svelte";
  import BlogPostsMode from "../components/content/BlogPostsMode.svelte";
  import LegalPagesMode from "../components/content/LegalPagesMode.svelte";

  const CONTENT_MODES = {
    landing: {
      id: "landing",
      label: "Landing",
      description: "Edit the locale-scoped landing document from one structured editorial surface.",
    },
    blog: {
      id: "blog",
      label: "Blog Posts",
      description: "Manage editorial drafts and published blog entries from a dedicated publishing surface.",
    },
    legal: {
      id: "legal",
      label: "Legal Pages",
      description: "Edit Impressum, Datenschutz, and AGB for each locale from a unified surface.",
    },
  } as const;

  type ContentMode = keyof typeof CONTENT_MODES;

  function isContentMode(value: string | undefined): value is ContentMode {
    return value === "landing" || value === "blog" || value === "legal";
  }

  const activeMode = $derived<ContentMode>(
    isContentMode($currentPageQueryStore.mode) ? $currentPageQueryStore.mode : "landing",
  );

  const activeModeMeta = $derived(CONTENT_MODES[activeMode]);

</script>

<PageLayout
  title="Content"
  description={activeModeMeta.description}
  maxWidth="full"
  spacing="md"
>
  {#if !$isSuperAdmin}
    <StateBlock
      variant="empty"
      message="Super admin access is required to manage global AICO content."
    />
  {:else if activeMode === "landing"}
    <LandingContentMode />
  {:else if activeMode === "blog"}
    <BlogPostsMode />
  {:else}
    <LegalPagesMode />
  {/if}
</PageLayout>
