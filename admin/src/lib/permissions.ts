import { derived } from 'svelte/store';
import { userScopes } from '@aico/blueprint';

export const canManageBookings = derived(userScopes, $userScopes =>
  $userScopes.includes('bookings:write') || $userScopes.includes('bookings:delete')
);

export const canManageUsers = derived(userScopes, $userScopes =>
  $userScopes.includes('users:write')
);

export const canManageAvailability = derived(userScopes, $userScopes =>
  $userScopes.includes('users:availability')
);

export const canConnectCalendar = derived(userScopes, $userScopes =>
  $userScopes.includes('calendar:connect')
);

export const canManageConfig = derived(userScopes, $userScopes =>
  $userScopes.includes('config:write')
);
