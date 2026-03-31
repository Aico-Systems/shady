<script lang="ts">
  import CmsContentEditor from "./CmsContentEditor.svelte";
  import { createEventDispatcher } from "svelte";
  import { Badge, FormField, SegmentedToggle } from "@aico/blueprint";

  interface Props {
    value?: Record<string, unknown>;
    path?: string[];
    depth?: number;
  }

  let {
    value = {},
    path = [],
    depth = 0,
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    change: { path: string[]; value: unknown };
  }>();

  function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
    return !!candidate && typeof candidate === "object" && !Array.isArray(candidate);
  }

  function formatLabel(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function inferTextarea(value: string, key: string): boolean {
    const normalizedKey = key.toLowerCase();
    return (
      value.includes("\n") ||
      value.length > 120 ||
      ["body", "description", "quote", "consent", "lead", "note", "headline"].includes(normalizedKey)
    );
  }

  function inferRows(value: string): number {
    const lines = value.split("\n").length;
    if (lines >= 6) return Math.min(14, lines + 1);
    if (lines >= 3) return 6;
    return 4;
  }

  function updateField(key: string, nextValue: unknown) {
    dispatch("change", {
      path: [...path, key],
      value: nextValue
    });
  }

  function forwardChange(event: CustomEvent<{ path: string[]; value: unknown }>) {
    dispatch("change", event.detail);
  }

  function formatPath(key: string): string {
    return [...path, key].join(".");
  }

  function entriesOf(record: Record<string, unknown>) {
    return Object.entries(record);
  }

  function isStringMap(record: Record<string, unknown>): boolean {
    const entries = entriesOf(record);
    return entries.length > 0 && entries.every(([, item]) => typeof item === "string");
  }

  function countLeafFields(candidate: unknown): number {
    if (!isPlainObject(candidate)) {
      return candidate === undefined ? 0 : 1;
    }

    return Object.values(candidate).reduce<number>(
      (total, current) => total + countLeafFields(current),
      0,
    );
  }

  function shouldSpanWide(key: string, fieldValue: unknown): boolean {
    return (
      typeof fieldValue !== "string" ||
      inferTextarea(fieldValue, key)
    );
  }

  const pathId = $derived(path.join("."));
  const recordEntries = $derived(entriesOf(value));
  const activeToggleItems = $derived(
    recordEntries.map(([key], index) => ({
      id: key,
      label: formatLabel(key),
      badge: `${index + 1}`,
    })),
  );

  const rendersCardGrid = $derived(
    isStringMap(value) &&
      [
        "hero.actions",
        "hero.list",
        "hero.metrics",
        "nav.sections",
        "footer.links",
        "footer.hrefs",
        "footer.columns",
        "cta.perks",
        "cta.panelItems",
      ].includes(pathId),
  );

  const rendersTabbedCollection = $derived(
    pathId === "useCases.items" || pathId === "testimonials.items",
  );

  let activeCollectionKey = $state("");

  $effect(() => {
    if (!rendersTabbedCollection) return;

    const validKeys = recordEntries.map(([key]) => key);
    if (validKeys.length === 0) {
      activeCollectionKey = "";
      return;
    }

    if (!validKeys.includes(activeCollectionKey)) {
      activeCollectionKey = validKeys[0];
    }
  });
</script>

<div class:root-level={depth === 0} class="content-tree">
  {#if rendersCardGrid}
    <div class="card-grid">
      {#each recordEntries as [key, fieldValue]}
        <div class="map-card">
          <div class="map-card-head">
            <div>
              <Badge eyebrow label={formatLabel(key)} size="sm" />
              <p>{formatPath(key)}</p>
            </div>
          </div>

          <FormField label={formatLabel(key)}>
            <input
              type="text"
              value={fieldValue as string}
              oninput={(event) =>
                updateField(key, (event.currentTarget as HTMLInputElement).value)}
            />
          </FormField>
        </div>
      {/each}
    </div>
  {:else if rendersTabbedCollection}
    <div class="collection-shell">
      <div class="collection-toolbar">
        <SegmentedToggle
          items={activeToggleItems}
          activeId={activeCollectionKey}
          onChange={(id) => (activeCollectionKey = id)}
          fullWidth
          ariaLabel={`Select ${pathId} entry`}
        />
      </div>

      {#if activeCollectionKey}
        <div class="collection-card">
          <div class="collection-card-head">
            <div>
              <Badge eyebrow label={formatLabel(activeCollectionKey)} size="sm" />
              <h4>{formatLabel(activeCollectionKey)}</h4>
              <p>{[...path, activeCollectionKey].join(".")}</p>
            </div>
            <Badge
              tone="muted"
              size="sm"
              label={`${countLeafFields(value[activeCollectionKey])} fields`}
            />
          </div>

          <CmsContentEditor
            value={(value[activeCollectionKey] as Record<string, unknown>) || {}}
            path={[...path, activeCollectionKey]}
            depth={depth + 1}
            on:change={forwardChange}
          />
        </div>
      {/if}
    </div>
  {:else}
    {#each recordEntries as [key, fieldValue]}
      {#if isPlainObject(fieldValue)}
        <details class="group-card" open>
          <summary>
            <div class="summary-copy">
              <span>{formatLabel(key)}</span>
              <p>{formatPath(key)}</p>
            </div>
            <Badge
              tone="muted"
              size="sm"
              label={`${countLeafFields(fieldValue)} fields`}
            />
          </summary>

          <div class="group-body">
            <CmsContentEditor
              value={fieldValue}
              path={[...path, key]}
              depth={depth + 1}
              on:change={forwardChange}
            />
          </div>
        </details>
      {:else if typeof fieldValue === "string"}
        <div class="field-card" class:wide={shouldSpanWide(key, fieldValue)}>
          <FormField label={formatLabel(key)}>
            {#if inferTextarea(fieldValue, key)}
              <textarea
                value={fieldValue}
                rows={inferRows(fieldValue)}
                oninput={(event) =>
                  updateField(key, (event.currentTarget as HTMLTextAreaElement).value)}
              ></textarea>
            {:else}
              <input
                type="text"
                value={fieldValue}
                oninput={(event) =>
                  updateField(key, (event.currentTarget as HTMLInputElement).value)}
              />
            {/if}
          </FormField>
        </div>
      {:else}
        <div class="field-card wide">
          <FormField label={formatLabel(key)} help={`${formatPath(key)} · JSON fallback`}>
            <textarea
              rows="6"
              value={JSON.stringify(fieldValue ?? null, null, 2)}
              oninput={(event) => {
                const nextRawValue = (event.currentTarget as HTMLTextAreaElement).value;
                try {
                  updateField(key, JSON.parse(nextRawValue));
                } catch {
                  updateField(key, nextRawValue);
                }
              }}
            ></textarea>
          </FormField>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .content-tree {
    display: grid;
    gap: 12px;
  }

  .root-level {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    align-items: start;
  }

  .group-card,
  .field-card,
  .map-card,
  .collection-card {
    border: 1px solid var(--aico-color-border-light, var(--field-border));
    border-radius: var(--blueprint-radius-lg, 16px);
    background: var(--surface-card, var(--aico-color-bg-primary));
    box-shadow: var(--shadow-sm);
  }

  .group-card {
    padding: 0;
    overflow: hidden;
  }

  .group-card summary {
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 12px 14px;
    cursor: pointer;
    font-weight: 600;
    background: var(--surface-secondary, var(--aico-color-bg-secondary));
  }

  .group-card summary::-webkit-details-marker {
    display: none;
  }

  .summary-copy {
    min-width: 0;
  }

  .summary-copy span {
    display: block;
    color: var(--text-primary, var(--aico-color-text-primary));
  }

  .summary-copy p {
    margin: 4px 0 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary, var(--aico-color-text-secondary));
  }

  .group-body,
  .field-card,
  .map-card,
  .collection-card {
    padding: 14px;
  }

  textarea,
  input {
    width: 100%;
  }

  textarea {
    min-height: 96px;
    line-height: 1.55;
    font-family: inherit;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .root-level > .group-card,
  .root-level > .collection-shell,
  .root-level > .card-grid,
  .root-level > .field-card.wide {
    grid-column: 1 / -1;
  }

  .map-card-head,
  .collection-card-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .map-card-head p,
  .collection-card-head p {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--text-secondary, var(--aico-color-text-secondary));
  }

  .collection-shell {
    display: grid;
    gap: 14px;
  }

  .collection-toolbar {
    display: flex;
  }

  .collection-card-head h4 {
    margin: 8px 0 0;
    font-size: 1rem;
    color: var(--text-primary, var(--aico-color-text-primary));
  }

  @media (max-width: 720px) {
    .root-level,
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
