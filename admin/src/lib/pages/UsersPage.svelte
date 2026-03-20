<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { usersApi, availabilityApi, type OrgMember, type AvailabilityRule } from '../api';
  import { canManageUsers, canConnectCalendar } from '../permissions';
  import { t } from '../../i18n';
  import {
    toastService,
    PageLayout,
    SectionPanel,
    Button,
    Badge,
    Modal,
    ModalContent,
    ModalFooter,
    Toggle,
    FormField,
    IconButton,
    StateBlock,
    AvatarDisplay,
  } from '@aico/blueprint';

  let users = $state<OrgMember[]>([]);
  let loading = $state(true);
  let selectedUser = $state<OrgMember | null>(null);
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

  let pageActions = $derived(
    $canManageUsers
      ? [
          {
            label: get(t)('pages.users.buttons.create'),
            onClick: openCreateUserModal,
            variant: 'primary' as const,
            icon: 'plus',
          },
        ]
      : [],
  );

  onMount(async () => {
    await loadUsers();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('google-connected') === 'true') {
      toastService.success(get(t)('pages.users.notifications.googleConnected'));
      window.history.replaceState({}, '', window.location.pathname);
      await loadUsers();
    }
  });

  async function loadUsers() {
    try {
      users = await usersApi.list();
    } catch (error) {
      console.error('Failed to load users:', error);
      toastService.error(get(t)('pages.users.notifications.loadError'));
    } finally {
      loading = false;
    }
  }

  async function ensureLocalRecord(target: OrgMember): Promise<string> {
    if (target.localId) return target.localId;
    const created = await usersApi.create({ email: target.email, displayName: target.displayName || '' });
    return created.id;
  }

  async function toggleActive(target: OrgMember, nextActive: boolean) {
    try {
      const localId = await ensureLocalRecord(target);
      await usersApi.update(localId, { isActive: nextActive });
      await loadUsers();
    } catch (error) {
      toastService.error(get(t)('pages.users.notifications.updateError'));
    }
  }

  async function connectGoogle(target: OrgMember) {
    try {
      const localId = await ensureLocalRecord(target);
      const { authUrl } = await usersApi.connectGoogle(localId);
      window.open(authUrl, '_blank', 'width=600,height=700');
    } catch (error) {
      toastService.error(get(t)('pages.users.notifications.connectError'));
    }
  }

  async function openAvailabilityEditor(target: OrgMember) {
    selectedUser = target;
    try {
      const localId = await ensureLocalRecord(target);
      // Update the target's localId for saveAvailability
      target.localId = localId;
      availabilityRules = await availabilityApi.get(localId);
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
    if (!selectedUser?.localId) return;

    savingAvailability = true;
    try {
      const rules = availabilityRules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive,
      }));

      await availabilityApi.update(selectedUser.localId, rules);
      showAvailabilityModal = false;
      toastService.success(get(t)('pages.users.notifications.availabilitySaved'));
    } catch (error) {
      toastService.error(get(t)('pages.users.notifications.availabilityError'));
    } finally {
      savingAvailability = false;
    }
  }

  function openCreateUserModal() {
    newUser = { email: '', displayName: '', timezone: 'UTC' };
    showCreateUserModal = true;
  }

  async function createUser() {
    if (!newUser.email) {
      toastService.error(get(t)('pages.users.notifications.userCreateError'));
      return;
    }

    creatingUser = true;
    try {
      await usersApi.create(newUser);
      showCreateUserModal = false;
      toastService.success(get(t)('pages.users.notifications.userCreated'));
      await loadUsers();
    } catch (error) {
      toastService.error(get(t)('pages.users.notifications.userCreateError'));
    } finally {
      creatingUser = false;
    }
  }
</script>

<PageLayout
  title={$t('pages.users.title')}
  description={$t('pages.users.subtitle')}
  maxWidth="full"
  spacing="md"
  actions={pageActions}
>
  <SectionPanel>
    {#if loading}
      <StateBlock variant="loading" message={$t('pages.users.loading')} />
    {:else if users.length === 0}
      <StateBlock
        variant="empty"
        title={$t('pages.users.emptyTitle')}
        message={$t('pages.users.emptyHelp')}
      />
    {:else}
      <div class="table-wrapper">
        <table class="data-table">
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
            {#each users as bookingUser}
              <tr>
                <td>
                  <div class="identity-cell">
                    <AvatarDisplay name={bookingUser.displayName} size="sm" />
                    <div class="identity-text">
                      <strong>{bookingUser.displayName}</strong>
                      <small>{bookingUser.timezone}</small>
                    </div>
                  </div>
                </td>
                <td>{bookingUser.email}</td>
                <td>
                  {#if bookingUser.hasGoogleCalendar}
                    <Badge tone="positive" size="sm" label={$t('pages.users.google.connected')} />
                  {:else}
                    <Badge tone="muted" size="sm" label={$t('pages.users.google.disconnected')} />
                  {/if}
                </td>
                <td>
                  <Toggle
                    checked={bookingUser.isActive}
                    onChange={(nextActive) => toggleActive(bookingUser, nextActive)}
                    disabled={!$canManageUsers}
                    variant="plain"
                    size="sm"
                  />
                </td>
                <td>
                  <div class="row-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="calendar-range"
                      onclick={() => openAvailabilityEditor(bookingUser)}
                    >
                      {$t('pages.users.buttons.availability')}
                    </Button>

                    {#if !bookingUser.hasGoogleCalendar && $canConnectCalendar}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon="link-2"
                        onclick={() => connectGoogle(bookingUser)}
                      >
                        {$t('pages.users.google.connect')}
                      </Button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </SectionPanel>
</PageLayout>

<Modal
  open={showAvailabilityModal && !!selectedUser}
  onClose={() => (showAvailabilityModal = false)}
  size="lg"
>
  <ModalContent>
    <div class="modal-heading">
      <Badge eyebrow tone="muted" label={$t('pages.users.buttons.availability')} />
      {#if selectedUser}
        <h3>{$t('pages.users.modals.availability.title', { values: { name: selectedUser.displayName } })}</h3>
      {/if}
    </div>

    <div class="availability-editor">
      {#each availabilityRules as rule, index}
        <div class="availability-row">
          <FormField>
            <select bind:value={rule.dayOfWeek}>
              {#each daysOfWeek as day}
                <option value={day.value}>{$t(`pages.users.days.${day.labelKey}`)}</option>
              {/each}
            </select>
          </FormField>

          <FormField>
            <input type="time" bind:value={rule.startTime} />
          </FormField>
          <span class="range-separator">{$t('pages.users.modals.availability.rangeSeparator')}</span>
          <FormField>
            <input type="time" bind:value={rule.endTime} />
          </FormField>

          <IconButton
            icon="x"
            label={$t('actions.close')}
            tone="danger"
            variant="soft"
            size="sm"
            onClick={() => removeAvailabilityRule(index)}
          />
        </div>
      {/each}

      <Button variant="secondary" size="sm" icon="plus" onclick={addAvailabilityRule}>
        {$t('pages.users.modals.availability.addSlot')}
      </Button>
    </div>

    <ModalFooter>
      <Button variant="ghost" onclick={() => (showAvailabilityModal = false)}>
        {$t('pages.users.modals.availability.cancel')}
      </Button>
      <Button variant="primary" onclick={saveAvailability} loading={savingAvailability}>
        {savingAvailability
          ? $t('pages.users.modals.availability.saving')
          : $t('pages.users.modals.availability.save')}
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>

<Modal
  open={showCreateUserModal}
  onClose={() => (showCreateUserModal = false)}
  size="md"
>
  <ModalContent>
    <div class="modal-heading">
      <Badge eyebrow tone="muted" label={$t('navigation.users')} />
      <h3>{$t('pages.users.modals.create.title')}</h3>
    </div>

    <form
      class="form-stack"
      onsubmit={(event) => {
        event.preventDefault();
        createUser();
      }}
    >
      <FormField
        label={$t('pages.users.modals.create.emailLabel')}
        help={$t('pages.users.modals.create.emailHelp')}
      >
        <input
          id="email"
          type="email"
          bind:value={newUser.email}
          placeholder="user@example.com"
          required
        />
      </FormField>

      <FormField
        label={$t('pages.users.modals.create.nameLabel')}
        help={$t('pages.users.modals.create.nameHelp')}
      >
        <input
          id="displayName"
          type="text"
          bind:value={newUser.displayName}
          placeholder="Alex Example"
          required
        />
      </FormField>

      <FormField label={$t('pages.users.modals.create.timezoneLabel')}>
        <select id="timezone" bind:value={newUser.timezone}>
          <option value="UTC">UTC</option>
          <option value="Europe/Berlin">Europe/Berlin</option>
          <option value="Europe/London">Europe/London</option>
          <option value="America/New_York">America/New_York</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
        </select>
      </FormField>
    </form>

    <ModalFooter>
      <Button variant="ghost" onclick={() => (showCreateUserModal = false)} disabled={creatingUser}>
        {$t('pages.users.modals.create.cancel')}
      </Button>
      <Button variant="primary" onclick={createUser} loading={creatingUser}>
        {creatingUser ? $t('pages.users.modals.create.creating') : $t('pages.users.modals.create.create')}
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>

<style>
  .table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-lg);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 780px;
    font-size: 0.9rem;
  }

  .data-table th,
  .data-table td {
    padding: var(--blueprint-spacing-sm) var(--blueprint-spacing-md);
    border-bottom: 1px solid var(--aico-color-border-light);
    text-align: left;
    vertical-align: middle;
  }

  .data-table th {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--aico-color-text-tertiary);
  }

  .data-table tr:last-child td {
    border-bottom: none;
  }

  .identity-cell {
    display: flex;
    align-items: center;
    gap: var(--blueprint-spacing-sm);
  }

  .identity-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .identity-text small {
    color: var(--aico-color-text-tertiary);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--blueprint-spacing-xs);
  }

  .modal-heading {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-xs);
  }

  .modal-heading h3 {
    margin: 0;
  }

  .availability-editor {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-sm);
  }

  .availability-row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(110px, 1fr) auto minmax(110px, 1fr) auto;
    gap: var(--blueprint-spacing-xs);
    align-items: center;
  }

  .availability-row :global(.form-field) {
    gap: 0;
  }

  .range-separator {
    color: var(--aico-color-text-tertiary);
    font-size: 0.85rem;
    align-self: center;
  }

  .form-stack {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-md);
  }

  @media (max-width: 720px) {
    .availability-row {
      grid-template-columns: 1fr;
    }

    .range-separator {
      display: none;
    }
  }
</style>
