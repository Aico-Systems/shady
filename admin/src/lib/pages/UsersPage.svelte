<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { usersApi, availabilityApi, type BookingUser, type AvailabilityRule } from '../api';
  import { canManageUsers, canConnectCalendar } from '../auth';
  import { t } from '../../i18n';
  import { Plus, CalendarRange, Link2 } from '@lucide/svelte';

  let users = $state<BookingUser[]>([]);
  let loading = $state(true);
  let selectedUser = $state<BookingUser | null>(null);
  let showAvailabilityModal = $state(false);
  let showCreateUserModal = $state(false);
  let availabilityRules = $state<AvailabilityRule[]>([]);
  let savingAvailability = $state(false);
  let creatingUser = $state(false);

  let newUser = $state({
    email: '',
    displayName: '',
    timezone: 'UTC',
  });

  const daysOfWeek = [
    { value: 0, labelKey: 'sunday' },
    { value: 1, labelKey: 'monday' },
    { value: 2, labelKey: 'tuesday' },
    { value: 3, labelKey: 'wednesday' },
    { value: 4, labelKey: 'thursday' },
    { value: 5, labelKey: 'friday' },
    { value: 6, labelKey: 'saturday' },
  ] as const;

  onMount(async () => {
    await syncCurrentUser();
    await loadUsers();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('google-connected') === 'true') {
      alert(get(t)('pages.users.notifications.googleConnected'));
      window.history.replaceState({}, '', window.location.pathname);
      await loadUsers();
    }
  });

  async function syncCurrentUser() {
    try {
      const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5006';
      const response = await fetch(`${BASE_URL}/api/admin/users/sync`, { method: 'POST' });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to sync current user:', error);
      alert(get(t)('pages.users.notifications.syncError'));
    }
  }

  async function loadUsers() {
    try {
      users = await usersApi.list();
    } catch (error) {
      console.error('Failed to load users:', error);
      alert(get(t)('pages.users.notifications.loadError'));
    } finally {
      loading = false;
    }
  }

  async function toggleActive(target: BookingUser) {
    try {
      await usersApi.update(target.id, { isActive: !target.isActive });
      await loadUsers();
    } catch (error) {
      alert(get(t)('pages.users.notifications.updateError'));
    }
  }

  async function connectGoogle(target: BookingUser) {
    try {
      const { authUrl } = await usersApi.connectGoogle(target.id);
      window.open(authUrl, '_blank', 'width=600,height=700');
    } catch (error) {
      alert(get(t)('pages.users.notifications.connectError'));
    }
  }

  async function openAvailabilityEditor(target: BookingUser) {
    selectedUser = target;
    try {
      availabilityRules = await availabilityApi.get(target.id);
    } catch (error) {
      availabilityRules = [];
    }
    showAvailabilityModal = true;
  }

  function addAvailabilityRule() {
    availabilityRules = [
      ...availabilityRules,
      {
        id: `temp-${Date.now()}`,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        isActive: true,
      },
    ];
  }

  function removeAvailabilityRule(index: number) {
    availabilityRules = availabilityRules.filter((_, i) => i !== index);
  }

  async function saveAvailability() {
    if (!selectedUser) return;

    savingAvailability = true;
    try {
      const rules = availabilityRules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive,
      }));

      await availabilityApi.update(selectedUser.id, rules);
      showAvailabilityModal = false;
      alert(get(t)('pages.users.notifications.availabilitySaved'));
    } catch (error) {
      alert(get(t)('pages.users.notifications.availabilityError'));
    } finally {
      savingAvailability = false;
    }
  }

  function openCreateUserModal() {
    newUser = { email: '', displayName: '', timezone: 'UTC' };
    showCreateUserModal = true;
  }

  async function createUser() {
    if (!newUser.email || !newUser.displayName) {
      alert(get(t)('pages.users.notifications.userCreateError'));
      return;
    }

    creatingUser = true;
    try {
      await usersApi.create(newUser);
      showCreateUserModal = false;
      alert(get(t)('pages.users.notifications.userCreated'));
      await loadUsers();
    } catch (error) {
      alert(get(t)('pages.users.notifications.userCreateError'));
    } finally {
      creatingUser = false;
    }
  }
</script>

<div class="page users-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{$t('navigation.users')}</p>
      <h1>{$t('pages.users.title')}</h1>
      <p>{$t('pages.users.subtitle')}</p>
    </div>
    {#if $canManageUsers}
      <button class="btn-primary" type="button" on:click={openCreateUserModal}>
        <Plus size={16} />
        <span>{$t('pages.users.buttons.create')}</span>
      </button>
    {/if}
  </header>

  {#if loading}
    <div class="loading">{$t('pages.users.loading')}</div>
  {:else if users.length === 0}
    <div class="empty-state">
      <h3>{$t('pages.users.emptyTitle')}</h3>
      <p>{$t('pages.users.emptyHelp')}</p>
    </div>
  {:else}
    <div class="users-table">
      <table>
        <thead>
          <tr>
            <th>{$t('pages.users.table.name')}</th>
            <th>{$t('pages.users.table.email')}</th>
            <th>{$t('pages.users.table.calendar')}</th>
            <th>{$t('pages.users.table.active')}</th>
            <th>{$t('pages.users.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
            <tr>
              <td>
                <div class="identity">
                  <div class="avatar-sm">
                    {user.displayName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div>
                    <strong>{user.displayName}</strong>
                    <small>{user.timezone}</small>
                  </div>
                </div>
              </td>
              <td>{user.email}</td>
              <td>
                {#if user.hasGoogleCalendar}
                  <span class="badge badge-success">{$t('pages.users.google.connected')}</span>
                {:else}
                  <span class="badge badge-default">{$t('pages.users.google.disconnected')}</span>
                {/if}
              </td>
              <td>
                <label class="toggle">
                  <input
                    type="checkbox"
                    checked={user.isActive}
                    on:change={() => toggleActive(user)}
                    disabled={!$canManageUsers}
                  />
                  <span></span>
                </label>
              </td>
              <td>
                <div class="action-buttons">
                  <button type="button" class="ghost" on:click={() => openAvailabilityEditor(user)}>
                    <CalendarRange size={16} />
                    <span>{$t('pages.users.buttons.availability')}</span>
                  </button>

                  {#if !user.hasGoogleCalendar && $canConnectCalendar}
                    <button type="button" class="ghost" on:click={() => connectGoogle(user)}>
                      <Link2 size={16} />
                      <span>{$t('pages.users.google.connect')}</span>
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showAvailabilityModal && selectedUser}
  <div class="modal-overlay" role="presentation" on:click={() => (showAvailabilityModal = false)}>
    <div class="modal" role="dialog" aria-modal="true" on:click|stopPropagation>
      <header class="modal-header">
        <div>
          <p class="eyebrow">{$t('pages.users.buttons.availability')}</p>
          <h3>{$t('pages.users.modals.availability.title', { values: { name: selectedUser.displayName } })}</h3>
        </div>
        <button class="ghost" on:click={() => (showAvailabilityModal = false)}>
          {$t('actions.close')}
        </button>
      </header>

      <div class="modal-body availability-editor">
        {#each availabilityRules as rule, index}
          <div class="availability-row">
            <select bind:value={rule.dayOfWeek}>
              {#each daysOfWeek as day}
                <option value={day.value}>{$t(`pages.users.days.${day.labelKey}`)}</option>
              {/each}
            </select>
            <input type="time" bind:value={rule.startTime} />
            <span>{$t('pages.users.modals.availability.rangeSeparator')}</span>
            <input type="time" bind:value={rule.endTime} />
            <button class="icon-only" type="button" on:click={() => removeAvailabilityRule(index)}>
              ✕
            </button>
          </div>
        {/each}

        <button class="btn-secondary" type="button" on:click={addAvailabilityRule}>
          {$t('pages.users.modals.availability.addSlot')}
        </button>
      </div>

      <footer class="modal-footer">
        <button class="ghost" type="button" on:click={() => (showAvailabilityModal = false)}>
          {$t('pages.users.modals.availability.cancel')}
        </button>
        <button class="btn-primary" type="button" on:click={saveAvailability} disabled={savingAvailability}>
          {savingAvailability
            ? $t('pages.users.modals.availability.saving')
            : $t('pages.users.modals.availability.save')}
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if showCreateUserModal}
  <div class="modal-overlay" role="presentation" on:click={() => (showCreateUserModal = false)}>
    <div class="modal" role="dialog" aria-modal="true" on:click|stopPropagation>
      <header class="modal-header">
        <div>
          <p class="eyebrow">{$t('navigation.users')}</p>
          <h3>{$t('pages.users.modals.create.title')}</h3>
        </div>
        <button class="ghost" on:click={() => (showCreateUserModal = false)}>
          {$t('actions.close')}
        </button>
      </header>

      <div class="modal-body">
        <form class="form-stack" on:submit|preventDefault={createUser}>
          <div class="form-group">
            <label for="email">{$t('pages.users.modals.create.emailLabel')}</label>
            <input
              id="email"
              type="email"
              bind:value={newUser.email}
              placeholder="user@example.com"
              required
            />
            <small class="help-text">{$t('pages.users.modals.create.emailHelp')}</small>
          </div>

          <div class="form-group">
            <label for="displayName">{$t('pages.users.modals.create.nameLabel')}</label>
            <input
              id="displayName"
              type="text"
              bind:value={newUser.displayName}
              placeholder="Alex Example"
              required
            />
            <small class="help-text">{$t('pages.users.modals.create.nameHelp')}</small>
          </div>

          <div class="form-group">
            <label for="timezone">{$t('pages.users.modals.create.timezoneLabel')}</label>
            <select id="timezone" bind:value={newUser.timezone}>
              <option value="UTC">UTC</option>
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
          </div>
        </form>
      </div>

      <footer class="modal-footer">
        <button class="ghost" type="button" on:click={() => (showCreateUserModal = false)} disabled={creatingUser}>
          {$t('pages.users.modals.create.cancel')}
        </button>
        <button class="btn-primary" type="button" on:click={createUser} disabled={creatingUser}>
          {creatingUser ? $t('pages.users.modals.create.creating') : $t('pages.users.modals.create.create')}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .users-page .identity {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .avatar-sm {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .ghost {
    background: color-mix(in srgb, var(--aico-grey-300) 12%, transparent);
    border-radius: 999px;
    border: none;
    padding: 0.4rem 0.85rem;
  }

  .ghost span {
    font-weight: 600;
  }

  .toggle {
    position: relative;
    display: inline-block;
    width: 46px;
    height: 24px;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: color-mix(in srgb, var(--aico-grey-400) 45%, transparent);
    transition: var(--transition-transform);
    border-radius: 999px;
  }

  .toggle span::before {
    position: absolute;
    content: '';
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: var(--transition-transform);
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
  }

  .toggle input:checked + span {
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
  }

  .toggle input:checked + span::before {
    transform: translateX(22px);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  .modal-header h3 {
    margin: 0.25rem 0 0;
  }

  .availability-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .availability-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto 1fr auto;
    gap: 0.5rem;
    align-items: center;
  }

  .icon-only {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: none;
    background: rgba(var(--aico-danger-rgb), 0.1);
    color: var(--aico-danger);
    font-weight: 700;
  }

  .form-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
</style>
