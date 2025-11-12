import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load .env from parent directory (shady/.env)
dotenvConfig({ path: resolve(__dirname, '../../..', '.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value || defaultValue!;
}

function getEnvOptional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // Database
  DATABASE_URL: getEnv('DATABASE_URL'),

  // Google Calendar
  GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: getEnv('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: getEnv('GOOGLE_REDIRECT_URI'),
  GOOGLE_SCOPES: getEnvOptional('GOOGLE_SCOPES', 'https://www.googleapis.com/auth/calendar.events'),

  // MailSend
  MAILSEND_API_TOKEN: getEnvOptional('MAILSEND_API_TOKEN', ''),
  MAILSEND_FROM_EMAIL: getEnvOptional('MAILSEND_FROM_EMAIL', 'booking@example.com'),
  MAILSEND_FROM_NAME: getEnvOptional('MAILSEND_FROM_NAME', 'Booking Service'),

  // Logto
  LOGTO_ENDPOINT: getEnv('LOGTO_ENDPOINT'),
  LOGTO_ISSUER: getEnv('LOGTO_ISSUER'),
  LOGTO_JWKS_URL: getEnvOptional('LOGTO_JWKS_URL', `${getEnv('LOGTO_ENDPOINT')}/oidc/jwks`),
  LOGTO_API_RESOURCE: getEnvOptional('LOGTO_API_RESOURCE', 'https://api.booking-service.local'),
  LOGTO_MANAGEMENT_APP_ID: getEnvOptional('LOGTO_MANAGEMENT_APP_ID', ''),
  LOGTO_MANAGEMENT_APP_SECRET: getEnvOptional('LOGTO_MANAGEMENT_APP_SECRET', ''),

  // Service
  NODE_ENV: getEnvOptional('NODE_ENV', 'development'),
  PORT: parseInt(getEnvOptional('PORT', '5006')),
  LOG_LEVEL: getEnvOptional('LOG_LEVEL', 'INFO'),

  // Booking settings
  CALENDAR_SYNC_INTERVAL: parseInt(getEnvOptional('CALENDAR_SYNC_INTERVAL', '5')),
  DEFAULT_BOOKING_DURATION_MINUTES: parseInt(getEnvOptional('DEFAULT_BOOKING_DURATION_MINUTES', '30')),
  DEFAULT_ADVANCE_BOOKING_DAYS: parseInt(getEnvOptional('DEFAULT_ADVANCE_BOOKING_DAYS', '30')),

  // URLs
  BACKEND_URL: getEnvOptional('BACKEND_URL', 'http://localhost:5006'),
  ADMIN_URL: getEnvOptional('ADMIN_URL', 'http://localhost:5175'),
  WIDGET_URL: getEnvOptional('WIDGET_URL', 'http://localhost:5174'),
};
