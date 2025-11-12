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
    gap: 1rem;
  }

  header h3 {
    margin: 0;
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  label {
    font-weight: 600;
  }

  .optional {
    color: var(--aico-color-text-tertiary);
    font-size: 0.75rem;
    margin-left: 0.35rem;
  }

  input,
  textarea {
    border-radius: 14px;
    border: 1px solid var(--aico-color-border-light);
    background: color-mix(in srgb, var(--aico-color-bg-primary) 95%, transparent);
    padding: 0.75rem;
    font: inherit;
    transition: var(--transition-all);
    color: var(--aico-color-text-primary);
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--aico-mint);
    box-shadow: 0 0 0 3px rgba(var(--aico-mint-rgb), 0.25);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--aico-color-text-tertiary);
  }

  .error {
    font-size: 0.8rem;
    color: var(--aico-danger);
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .ghost {
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 80%, transparent);
    padding: 0.6rem 1.1rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 70%, transparent);
    cursor: pointer;
    transition: var(--transition-button);
  }

  .ghost:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--aico-mint) 35%, var(--aico-color-border-light));
  }

  .ghost:focus-visible {
    outline: 2px solid rgba(var(--aico-mint-rgb), 0.5);
    outline-offset: 2px;
  }

  .btn-primary {
    border: none;
    border-radius: 999px;
    padding: 0.6rem 1.4rem;
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 12px 24px rgba(var(--aico-mint-rgb), 0.35);
    transition: var(--transition-button);
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
