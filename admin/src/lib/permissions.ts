import { derived, readable } from 'svelte/store';
import { getLogtoAuth } from '@aico/blueprint';
import { BOOKING_SCOPES } from './scopes';

function createScopeStore(scope: string) {
  return readable(false, (set) => {
    const { isSuperAdmin, userScopes } = getLogtoAuth();

    return derived([isSuperAdmin, userScopes], ([$isSuperAdmin, $userScopes]) =>
      $isSuperAdmin || $userScopes.includes(scope)
    ).subscribe(set);
  });
}

export const canManageBookings = createScopeStore(BOOKING_SCOPES.BOOKINGS_WRITE);

export const canManageUsers = createScopeStore(BOOKING_SCOPES.MANAGE_USERS);

export const canManageAvailability = createScopeStore(BOOKING_SCOPES.MANAGE_USERS);

export const canConnectCalendar = createScopeStore(BOOKING_SCOPES.CONNECT_CALENDAR);

export const canManageConfig = createScopeStore(BOOKING_SCOPES.MANAGE_CONFIG);
