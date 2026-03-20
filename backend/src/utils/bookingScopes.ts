import type { LogtoUserContext } from './logtoAuth';

export const BOOKING_SCOPES = {
	READ: 'bookings:read',
	WRITE: 'bookings:write',
	MANAGE_USERS: 'bookings:manage_users',
	MANAGE_CONFIG: 'bookings:manage_config',
	CONNECT_CALENDAR: 'bookings:connect_calendar',
} as const;

export function hasAnyScope(
	userContext: LogtoUserContext,
	scopes: readonly string[],
): boolean {
	if (userContext.isSuperAdmin) {
		return true;
	}

	return scopes.some((scope) => userContext.scopes.includes(scope));
}
