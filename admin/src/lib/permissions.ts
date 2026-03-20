import { derived } from 'svelte/store';
import { userScopes } from '@aico/blueprint';
import { BOOKING_SCOPES } from './scopes';

export const canManageBookings = derived(userScopes, $userScopes =>
  $userScopes.includes(BOOKING_SCOPES.BOOKINGS_WRITE) || $userScopes.includes(BOOKING_SCOPES.BOOKINGS_DELETE)
);

export const canManageUsers = derived(userScopes, $userScopes =>
  $userScopes.includes(BOOKING_SCOPES.USERS_WRITE)
);

export const canManageAvailability = derived(userScopes, $userScopes =>
  $userScopes.includes(BOOKING_SCOPES.USERS_AVAILABILITY)
);

export const canConnectCalendar = derived(userScopes, $userScopes =>
  $userScopes.includes(BOOKING_SCOPES.CALENDAR_CONNECT)
);

export const canManageConfig = derived(userScopes, $userScopes =>
  $userScopes.includes(BOOKING_SCOPES.CONFIG_WRITE)
);
