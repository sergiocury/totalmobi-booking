/** Constantes partilhadas por toda a aplicação. */

export const SUPPORTED_LOCALES = ['pt-PT', 'pt-BR', 'en'] as const;
export const DEFAULT_LOCALE = 'pt-PT';

export const DEFAULT_TIMEZONE = 'Europe/Lisbon';
export const DEFAULT_CURRENCY = 'EUR';
export const DEFAULT_COUNTRY = 'PT';

/**
 * Funcionalidades por plano. Nunca escrever `if (plan === 'premium')` no
 * código — sempre `hasFeature(tenantId, 'whatsapp')`. Os planos mudam com a
 * área comercial; as funcionalidades mudam com o produto, e não ao mesmo tempo.
 */
export const FEATURE_KEYS = [
  'whatsapp',
  'chatbot_ai',
  'voice',
  'multi_location',
  'resources',
  'payments',
  'advanced_reports',
  'custom_domain',
  'api_access',
  'waitlist',
  'group_sessions',
  'widget',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const BOOKING_STATUSES = [
  'pending',
  'awaiting_confirmation',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled_customer',
  'cancelled_business',
  'no_show',
  'rescheduled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * Estados que ocupam o horário.
 *
 * Tem de coincidir exatamente com o predicado da constraint de exclusão em
 * `booking.bookings` (ver DATABASE.md, secção 7.3). Se divergirem, o motor
 * mostra slots que a base de dados depois recusa — ou pior, o contrário.
 */
export const OCCUPYING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'awaiting_confirmation',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
];

export function occupiesSlot(status: BookingStatus): boolean {
  return OCCUPYING_STATUSES.includes(status);
}

export const BOOKING_SOURCES = [
  'public_web',
  'widget',
  'whatsapp',
  'voice',
  'admin',
  'api',
  'import',
] as const;

export type BookingSource = (typeof BOOKING_SOURCES)[number];

/** Limites de segurança da plataforma. Um tenant nunca os ultrapassa. */
export const PLATFORM_LIMITS = {
  maxAdvanceDays: 730,
  maxSlotsPerQuery: 500,
  maxDateRangeDays: 92,
  minDataRetentionMonths: 12,
  accessTokenTtlDays: 30,
} as const;
