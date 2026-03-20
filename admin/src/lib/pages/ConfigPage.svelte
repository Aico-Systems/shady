<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { configApi, type BookingConfig } from '../api';
  import { canManageConfig } from '../permissions';
  import { t } from '../../i18n';
  import runtimeConfig from '../config';
  import {
    toastService,
    PageLayout,
    SectionPanel,
    Button,
    FormField,
    Toggle,
    IconButton,
    Badge,
    StateBlock,
  } from '@aico/blueprint';

  let config = $state<BookingConfig | null>(null);
  let loading = $state(true);
  let saving = $state(false);

  let widgetActions = $derived([
    {
      label: get(t)('actions.copyCode'),
      onClick: copyEmbedCode,
      icon: 'copy',
      variant: 'secondary' as const,
    },
  ]);

  let fieldActions = $derived(
    $canManageConfig
      ? [
          {
            label: get(t)('pages.config.fields.addField'),
            onClick: addVisitorField,
            icon: 'plus',
            variant: 'secondary' as const,
          },
        ]
      : [],
  );

  const fieldTypes = ['text', 'email', 'tel', 'textarea', 'select'] as const;
  const durationOptions = [15, 30, 45, 60];

  onMount(async () => {
    await loadConfig();
  });

  async function loadConfig() {
    try {
      config = await configApi.get();
    } catch (error) {
      console.error('Failed to load config:', error);
      toastService.error(get(t)('pages.config.notifications.loadError'));
      config = {
        organizationId: '',
        visitorFields: [
          { name: 'name', label: 'Full Name', type: 'text', required: true },
          { name: 'email', label: 'Email Address', type: 'email', required: true },
          { name: 'phone', label: 'Phone Number', type: 'tel', required: false },
        ],
        bookingDurationMinutes: 30,
        advanceBookingDays: 30,
        bufferMinutes: 0,
        emailEnabled: true,
      };
    } finally {
      loading = false;
    }
  }

  function addVisitorField() {
    if (!config) return;
    config.visitorFields = [
      ...config.visitorFields,
      {
        name: `field_${Date.now()}`,
        label: 'New Field',
        type: 'text',
        required: false,
      },
    ];
  }

  function removeVisitorField(index: number) {
    if (!config) return;
    config.visitorFields = config.visitorFields.filter((_, i) => i !== index);
  }

  function moveFieldUp(index: number) {
    if (!config || index === 0) return;
    const fields = [...config.visitorFields];
    [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
    config.visitorFields = fields;
  }

  function moveFieldDown(index: number) {
    if (!config || index === config.visitorFields.length - 1) return;
    const fields = [...config.visitorFields];
    [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
    config.visitorFields = fields;
  }

  async function saveConfig() {
    if (!config) return;
    saving = true;
    try {
      await configApi.update({
        visitorFields: config.visitorFields,
        bookingDurationMinutes: config.bookingDurationMinutes,
        advanceBookingDays: config.advanceBookingDays,
        bufferMinutes: config.bufferMinutes,
        emailEnabled: config.emailEnabled,
      });
      toastService.success(get(t)('pages.config.notifications.saveSuccess'));
    } catch (error) {
      console.error('Failed to save config:', error);
      toastService.error(get(t)('pages.config.notifications.saveError'));
    } finally {
      saving = false;
    }
  }

  async function copyEmbedCode() {
    if (!config) return;
    const code = `<script src="${runtimeConfig.WIDGET_URL}/widget.js"><\/script>\n\n<ac-booking org-id="${config.bookingSlug || config.organizationId}" api-url="${runtimeConfig.API_URL}"></ac-booking>`;
    await navigator.clipboard.writeText(code);
    toastService.success(get(t)('pages.config.notifications.codeCopied'));
  }
</script>

<PageLayout
  title={$t('pages.config.title')}
  description={$t('pages.config.subtitle')}
  maxWidth="full"
  spacing="md"
>
  {#if loading}
    <SectionPanel>
      <StateBlock variant="loading" message={$t('states.initializing')} />
    </SectionPanel>
  {:else if config}
    <SectionPanel
      title={$t('pages.config.widget.title')}
      subtitle={$t('pages.config.widget.subtitle')}
      icon="code-2"
      actions={widgetActions}
    >

      <FormField
        label={$t('pages.config.widget.slugLabel')}
        help={$t('pages.config.widget.slugHelp')}
      >
        <input
          id="booking-slug"
          type="text"
          bind:value={config.bookingSlug}
          placeholder="my-company"
          pattern="[a-z0-9-]+"
          disabled={!$canManageConfig}
        />
      </FormField>

      <div class="widget-code">
        <pre><code>&lt;script src="{runtimeConfig.WIDGET_URL}/widget.js"&gt;&lt;/script&gt;

&lt;ac-booking
  org-id="{config.bookingSlug || config.organizationId}"
&gt;&lt;/ac-booking&gt;</code></pre>
      </div>
    </SectionPanel>

    <SectionPanel
      title={$t('pages.config.fields.title')}
      subtitle={$t('pages.config.fields.subtitle')}
      icon="list-ordered"
      actions={fieldActions}
    >

      {#if config.visitorFields.length === 0}
        <StateBlock variant="empty" message={$t('pages.config.fields.empty')} />
      {:else}
        <div class="field-stack">
          {#each config.visitorFields as field, index}
            <div class="field-item">
              <div class="field-item-header">
                <Badge tone="muted" size="sm" label={`#${index + 1}`} mono />
                <div class="field-order-actions">
                  <IconButton
                    icon="arrow-up"
                    label="Move up"
                    variant="soft"
                    size="sm"
                    onClick={() => moveFieldUp(index)}
                    disabled={index === 0 || !$canManageConfig}
                  />
                  <IconButton
                    icon="arrow-down"
                    label="Move down"
                    variant="soft"
                    size="sm"
                    onClick={() => moveFieldDown(index)}
                    disabled={index === config.visitorFields.length - 1 || !$canManageConfig}
                  />
                </div>
              </div>

              <div class="field-grid">
                <FormField label={$t('pages.config.fields.fieldName')}>
                  <input
                    id={`field-name-${index}`}
                    type="text"
                    bind:value={field.name}
                    placeholder="field_name"
                    disabled={!$canManageConfig}
                  />
                </FormField>

                <FormField label={$t('pages.config.fields.fieldLabel')}>
                  <input
                    id={`field-label-${index}`}
                    type="text"
                    bind:value={field.label}
                    placeholder="Full name"
                    disabled={!$canManageConfig}
                  />
                </FormField>

                <FormField label={$t('pages.config.fields.fieldType')}>
                  <select id={`field-type-${index}`} bind:value={field.type} disabled={!$canManageConfig}>
                    {#each fieldTypes as type}
                      <option value={type}>{$t(`pages.config.fields.types.${type}`)}</option>
                    {/each}
                  </select>
                </FormField>

                <div class="field-toggle-wrap">
                  <Toggle
                    checked={field.required}
                    onChange={(checked) => (field.required = checked)}
                    label={$t('pages.config.fields.required')}
                    disabled={!$canManageConfig}
                    size="sm"
                  />
                </div>
              </div>

              {#if $canManageConfig}
                <div class="field-item-remove">
                  <IconButton
                    icon="x"
                    label="Remove field"
                    tone="danger"
                    variant="soft"
                    size="sm"
                    onClick={() => removeVisitorField(index)}
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </SectionPanel>

    <SectionPanel title={$t('pages.config.booking.title')} subtitle={$t('pages.config.booking.subtitle')} icon="calendar-clock">
      <div class="settings-grid">
        <FormField label={$t('pages.config.booking.duration')} help={$t('pages.config.booking.durationHelp')}>
          <select id="booking-duration" bind:value={config.bookingDurationMinutes} disabled={!$canManageConfig}>
            {#each durationOptions as duration}
              <option value={duration}>{duration} min</option>
            {/each}
          </select>
        </FormField>

        <FormField
          label={$t('pages.config.booking.advanceWindow')}
          help={$t('pages.config.booking.advanceHelp')}
        >
          <input
            id="booking-advance-window"
            type="number"
            bind:value={config.advanceBookingDays}
            min="1"
            max="365"
            disabled={!$canManageConfig}
          />
        </FormField>

        <FormField label={$t('pages.config.booking.buffer')} help={$t('pages.config.booking.bufferHelp')}>
          <input
            id="booking-buffer"
            type="number"
            bind:value={config.bufferMinutes}
            min="0"
            max="60"
            step="5"
            disabled={!$canManageConfig}
          />
        </FormField>
      </div>
    </SectionPanel>

    <SectionPanel title={$t('pages.config.email.title')} subtitle={$t('pages.config.email.subtitle')} icon="mail">
      <Toggle
        checked={config.emailEnabled}
        onChange={(checked) => (config && (config.emailEnabled = checked))}
        label={$t('pages.config.email.toggle')}
        helpText={$t('pages.config.email.toggleHelp')}
        disabled={!$canManageConfig}
      />

      {#if !config.emailEnabled}
        <StateBlock
          variant="empty"
          title={$t('pages.config.email.disabled')}
          message={$t('pages.config.email.disabledHelp')}
        />
      {:else}
        <StateBlock
          variant="empty"
          title={$t('pages.config.email.enabled')}
          message={$t('pages.config.email.enabledHelp')}
        />
      {/if}
    </SectionPanel>

    <SectionPanel>
      {#if $canManageConfig}
        <div class="save-actions">
          <Button variant="primary" icon="settings-2" onclick={saveConfig} loading={saving}>
            {saving ? $t('pages.config.save.saving') : $t('pages.config.save.cta')}
          </Button>
        </div>
      {:else}
        <StateBlock
          variant="empty"
          title={$t('pages.config.readonly.title')}
          message={$t('pages.config.readonly.message')}
        />
      {/if}
    </SectionPanel>
  {/if}
</PageLayout>

<style>
  .widget-code {
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-md);
    background: var(--aico-color-bg-secondary);
    padding: var(--blueprint-spacing-md);
  }

  .widget-code pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--aico-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.85rem;
  }

  .field-stack {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-sm);
  }

  .field-item {
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-md);
    padding: var(--blueprint-spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-sm);
  }

  .field-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--blueprint-spacing-sm);
  }

  .field-order-actions {
    display: flex;
    gap: var(--blueprint-spacing-xs);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--blueprint-spacing-sm);
    align-items: end;
  }

  .field-toggle-wrap {
    display: flex;
    align-items: center;
    padding-bottom: 2px;
  }

  .field-item-remove {
    display: flex;
    justify-content: flex-end;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--blueprint-spacing-sm);
  }

  .save-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
