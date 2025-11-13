<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { bookingsApi, type BookingWithUser } from '../api';
  import { canManageBookings } from '../auth';
  import { t, locale } from '../../i18n';
  import { CalendarDays, Video, X } from '@lucide/svelte';
  import { toastService } from '@aico/blueprint';

  let bookings = $state<BookingWithUser[]>([]);
  let loading = $state(true);
  let stats = $state({ total: 0, confirmed: 0, cancelled: 0, upcomingCount: 0 });
  let currentLocale = $state('en');

  const unsub = locale.subscribe((value) => {
    currentLocale = value || 'en';
  });

  onDestroy(() => unsub());

  onMount(async () => {
    await loadBookings();
    await loadStats();
  });

  async function loadBookings() {
    try {
      bookings = await bookingsApi.list();
    } catch (error) {
      console.error('Failed to load bookings:', error);
      toastService.error(get(t)('pages.bookings.notifications.loadError'));
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      stats = await bookingsApi.stats();
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function cancelBooking(booking: BookingWithUser) {
    const translator = get(t);
    const confirmMessage = translator('actions.confirmCancel', {
      values: { name: booking.visitorData.name || 'visitor' },
    });
    if (!confirm(confirmMessage)) return;

    const reason = prompt(translator('actions.cancellationReason'));

    try {
      await bookingsApi.cancel(booking.id, reason || undefined);
      await loadBookings();
      await loadStats();
      toastService.success(translator('pages.bookings.notifications.cancelSuccess'));
    } catch (error) {
      toastService.error(translator('pages.bookings.notifications.cancelError'));
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLocale || undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function getStatusBadgeClass(status: string): string {
    if (status === 'confirmed') return 'badge-success';
    if (status === 'cancelled') return 'badge-danger';
    return 'badge-default';
  }
</script>

<div class="page bookings-page">
  <div class="page-content">
    <section class="page-surface">
      <header class="page-header surface-toolbar">
        <div class="surface-header">
          <p class="eyebrow">{$t('navigation.bookings')}</p>
          <h1>{$t('pages.bookings.title')}</h1>
          <p>{$t('pages.bookings.subtitle')}</p>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <p class="stat-label">{$t('pages.bookings.stats.total')}</p>
          <div class="stat-value">{stats.total}</div>
        </div>
        <div class="stat-card">
          <p class="stat-label">{$t('pages.bookings.stats.confirmed')}</p>
          <div class="stat-value">{stats.confirmed}</div>
        </div>
        <div class="stat-card">
          <p class="stat-label">{$t('pages.bookings.stats.upcoming')}</p>
          <div class="stat-value">{stats.upcomingCount}</div>
        </div>
        <div class="stat-card">
          <p class="stat-label">{$t('pages.bookings.stats.cancelled')}</p>
          <div class="stat-value">{stats.cancelled}</div>
        </div>
      </div>
    </section>

    <section class="page-surface">
      {#if loading}
        <div class="loading">{$t('pages.bookings.loading')}</div>
      {:else if bookings.length === 0}
        <div class="empty-state">
          <CalendarDays size={32} />
          <h3>{$t('pages.bookings.emptyTitle')}</h3>
          <p>{$t('pages.bookings.emptyHelp')}</p>
        </div>
      {:else}
        <div class="bookings-table">
          <table>
            <thead>
              <tr>
                <th>{$t('pages.bookings.table.datetime')}</th>
                <th>{$t('pages.bookings.table.with')}</th>
                <th>{$t('pages.bookings.table.visitor')}</th>
                <th>{$t('pages.bookings.table.contact')}</th>
                <th>{$t('pages.bookings.table.status')}</th>
                <th>{$t('pages.bookings.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each bookings as booking}
                <tr>
                  <td>
                    <div class="datetime">{formatDate(booking.startTime)}</div>
                  </td>
                  <td>{booking.user.displayName}</td>
                  <td>{booking.visitorData.name || '—'}</td>
                  <td>
                    <div class="contact-info">
                      {#if booking.visitorData.email}
                        <div>{booking.visitorData.email}</div>
                      {/if}
                      {#if booking.visitorData.phone}
                        <div class="phone">{booking.visitorData.phone}</div>
                      {/if}
                    </div>
                  </td>
                  <td>
                    <span class="badge {getStatusBadgeClass(booking.status)}">
                      {$t(`statuses.${booking.status}`) || booking.status}
                    </span>
                  </td>
                  <td>
                    <div class="surface-actions">
                      {#if booking.status === 'confirmed'}
                        {#if booking.googleMeetLink}
                          <a
                            class="ghost"
                            href={booking.googleMeetLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Video size={16} />
                            <span>{$t('actions.joinMeeting')}</span>
                          </a>
                        {/if}
                        {#if $canManageBookings}
                          <button class="ghost danger" type="button" onclick={() => cancelBooking(booking)}>
                            <X size={16} />
                            <span>{$t('actions.cancel')}</span>
                          </button>
                        {/if}
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .datetime {
    font-weight: 600;
  }

  .contact-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .contact-info .phone {
    color: var(--aico-color-text-secondary);
  }
</style>
