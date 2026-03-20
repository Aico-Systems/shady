<script lang="ts">
  'use runes';
  import type { BookingConfig } from '../lib/bookingApi';
  import { get } from 'svelte/store';
  import { t } from '../../i18n';

  export interface Props {
    config: BookingConfig;
    visitorData: {
      name?: string;
      email: string;
      phone?: string;
      [key: string]: any;
    };
    notes?: string;
    onSubmit: () => void;
    onBack: () => void;
    submitting?: boolean;
  }

  let {
    config,
    visitorData = $bindable({ email: '' }),
    notes = $bindable(''),
    onSubmit,
    onBack,
    submitting = false,
  }: Props = $props();

  let errors = $state<Record<string, string>>({});

  function validate(): boolean {
    errors = {};
    let isValid = true;
    const translator = get(t);

    for (const field of config.visitorFields) {
      const value = visitorData[field.name];
      if (field.required && !value) {
        errors[field.name] = translator('widget.form.errorRequired', { values: { field: field.label } });
        isValid = false;
      }

      if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors[field.name] = translator('widget.form.errorEmail');
          isValid = false;
        }
      }
    }

    return isValid;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (validate()) {
      onSubmit();
    }
  }
</script>

<form class="booking-form" onsubmit={handleSubmit}>
  <header>
    <p class="eyebrow">{$t('widget.steps.details')}</p>
    <h3>{$t('widget.form.title')}</h3>
  </header>

  <div class="form-fields">
    {#each config.visitorFields as field}
      <div class="form-group">
        <label for={field.name}>
          {field.label}
          {#if !field.required}
            <span class="optional">({$t('widget.form.optional')})</span>
          {/if}
        </label>

        {#if field.type === 'textarea'}
          <textarea
            id={field.name}
            bind:value={visitorData[field.name]}
            rows="3"
            required={field.required}
          ></textarea>
        {:else}
          <input
            id={field.name}
            type={field.type}
            bind:value={visitorData[field.name]}
            required={field.required}
          />
        {/if}

        {#if errors[field.name]}
          <span class="error">{errors[field.name]}</span>
        {/if}
      </div>
    {/each}

    <div class="form-group">
      <label for="notes">
        {$t('widget.form.notes')}
        <span class="optional">({$t('widget.form.optional')})</span>
      </label>
      <textarea
        id="notes"
        bind:value={notes}
        rows="4"
        placeholder={$t('widget.form.notesPlaceholder')}
      ></textarea>
    </div>
  </div>

  <div class="form-actions">
    <button type="button" class="ghost" onclick={onBack} disabled={submitting}>
      {$t('actions.back')}
    </button>
    <button type="submit" class="btn-primary" disabled={submitting}>
      {submitting ? $t('actions.confirm') + '…' : $t('actions.confirm')}
    </button>
  </div>
</form>

<style>

  .booking-form {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--widget-text-muted);
  }

  header h3 {
    margin: 0;
    font-size: 1.35rem;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--widget-text-heading);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border-radius: var(--widget-radius-md);
    background: var(--widget-surface-panel-strong);
    border: 1px solid var(--widget-border-subtle);
    box-shadow: none;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 600;
    color: var(--widget-text-heading);
    letter-spacing: -0.01em;
    font-size: 0.96rem;
  }

  .optional {
    color: var(--widget-text-muted);
    font-size: 0.74rem;
    margin-left: 0.35rem;
  }

  input,
  textarea {
    border-radius: var(--widget-radius-sm);
    border: 1px solid var(--widget-border-subtle);
    background: var(--widget-surface-field);
    padding: 0.8rem 0.9rem;
    min-height: var(--widget-control-height);
    font: inherit;
    transition: var(--transition-all);
    color: var(--widget-text-heading);
    box-shadow: none;
  }

  textarea {
    min-height: 8.5rem;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--widget-border-strong);
    box-shadow: 0 0 0 3px var(--widget-focus-ring);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--widget-text-muted);
  }

  .error {
    font-size: 0.8rem;
    color: var(--widget-text-danger);
  }

  .form-actions {
    display: flex;
    gap: 0.65rem;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: 0.25rem;
  }

  .ghost {
    border: 1px solid var(--widget-button-secondary-border);
    padding: 0 1.1rem;
    min-height: var(--widget-control-height);
    border-radius: var(--widget-radius-sm);
    background: var(--widget-button-secondary-bg);
    cursor: pointer;
    transition: var(--transition-button);
    color: var(--widget-button-secondary-text);
    font-weight: 600;
  }

  .ghost:hover:not(:disabled) {
    border-color: var(--widget-button-secondary-border-hover);
    background: var(--widget-button-secondary-bg-hover);
  }

  .ghost:focus-visible {
    outline: 2px solid var(--widget-focus-ring);
    outline-offset: 2px;
  }

  .btn-primary {
    border: 1px solid var(--widget-button-primary-bg);
    border-radius: var(--widget-radius-sm);
    padding: 0 1.35rem;
    min-height: var(--widget-control-height);
    background: var(--widget-button-primary-bg);
    color: var(--widget-button-primary-text);
    font-weight: 600;
    cursor: pointer;
    box-shadow: none;
    transition: var(--transition-button);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--widget-button-primary-bg-hover);
    border-color: var(--widget-button-primary-bg-hover);
  }

  .btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    box-shadow: none;
  }

  @media (max-width: 520px) {
    .form-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>
