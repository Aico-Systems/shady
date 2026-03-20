export const BOOKING_SCOPES = {
	BOOKINGS_WRITE: "bookings:write",
	BOOKINGS_DELETE: "bookings:delete",
	USERS_WRITE: "users:write",
	USERS_AVAILABILITY: "users:availability",
	CALENDAR_CONNECT: "calendar:connect",
	CONFIG_WRITE: "config:write",
} as const;

export const ALL_BOOKING_SCOPES = Object.values(BOOKING_SCOPES);
