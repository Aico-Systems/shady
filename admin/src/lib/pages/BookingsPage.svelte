<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { bookingsApi, type BookingWithUser } from "../api";
  import { canManageBookings } from "../permissions";
  import { t, locale } from "../../i18n";
  import {
    toastService,
    PageLayout,
    SectionPanel,
    StatsGrid,
    Badge,
    Button,
    StateBlock,
    currentPageQueryStore,
  } from "@aico/blueprint";

  const BOOKING_MODES = {
    upcoming: {
      id: "upcoming",
      pageTitle: "Upcoming Bookings",
      description: "Live confirmed calls and quick actions.",
      panelTitle: "Upcoming",
      emptyTitle: "No upcoming bookings",
      emptyHelp: "Confirmed future bookings will appear here once visitors start scheduling calls.",
    },
    history: {
      id: "history",
      pageTitle: "Booking History",
      description: "Past calls and visitor context.",
      panelTitle: "History",
      emptyTitle: "No booking history yet",
      emptyHelp: "Completed bookings will move here after their scheduled start time has passed.",
    },
    cancelled: {
      id: "cancelled",
      pageTitle: "Cancelled Bookings",
      description: "Cancelled appointments and their details.",
      panelTitle: "Cancelled",
      emptyTitle: "No cancelled bookings",
      emptyHelp: "Cancelled bookings will collect here once appointments start getting cancelled.",
    },
  } as const;

  type BookingMode = keyof typeof BOOKING_MODES;

  function isBookingMode(value: string | undefined): value is BookingMode {
    return value === "upcoming" || value === "history" || value === "cancelled";
  }

  let bookings = $state<BookingWithUser[]>([]);
  let loading = $state(true);
  let stats = $state({ total: 0, confirmed: 0, cancelled: 0, upcomingCount: 0 });
  let currentLocale = $state("en");

  const activeMode = $derived<BookingMode>(
    isBookingMode($currentPageQueryStore.mode) ? $currentPageQueryStore.mode : "upcoming",
  );

  const activeModeMeta = $derived(BOOKING_MODES[activeMode]);

  const filteredBookings = $derived.by(() => {
    const now = Date.now();

    if (activeMode === "cancelled") {
      return bookings.filter((booking) => booking.status === "cancelled");
    }

    if (activeMode === "history") {
      return bookings.filter(
        (booking) =>
          booking.status !== "cancelled" && new Date(booking.startTime).getTime() < now,
      );
    }

    return bookings.filter(
      (booking) =>
        booking.status !== "cancelled" && new Date(booking.startTime).getTime() >= now,
    );
  });

  const modeBadges = $derived([
    {
      label: `${filteredBookings.length} records`,
      tone: "muted" as const,
    },
    activeMode === "upcoming"
      ? { label: `${stats.upcomingCount} upcoming`, tone: "info" as const }
      : activeMode === "cancelled"
        ? { label: `${stats.cancelled} cancelled`, tone: "danger" as const }
        : { label: `${Math.max(stats.total - stats.upcomingCount - stats.cancelled, 0)} completed`, tone: "neutral" as const },
  ]);

  const unsub = locale.subscribe((value) => {
    currentLocale = value || "en";
  });

  onDestroy(() => unsub());

  onMount(async () => {
    await Promise.all([loadBookings(), loadStats()]);
  });

  async function loadBookings() {
    try {
      bookings = await bookingsApi.list();
    } catch (error) {
      console.error("Failed to load bookings:", error);
      toastService.error(get(t)("pages.bookings.notifications.loadError"));
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      stats = await bookingsApi.stats();
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }

  async function cancelBooking(booking: BookingWithUser) {
    const translator = get(t);
    const confirmMessage = translator("actions.confirmCancel", {
      values: { name: booking.visitorData.name || "visitor" },
    });

    if (!confirm(confirmMessage)) return;

    const reason = prompt(translator("actions.cancellationReason"));

    try {
      await bookingsApi.cancel(booking.id, reason || undefined);
      await Promise.all([loadBookings(), loadStats()]);
      toastService.success(translator("pages.bookings.notifications.cancelSuccess"));
    } catch (error) {
      toastService.error(translator("pages.bookings.notifications.cancelError"));
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLocale || undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function getStatusTone(status: string): "positive" | "danger" | "muted" {
    if (status === "confirmed") return "positive";
    if (status === "cancelled") return "danger";
    return "muted";
  }
</script>

<PageLayout
  title={activeModeMeta.pageTitle}
  description={activeModeMeta.description}
  maxWidth="full"
  spacing="md"
>
  <StatsGrid
    columns="auto"
    minColumnWidth={180}
    items={[
      {
        title: $t("pages.bookings.stats.total"),
        value: stats.total,
        tone: "neutral",
      },
      {
        title: $t("pages.bookings.stats.confirmed"),
        value: stats.confirmed,
        tone: "positive",
      },
      {
        title: $t("pages.bookings.stats.upcoming"),
        value: stats.upcomingCount,
        tone: "info",
      },
      {
        title: $t("pages.bookings.stats.cancelled"),
        value: stats.cancelled,
        tone: "critical",
      },
    ]}
  />

  <SectionPanel
    title={activeModeMeta.panelTitle}
    icon={activeMode === "cancelled" ? "calendar-x-2" : activeMode === "history" ? "history" : "calendar-clock"}
  >
    <div class="mode-meta">
      {#each modeBadges as badge}
        <Badge tone={badge.tone} size="sm" label={badge.label} />
      {/each}
    </div>

    {#if loading}
      <StateBlock variant="loading" message={$t("pages.bookings.loading")} />
    {:else if filteredBookings.length === 0}
      <StateBlock
        variant="empty"
        title={activeModeMeta.emptyTitle}
        message={activeModeMeta.emptyHelp}
      />
    {:else}
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>{$t("pages.bookings.table.datetime")}</th>
              <th>{$t("pages.bookings.table.with")}</th>
              <th>{$t("pages.bookings.table.visitor")}</th>
              <th>{$t("pages.bookings.table.contact")}</th>
              <th>{$t("pages.bookings.table.status")}</th>
              <th>{$t("pages.bookings.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredBookings as booking}
              <tr>
                <td><strong>{formatDate(booking.startTime)}</strong></td>
                <td>{booking.user.displayName}</td>
                <td>{booking.visitorData.name || "—"}</td>
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
                  <Badge
                    tone={getStatusTone(booking.status)}
                    size="sm"
                    label={$t(`statuses.${booking.status}`) || booking.status}
                  />
                </td>
                <td>
                  <div class="row-actions">
                    {#if booking.status === "confirmed" && booking.googleMeetLink}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="video"
                        onclick={() => window.open(booking.googleMeetLink, "_blank", "noopener,noreferrer")}
                      >
                        {$t("actions.joinMeeting")}
                      </Button>
                    {/if}

                    {#if booking.status === "confirmed" && $canManageBookings && activeMode !== "history"}
                      <Button
                        variant="danger"
                        size="sm"
                        icon="x"
                        onclick={() => cancelBooking(booking)}
                      >
                        {$t("actions.cancel")}
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

<style>
  .mode-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--blueprint-spacing-xs);
    margin-bottom: var(--blueprint-spacing-md);
  }

  .table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-lg);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 900px;
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

  .contact-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .phone {
    color: var(--aico-color-text-secondary);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--blueprint-spacing-xs);
  }
</style>
