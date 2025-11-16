<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { configApi, type BookingConfig } from '../api';
  import { canManageConfig } from '../auth';
  import { t } from '../../i18n';
  import { Copy, Settings2 } from '@lucide/svelte';
  import { toastService } from '@aico/blueprint';

  let config = $state<BookingConfig | null>(null);
  let loading = $state(true);
  let saving = $state(false);

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
    const code = `<script src="http://localhost:5174/widget.js"><\/script>

<ac-booking org-id="${config.bookingSlug || config.organizationId}" api-url="http://localhost:5006"></ac-booking>`;
    await navigator.clipboard.writeText(code);
    toastService.success(get(t)('pages.config.notifications.codeCopied'));
  }
</script>

<div class="page config-page">
  <div class="page-content">
    <section class="page-surface">
      <header class="page-header surface-toolbar">
        <div class="surface-header">
          <p class="eyebrow">{$t('navigation.config')}</p>
          <h1>{$t('pages.config.title')}</h1>
          <p>{$t('pages.config.subtitle')}</p>
        </div>
      </header>
    </section>

    {#if loading}
      <section class="page-surface">
        <div class="loading">{$t('states.initializing')}</div>
      </section>
    {:else if config}
      <div class="config-container">
        <section class="config-section page-surface">
          <div class="section-header">
            <h2>{$t('pages.config.widget.title')}</h2>
            <p>{$t('pages.config.widget.subtitle')}</p>
          </div>

          <div class="form-group">
            <label for="booking-slug">{$t('pages.config.widget.slugLabel')}</label>
            <input
              id="booking-slug"
              type="text"
              bind:value={config.bookingSlug}
              placeholder="my-company"
              pattern="[a-z0-9-]+"
              disabled={!$canManageConfig}
            />
            <small class="help-text">{$t('pages.config.widget.slugHelp')}</small>
          </div>

          <div class="widget-code">
            <div class="widget-code__header">
              <span>{$t('pages.config.widget.embedLabel')}</span>
              <button class="ghost" type="button" onclick={copyEmbedCode}>
                <Copy size={16} />
                {$t('actions.copyCode')}
              </button>
            </div>
            <pre><code>&lt;script src="http://localhost:5174/widget.js"&gt;&lt;/script&gt;

&lt;ac-booking 
  org-id="{config.bookingSlug || config.organizationId}" 
  api-url="http://localhost:5006"
&gt;&lt;/ac-booking&gt;</code></pre>
          </div>
        </section>

        <section class="config-section page-surface">
          <div class="section-header">
            <h2>{$t('pages.config.fields.title')}</h2>
            <p>{$t('pages.config.fields.subtitle')}</p>
          </div>

          <div class="fields-editor">
            {#if config.visitorFields.length === 0}
              <div class="empty-state-small">
                {$t('pages.config.fields.empty')}
              </div>
            {:else}
              {#each config.visitorFields as field, index}
                <div class="field-item">
                  <div class="field-index">
                    <span>#{index + 1}</span>
                    <div class="field-order">
                      <button type="button" onclick={() => moveFieldUp(index)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onclick={() => moveFieldDown(index)}
                        disabled={index === config.visitorFields.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  <div class="field-controls">
                    <div class="form-row">
                      <div class="form-group">
                        <label>{$t('pages.config.fields.fieldName')}</label>
                        <input
                          type="text"
                          bind:value={field.name}
                          placeholder="field_name"
                          disabled={!$canManageConfig}
                        />
                      </div>
                      <div class="form-group">
                        <label>{$t('pages.config.fields.fieldLabel')}</label>
                        <input
                          type="text"
                          bind:value={field.label}
                          placeholder="Full name"
                          disabled={!$canManageConfig}
                        />
                      </div>
                      <div class="form-group">
                        <label>{$t('pages.config.fields.fieldType')}</label>
                        <select bind:value={field.type} disabled={!$canManageConfig}>
                          {#each fieldTypes as type}
                            <option value={type}>{$t(`pages.config.fields.types.${type}`)}</option>
                          {/each}
                        </select>
                      </div>
                      <div class="form-group checkbox-group">
                        <label>
                          <input type="checkbox" bind:checked={field.required} disabled={!$canManageConfig} />
                          {$t('pages.config.fields.required')}
                        </label>
                      </div>
                    </div>
                  </div>

                  {#if $canManageConfig}
                    <button class="icon-only" type="button" onclick={() => removeVisitorField(index)}>
                      ✕
                    </button>
                  {/if}
                </div>
              {/each}
            {/if}

            {#if $canManageConfig}
              <button class="btn-secondary" type="button" onclick={addVisitorField}>
                {$t('pages.config.fields.addField')}
              </button>
            {/if}
          </div>
        </section>

        <section class="config-section page-surface">
          <div class="section-header">
            <h2>{$t('pages.config.booking.title')}</h2>
            <p>{$t('pages.config.booking.subtitle')}</p>
          </div>

          <div class="settings-grid">
            <div class="form-group">
              <label>{$t('pages.config.booking.duration')}</label>
              <select bind:value={config.bookingDurationMinutes} disabled={!$canManageConfig}>
                {#each durationOptions as duration}
                  <option value={duration}>{duration} min</option>
                {/each}
              </select>
              <small class="help-text">{$t('pages.config.booking.durationHelp')}</small>
            </div>

            <div class="form-group">
              <label>{$t('pages.config.booking.advanceWindow')}</label>
              <input
                type="number"
                bind:value={config.advanceBookingDays}
                min="1"
                max="365"
                disabled={!$canManageConfig}
              />
              <small class="help-text">{$t('pages.config.booking.advanceHelp')}</small>
            </div>

            <div class="form-group">
              <label>{$t('pages.config.booking.buffer')}</label>
              <input
                type="number"
                bind:value={config.bufferMinutes}
                min="0"
                max="60"
                step="5"
                disabled={!$canManageConfig}
              />
              <small class="help-text">{$t('pages.config.booking.bufferHelp')}</small>
            </div>
          </div>
        </section>

        <section class="config-section page-surface">
          <div class="section-header">
            <h2>{$t('pages.config.email.title')}</h2>
            <p>{$t('pages.config.email.subtitle')}</p>
          </div>

          <label class="email-toggle">
            <input type="checkbox" bind:checked={config.emailEnabled} disabled={!$canManageConfig} />
            <span>
              <strong>{$t('pages.config.email.toggle')}</strong>
              <small>{$t('pages.config.email.toggleHelp')}</small>
            </span>
          </label>

          {#if !config.emailEnabled}
            <div class="info-box warning">
              <strong>{$t('pages.config.email.disabled')}</strong>
              <p>{$t('pages.config.email.disabledHelp')}</p>
            </div>
          {:else}
            <div class="info-box success">
              <strong>{$t('pages.config.email.enabled')}</strong>
              <p>{$t('pages.config.email.enabledHelp')}</p>
            </div>
          {/if}
        </section>

        <section class="config-section page-surface">
          {#if $canManageConfig}
            <div class="surface-actions end">
              <button class="btn-primary" type="button" onclick={saveConfig} disabled={saving}>
                <Settings2 size={18} />
                <span>{saving ? $t('pages.config.save.saving') : $t('pages.config.save.cta')}</span>
              </button>
            </div>
          {:else}
            <div class="info-box warning">
              <strong>{$t('pages.config.readonly.title')}</strong>
              <p>{$t('pages.config.readonly.message')}</p>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<style>
  .config-container {
    display: flex;
    flex-direction: column;
    gap: var(--page-stack-gap);
  }

  .section-header h2 {
    margin: 0 0 0.35rem 0;
  }

  .fields-editor {
    display: flex;
    flex-direction: column;
    gap: var(--component-gap);
  }

  .field-item {
    border: 1px solid var(--aico-color-border-light);
    border-radius: 18px;
    padding: 1rem;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--component-gap);
    align-items: center;
    background: color-mix(in srgb, var(--aico-color-bg-primary) 96%, transparent);
  }

  .field-index {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .field-order button {
    border: none;
    background: color-mix(in srgb, var(--aico-grey-300) 20%, transparent);
    border-radius: 10px;
    width: 32px;
    height: 32px;
    font-weight: 700;
  }

  .field-controls {
    width: 100%;
  }

  .checkbox-group label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-weight: 600;
  }

  .widget-code__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .widget-code pre {
    margin: 0;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .email-toggle {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    border: 1px solid var(--aico-color-border-light);
    border-radius: 16px;
    padding: 1rem;
  }

  .email-toggle input {
    margin-top: 0.4rem;
  }

  .info-box {
    border-radius: 16px;
    padding: 1rem 1.25rem;
    margin-top: 1rem;
    border: 1px solid var(--aico-color-border-light);
  }

  .info-box.warning {
    background: rgba(var(--aico-warning-rgb), 0.12);
    border-color: rgba(var(--aico-warning-rgb), 0.4);
  }

  .info-box.success {
    background: rgba(var(--aico-success-rgb), 0.12);
    border-color: rgba(var(--aico-success-rgb), 0.3);
  }

</style>
