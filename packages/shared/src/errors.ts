/**
 * Erros de domínio.
 *
 * Cada código é estável e serve três públicos ao mesmo tempo: a UI (que escolhe
 * a mensagem traduzida), os logs (que agregam por código) e o chatbot (que
 * decide o que dizer a seguir). Por isso o código nunca muda de significado —
 * acrescenta-se um novo em vez de reaproveitar um existente.
 */

export const DomainErrorCode = {
  // --- Autorização e tenancy ---
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  TENANT_INACTIVE: 'TENANT_INACTIVE',
  NO_MEMBERSHIP: 'NO_MEMBERSHIP',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',

  // --- Validação ---
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  INVALID_SLUG: 'INVALID_SLUG',
  NONEXISTENT_LOCAL_TIME: 'NONEXISTENT_LOCAL_TIME',
  AMBIGUOUS_LOCAL_TIME: 'AMBIGUOUS_LOCAL_TIME',

  // --- Disponibilidade e marcações ---
  SLOT_TAKEN: 'SLOT_TAKEN',
  SLOT_NOT_AVAILABLE: 'SLOT_NOT_AVAILABLE',
  OUTSIDE_WORKING_HOURS: 'OUTSIDE_WORKING_HOURS',
  TOO_SOON: 'TOO_SOON',
  TOO_FAR_AHEAD: 'TOO_FAR_AHEAD',
  STAFF_UNAVAILABLE: 'STAFF_UNAVAILABLE',
  SERVICE_NOT_BOOKABLE_ONLINE: 'SERVICE_NOT_BOOKABLE_ONLINE',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  CANCELLATION_WINDOW_CLOSED: 'CANCELLATION_WINDOW_CLOSED',
  RESCHEDULE_WINDOW_CLOSED: 'RESCHEDULE_WINDOW_CLOSED',
  BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
  BOOKING_ALREADY_COMPLETED: 'BOOKING_ALREADY_COMPLETED',

  // --- Tokens de acesso do cliente final ---
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_EXHAUSTED: 'TOKEN_EXHAUSTED',

  // --- Infraestrutura ---
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  CONFLICT: 'CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  UNEXPECTED: 'UNEXPECTED',
} as const;

export type DomainErrorCode = (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export interface DomainError {
  readonly code: DomainErrorCode;
  /** Mensagem técnica, para logs. Nunca é mostrada ao utilizador final. */
  readonly message: string;
  /** Contexto estruturado. Não colocar aqui dados pessoais. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Campo do formulário a que o erro se refere, quando aplicável. */
  readonly field?: string;
  readonly cause?: unknown;
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  extra?: Omit<DomainError, 'code' | 'message'>,
): DomainError {
  return { code, message, ...extra };
}

/** Erros que fazem sentido reservar um slot alternativo e voltar a tentar. */
const RETRYABLE = new Set<DomainErrorCode>([
  DomainErrorCode.SLOT_TAKEN,
  DomainErrorCode.SLOT_NOT_AVAILABLE,
  DomainErrorCode.CAPACITY_EXCEEDED,
]);

export function isRetryable(error: DomainError): boolean {
  return RETRYABLE.has(error.code);
}

/**
 * Códigos SQLSTATE do PostgreSQL que o domínio sabe interpretar.
 * `23P01` é `exclusion_violation` — a constraint que impede o double booking.
 */
export function fromPostgresError(sqlState: string | undefined, message: string): DomainError {
  switch (sqlState) {
    case '23P01':
      return domainError(DomainErrorCode.SLOT_TAKEN, 'Sobreposição rejeitada pela constraint', {
        details: { sqlState },
      });
    case '23505':
      return domainError(DomainErrorCode.CONFLICT, message, { details: { sqlState } });
    case '23503':
      return domainError(DomainErrorCode.NOT_FOUND, message, { details: { sqlState } });
    case '23514':
      return domainError(DomainErrorCode.VALIDATION_FAILED, message, { details: { sqlState } });
    case '42501':
      return domainError(DomainErrorCode.NOT_AUTHORIZED, message, { details: { sqlState } });
    default:
      return domainError(DomainErrorCode.UNEXPECTED, message, { details: { sqlState } });
  }
}

/** Estado HTTP adequado a cada código, para os Route Handlers. */
export function httpStatusFor(code: DomainErrorCode): number {
  switch (code) {
    case DomainErrorCode.NOT_AUTHENTICATED:
      return 401;
    case DomainErrorCode.NOT_AUTHORIZED:
    case DomainErrorCode.NO_MEMBERSHIP:
    case DomainErrorCode.FEATURE_NOT_AVAILABLE:
    case DomainErrorCode.TENANT_SUSPENDED:
      return 403;
    case DomainErrorCode.TENANT_NOT_FOUND:
    case DomainErrorCode.BOOKING_NOT_FOUND:
    case DomainErrorCode.NOT_FOUND:
    case DomainErrorCode.TOKEN_INVALID:
      return 404;
    case DomainErrorCode.SLOT_TAKEN:
    case DomainErrorCode.CONFLICT:
    case DomainErrorCode.CAPACITY_EXCEEDED:
      return 409;
    case DomainErrorCode.TOKEN_EXPIRED:
    case DomainErrorCode.TOKEN_EXHAUSTED:
      return 410;
    case DomainErrorCode.RATE_LIMITED:
      return 429;
    case DomainErrorCode.PROVIDER_ERROR:
      return 502;
    case DomainErrorCode.UNEXPECTED:
      return 500;
    default:
      return 400;
  }
}
