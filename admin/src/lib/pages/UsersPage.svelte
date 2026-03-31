<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { usersApi, availabilityApi, type OrgMember, type AvailabilityRule } from "../api";
  import { canManageUsers, canConnectCalendar, canManageAvailability } from "../permissions";
  import { t } from "../../i18n";
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
    StatsGrid,
    currentPageQueryStore,
    updateCurrentPageQuery,
  } from "@aico/blueprint";

  const USER_MODES = {
    team: {
      id: "team",
      pageTitle: "Bookable Team",
      description: "Manage who can receive bookings.",
      panelTitle: "Team",
    },
    availability: {
      id: "availability",
      pageTitle: "Availability",
      description: "Plan weekly booking windows.",
      panelTitle: "Availability",
    },
  } as const;

  type UserMode = keyof typeof USER_MODES;

  const daysOfWeek = [
    { value: 0, labelKey: "sunday" },
    { value: 1, labelKey: "monday" },
    { value: 2, labelKey: "tuesday" },
    { value: 3, labelKey: "wednesday" },
    { value: 4, labelKey: "thursday" },
    { value: 5, labelKey: "friday" },
    { value: 6, labelKey: "saturday" },
  ] as const;

  function isUserMode(value: string | undefined): value is UserMode {
    return value === "team" || value === "availability";
  }

  function getUserKey(target: OrgMember): string {
    return target.localId || target.email;
  }

  function getCalendarLabel(target: OrgMember): string {
    return target.hasGoogleCalendar ? "Calendar ready" : "Calendar missing";
  }

  let users = $state<OrgMember[]>([]);
  let loading = $state(true);
  let availabilityRules = $state<AvailabilityRule[]>([]);
  let savingAvailability = $state(false);
  let loadingAvailability = $state(false);
  let showCreateUserModal = $state(false);
  let creatingUser = $state(false);
  let selectedAvailabilityUserKey = $state<string | null>(null);
  let availabilityLoadedForKey = $state<string | null>(null);

  let newUser = $state({
    email: "",
    displayName: "",
    timezone: "UTC",
  });

  const activeMode = $derived<UserMode>(
    isUserMode($currentPageQueryStore.mode) ? $currentPageQueryStore.mode : "team",
  );

  const activeModeMeta = $derived(USER_MODES[activeMode]);

  const selectedAvailabilityUser = $derived(
    selectedAvailabilityUserKey
      ? users.find((candidate) => getUserKey(candidate) === selectedAvailabilityUserKey) || null
      : null,
  );

  const pageActions = $derived(
    $canManageUsers
      ? [
          {
            label: get(t)("pages.users.buttons.create"),
            onClick: openCreateUserModal,
            variant: "primary" as const,
            icon: "plus",
          },
        ]
      : [],
  );

  const teamStats = $derived([
    {
      title: "Total teammates",
      value: users.length,
      tone: "neutral" as const,
    },
    {
      title: "Active",
      value: users.filter((candidate) => candidate.isActive).length,
      tone: "positive" as const,
    },
    {
      title: "Calendar connected",
      value: users.filter((candidate) => candidate.hasGoogleCalendar).length,
      tone: "info" as const,
    },
    {
      title: "Needs setup",
      value: users.filter((candidate) => !candidate.hasGoogleCalendar).length,
      tone: "critical" as const,
    },
  ]);

  $effect(() => {
    if (users.length === 0) {
      selectedAvailabilityUserKey = null;
      availabilityLoadedForKey = null;
      availabilityRules = [];
      return;
    }

    const hasCurrentSelection = users.some(
      (candidate) => getUserKey(candidate) === selectedAvailabilityUserKey,
    );

    if (!selectedAvailabilityUserKey || !hasCurrentSelection) {
      selectedAvailabilityUserKey = getUserKey(users[0]);
    }
  });

  $effect(() => {
    if (activeMode !== "availability" || !selectedAvailabilityUser) return;
    void ensureAvailabilityLoaded(selectedAvailabilityUser);
  });

  onMount(async () => {
    await loadUsers();

    const url = new URL(window.location.href);
    if (url.searchParams.get("google-connected") === "true") {
      toastService.success(get(t)("pages.users.notifications.googleConnected"));
      url.searchParams.delete("google-connected");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      await loadUsers();
    }
  });

  async function loadUsers() {
    try {
      users = await usersApi.list();
    } catch (error) {
      console.error("Failed to load users:", error);
      toastService.error(get(t)("pages.users.notifications.loadError"));
    } finally {
      loading = false;
    }
  }

  async function ensureLocalRecord(target: OrgMember): Promise<string> {
    if (target.localId) return target.localId;
    const created = await usersApi.create({ email: target.email, displayName: target.displayName || "" });
    target.localId = created.id;
    return created.id;
  }

  async function toggleActive(target: OrgMember, nextActive: boolean) {
    try {
      const localId = await ensureLocalRecord(target);
      await usersApi.update(localId, { isActive: nextActive });
      await loadUsers();
    } catch (error) {
      toastService.error(get(t)("pages.users.notifications.updateError"));
    }
  }

  async function connectGoogle(target: OrgMember) {
    try {
      const localId = await ensureLocalRecord(target);
      const { authUrl } = await usersApi.connectGoogle(localId);
      window.open(authUrl, "_blank", "width=600,height=700");
    } catch (error) {
      toastService.error(get(t)("pages.users.notifications.connectError"));
    }
  }

  async function loadAvailabilityForUser(target: OrgMember, force = false) {
    const userKey = getUserKey(target);
    selectedAvailabilityUserKey = userKey;

    if (!force && availabilityLoadedForKey === userKey) {
      return;
    }

    loadingAvailability = true;
    try {
      const localId = await ensureLocalRecord(target);
      target.localId = localId;
      availabilityRules = await availabilityApi.get(localId);
      availabilityLoadedForKey = userKey;
    } catch (error) {
      availabilityRules = [];
      availabilityLoadedForKey = userKey;
    } finally {
      loadingAvailability = false;
    }
  }

  async function ensureAvailabilityLoaded(target: OrgMember) {
    await loadAvailabilityForUser(target, false);
  }

  async function openAvailabilityMode(target: OrgMember) {
    await loadAvailabilityForUser(target, true);
    updateCurrentPageQuery({ mode: "availability" });
  }

  function addAvailabilityRule() {
    availabilityRules = [
      ...availabilityRules,
      {
        id: `temp-${Date.now()}`,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        isActive: true,
      },
    ];
  }

  function removeAvailabilityRule(index: number) {
    availabilityRules = availabilityRules.filter((_, currentIndex) => currentIndex !== index);
  }

  async function saveAvailability() {
    if (!selectedAvailabilityUser) return;

    savingAvailability = true;
    try {
      const localId = await ensureLocalRecord(selectedAvailabilityUser);
      const rules = availabilityRules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive,
      }));

      await availabilityApi.update(localId, rules);
      toastService.success(get(t)("pages.users.notifications.availabilitySaved"));
    } catch (error) {
      toastService.error(get(t)("pages.users.notifications.availabilityError"));
    } finally {
      savingAvailability = false;
    }
  }

  function openCreateUserModal() {
    newUser = { email: "", displayName: "", timezone: "UTC" };
    showCreateUserModal = true;
  }

  async function createUser() {
    if (!newUser.email) {
      toastService.error(get(t)("pages.users.notifications.userCreateError"));
      return;
    }

    creatingUser = true;
    try {
      await usersApi.create(newUser);
      showCreateUserModal = false;
      toastService.success(get(t)("pages.users.notifications.userCreated"));
      await loadUsers();
    } catch (error) {
      toastService.error(get(t)("pages.users.notifications.userCreateError"));
    } finally {
      creatingUser = false;
    }
  }
</script>

<PageLayout
  title={activeModeMeta.pageTitle}
  description={activeModeMeta.description}
  maxWidth="full"
  spacing="md"
  actions={pageActions}
>
  {#if activeMode === "team"}
    <StatsGrid columns="auto" minColumnWidth={180} items={teamStats} />
  {/if}

  {#if loading}
    <SectionPanel>
      <StateBlock variant="loading" message={$t("pages.users.loading")} />
    </SectionPanel>
  {:else if users.length === 0}
    <SectionPanel>
      <StateBlock
        variant="empty"
        title={$t("pages.users.emptyTitle")}
        message={$t("pages.users.emptyHelp")}
      />
    </SectionPanel>
  {:else if activeMode === "team"}
    <SectionPanel title={activeModeMeta.panelTitle} icon="users-round">
      <div class="team-grid">
        {#each users as bookingUser}
          <article class="team-card">
            <div class="team-card-top">
              <div class="identity-cell">
                <AvatarDisplay name={bookingUser.displayName} size="sm" />
                <div class="identity-text">
                  <strong>{bookingUser.displayName}</strong>
                  <small>{bookingUser.email}</small>
                </div>
              </div>
              <Toggle
                checked={bookingUser.isActive}
                onChange={(nextActive) => toggleActive(bookingUser, nextActive)}
                disabled={!$canManageUsers}
                variant="plain"
                size="sm"
              />
            </div>

            <div class="team-card-meta">
              <Badge
                tone={bookingUser.isActive ? "positive" : "muted"}
                size="sm"
                label={bookingUser.isActive ? "Active" : "Inactive"}
              />
              <Badge
                tone={bookingUser.hasGoogleCalendar ? "positive" : "muted"}
                size="sm"
                label={getCalendarLabel(bookingUser)}
              />
              <Badge tone="neutral" size="sm" label={bookingUser.timezone} />
            </div>

            <div class="row-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon="calendar-range"
                onclick={() => openAvailabilityMode(bookingUser)}
              >
                {$t("pages.users.buttons.availability")}
              </Button>

              {#if !bookingUser.hasGoogleCalendar && $canConnectCalendar}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon="link-2"
                  onclick={() => connectGoogle(bookingUser)}
                >
                  {$t("pages.users.google.connect")}
                </Button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </SectionPanel>
  {:else}
    <SectionPanel
      title="Availability planner"
      subtitle="Select a teammate and define weekly booking windows."
      icon="calendar-range"
    >
      <div class="availability-shell">
        <aside class="people-rail-block">
          <div class="people-rail-head">
            <span>People</span>
          </div>
          <div class="user-rail">
            {#each users as bookingUser}
              <button
                type="button"
                class="user-card"
                class:active={selectedAvailabilityUserKey === getUserKey(bookingUser)}
                onclick={() => loadAvailabilityForUser(bookingUser, true)}
              >
                <div class="user-card-head">
                  <div class="user-card-identity">
                    <AvatarDisplay name={bookingUser.displayName} size="sm" />
                    <div class="identity-text">
                      <strong>{bookingUser.displayName}</strong>
                      <small>{bookingUser.email}</small>
                    </div>
                  </div>
                  <Badge
                    tone={bookingUser.isActive ? "positive" : "muted"}
                    size="sm"
                    label={bookingUser.isActive ? "Active" : "Inactive"}
                  />
                </div>
                <div class="user-card-meta">
                  <span>{bookingUser.timezone}</span>
                  <Badge
                    tone={bookingUser.hasGoogleCalendar ? "positive" : "muted"}
                    size="sm"
                    label={getCalendarLabel(bookingUser)}
                  />
                </div>
              </button>
            {/each}
          </div>
        </aside>

        <section class="availability-main">
          {#if !selectedAvailabilityUser}
            <StateBlock variant="empty" message="Select a teammate to edit availability." />
          {:else}
            <div class="availability-header">
              <div class="availability-summary">
                <span>{selectedAvailabilityUser.email}</span>
                <Badge tone="neutral" size="sm" label={selectedAvailabilityUser.timezone} />
                <Badge
                  tone={selectedAvailabilityUser.hasGoogleCalendar ? "positive" : "warning"}
                  size="sm"
                  label={selectedAvailabilityUser.hasGoogleCalendar ? "Google Calendar connected" : "Google Calendar not connected"}
                />
              </div>

              {#if $canManageAvailability}
                <div class="availability-actions">
                  <Button variant="secondary" size="sm" icon="plus" onclick={addAvailabilityRule}>
                    {$t("pages.users.modals.availability.addSlot")}
                  </Button>
                  <Button variant="primary" onclick={saveAvailability} loading={savingAvailability}>
                    {savingAvailability
                      ? $t("pages.users.modals.availability.saving")
                      : $t("pages.users.modals.availability.save")}
                  </Button>
                </div>
              {/if}
            </div>

            {#if !selectedAvailabilityUser.hasGoogleCalendar && $canConnectCalendar}
              <div class="availability-callout">
                <div class="availability-callout-copy">
                  <strong>Calendar connection required</strong>
                  <p>Connect Google Calendar before relying on this teammate for live bookings.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon="link-2"
                  onclick={() => connectGoogle(selectedAvailabilityUser)}
                >
                  {$t("pages.users.google.connect")}
                </Button>
              </div>
            {/if}

            {#if loadingAvailability}
              <StateBlock variant="loading" message="Loading weekly availability..." />
            {:else}
              <div class="availability-editor" class:is-empty={availabilityRules.length === 0}>
                {#if availabilityRules.length === 0}
                  <div class="availability-empty">
                    <strong>No availability rules yet</strong>
                    <span>Add a weekly slot so this teammate can receive bookings.</span>
                    {#if $canManageAvailability}
                      <Button variant="secondary" size="sm" icon="plus" onclick={addAvailabilityRule}>
                        {$t("pages.users.modals.availability.addSlot")}
                      </Button>
                    {/if}
                  </div>
                {/if}

                {#each availabilityRules as rule, index}
                  <div class="availability-row">
                    <FormField label="Day">
                      <select bind:value={rule.dayOfWeek} disabled={!$canManageAvailability}>
                        {#each daysOfWeek as day}
                          <option value={day.value}>{$t(`pages.users.days.${day.labelKey}`)}</option>
                        {/each}
                      </select>
                    </FormField>

                    <FormField label="Start">
                      <input type="time" bind:value={rule.startTime} disabled={!$canManageAvailability} />
                    </FormField>
                    <span class="range-separator">{$t("pages.users.modals.availability.rangeSeparator")}</span>
                    <FormField label="End">
                      <input type="time" bind:value={rule.endTime} disabled={!$canManageAvailability} />
                    </FormField>

                    <div class="availability-toggle">
                      <Toggle
                        checked={rule.isActive}
                        onChange={(checked) => (rule.isActive = checked)}
                        label="Enabled"
                        disabled={!$canManageAvailability}
                        size="sm"
                      />
                    </div>

                    {#if $canManageAvailability}
                      <IconButton
                        icon="x"
                        label={$t("actions.close")}
                        tone="danger"
                        variant="soft"
                        size="sm"
                        onClick={() => removeAvailabilityRule(index)}
                      />
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </section>
      </div>
    </SectionPanel>
  {/if}
</PageLayout>

<Modal open={showCreateUserModal} onClose={() => (showCreateUserModal = false)} size="md">
  <ModalContent>
    <div class="modal-heading">
      <Badge eyebrow tone="muted" label={$t("navigation.users")} />
      <h3>{$t("pages.users.modals.create.title")}</h3>
    </div>

    <form
      class="form-stack"
      onsubmit={(event) => {
        event.preventDefault();
        createUser();
      }}
    >
      <FormField
        label={$t("pages.users.modals.create.emailLabel")}
        help={$t("pages.users.modals.create.emailHelp")}
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
        label={$t("pages.users.modals.create.nameLabel")}
        help={$t("pages.users.modals.create.nameHelp")}
      >
        <input
          id="displayName"
          type="text"
          bind:value={newUser.displayName}
          placeholder="Alex Example"
          required
        />
      </FormField>

      <FormField label={$t("pages.users.modals.create.timezoneLabel")}>
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
        {$t("pages.users.modals.create.cancel")}
      </Button>
      <Button variant="primary" onclick={createUser} loading={creatingUser}>
        {creatingUser ? $t("pages.users.modals.create.creating") : $t("pages.users.modals.create.create")}
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>

<style>
  .team-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--blueprint-spacing-md);
  }

  .team-card {
    display: grid;
    gap: var(--blueprint-spacing-sm);
    padding: var(--blueprint-spacing-md);
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-lg);
    background: var(--surface-card, var(--aico-color-bg-primary));
    box-shadow: var(--shadow-sm);
  }

  .team-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--blueprint-spacing-sm);
  }

  .team-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--blueprint-spacing-xs);
  }

  .identity-cell,
  .user-card-identity {
    display: flex;
    align-items: center;
    gap: var(--blueprint-spacing-sm);
  }

  .identity-text {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-2xs, 2px);
  }

  .identity-text small,
  .user-card-identity small {
    color: var(--aico-color-text-tertiary);
  }

  .row-actions,
  .availability-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--blueprint-spacing-xs);
  }

  .availability-shell {
    display: grid;
    grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
    gap: var(--blueprint-spacing-md);
    align-items: start;
    width: 100%;
    margin: 0;
  }

  .people-rail-block {
    min-width: 0;
    padding-right: var(--blueprint-spacing-sm);
    border-right: 1px solid var(--aico-color-border-light);
  }

  .people-rail-head {
    margin-bottom: var(--blueprint-spacing-sm);
    color: var(--aico-color-text-secondary);
    font-size: 0.82rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .availability-main {
    min-width: 0;
    padding-left: var(--blueprint-spacing-2xs, 2px);
  }

  .user-rail {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-xs);
  }

  .user-card {
    appearance: none;
    width: 100%;
    border: 1px solid var(--field-border-default, var(--aico-color-border-light));
    border-radius: var(--blueprint-radius-lg);
    background: var(--surface-base, var(--aico-color-bg-primary));
    padding: var(--blueprint-spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-xs);
    text-align: left;
    color: var(--text-primary, var(--aico-color-text-primary));
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  .user-card:hover {
    border-color: var(--field-border-hover, var(--aico-color-border-medium));
  }

  .user-card.active {
    border-color: var(--field-border-focus, var(--accent-color-primary));
    box-shadow: 0 0 0 1px var(--field-border-focus, var(--accent-color-primary));
  }

  .user-card-head,
  .user-card-meta,
  .modal-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--blueprint-spacing-sm);
  }

  .availability-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--blueprint-spacing-sm);
  }

  .user-card-meta,
  .availability-summary {
    flex-wrap: wrap;
    color: var(--text-secondary, var(--aico-color-text-secondary));
    font-size: 0.85rem;
  }

  .availability-callout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--blueprint-spacing-md);
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-lg);
    padding: var(--blueprint-spacing-sm);
    margin-bottom: var(--blueprint-spacing-sm);
    background: var(--surface-muted, var(--aico-color-bg-secondary));
  }

  .availability-callout-copy {
    display: grid;
    gap: var(--blueprint-spacing-2xs, 4px);
  }

  .availability-callout-copy p,
  .modal-heading h3 {
    margin: 0;
  }

  .availability-editor,
  .form-stack {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-sm);
  }

  .availability-editor.is-empty {
    border: 1px dashed var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-lg);
    background: color-mix(
      in srgb,
      var(--surface-muted, var(--aico-color-bg-secondary)) 55%,
      transparent
    );
    padding: var(--blueprint-spacing-sm);
  }

  .availability-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--blueprint-spacing-md);
    margin-bottom: var(--blueprint-spacing-xs);
  }

  .availability-empty {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-xs);
    align-items: center;
    justify-content: flex-start;
    min-height: calc(var(--blueprint-spacing-xl) + var(--blueprint-spacing-sm));
    max-width: 60ch;
    margin: 0 auto;
    padding: 0;
    color: var(--aico-color-text-secondary);
    text-align: center;
  }

  .availability-empty strong {
    color: var(--aico-color-text-primary);
    font-size: 0.95rem;
  }

  .availability-row {
    display: grid;
    grid-template-columns:
      minmax(140px, 1fr)
      minmax(120px, 1fr)
      auto
      minmax(120px, 1fr)
      minmax(110px, auto)
      auto;
    gap: var(--blueprint-spacing-sm);
    align-items: center;
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-lg);
    padding: var(--blueprint-spacing-sm);
  }

  .availability-toggle {
    padding-bottom: 0;
  }

  .range-separator {
    color: var(--aico-color-text-tertiary);
    font-size: 0.85rem;
    align-self: center;
    padding-bottom: 0;
  }

  @media (max-width: 1080px) {
    .availability-shell {
      grid-template-columns: 1fr;
    }

    .people-rail-block {
      padding-right: 0;
      border-right: none;
      border-bottom: 1px solid var(--aico-color-border-light);
      padding-bottom: var(--blueprint-spacing-sm);
      margin-bottom: var(--blueprint-spacing-2xs, 2px);
    }

    .availability-main {
      padding-left: 0;
    }
  }

  @media (max-width: 720px) {
    .availability-row {
      grid-template-columns: 1fr;
    }

    .team-card-top,
    .availability-header,
    .availability-callout,
    .user-card-head,
    .availability-summary {
      flex-direction: column;
      align-items: stretch;
    }

    .range-separator {
      display: none;
    }
  }
</style>
