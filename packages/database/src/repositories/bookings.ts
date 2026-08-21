import { z } from 'zod';

import {
  DomainErrorCode,
  domainError,
  err,
  fromPostgresError,
  ok,
  type DomainError,
  type Result,
} from '@totalmobi/shared';

import type { BookingClient } from '../client/anon';

/**
 * Marcações.
 *
 * Tudo aqui chama funções do PostgreSQL. Não há um `insert` numa marcação em
 * lado nenhum do TypeScript, e isso é deliberado: entre verificar a
 * disponibilidade e escrever a linha há uma janela onde outra pessoa pode
 * marcar, e a única forma de a fechar é fazer as duas coisas na mesma
 * transação — do lado da base de dados.
 *
 * O QUE ESTE FICHEIRO FAZ DE FACTO
 *
 * Traduz. Os códigos de erro do PostgreSQL entram, os códigos de domínio saem.
 * `23P01` — a constraint de exclusão a disparar — vira `SLOT_TAKEN`, que é o
 * que a interface precisa de saber para dizer "essa hora acabou de ser
 * ocupada, veja estas outras".
 */

/** Códigos que as funções do M8 levantam de propósito. */
const CODIGOS: Record<string, DomainErrorCode> = {
  P0002: DomainErrorCode.NOT_FOUND,
  P0003: DomainErrorCode.OUTSIDE_WORKING_HOURS,
  P0004: DomainErrorCode.NOT_AUTHORIZED,
  P0005: DomainErrorCode.CONFLICT,
  P0006: DomainErrorCode.CANCELLATION_WINDOW_CLOSED,
  P0007: DomainErrorCode.CONFLICT,
  P0008: DomainErrorCode.CAPACITY_EXCEEDED,
};

function traduzir(error: { code?: string; message: string }): DomainError {
  const conhecido = error.code ? CODIGOS[error.code] : undefined;

  if (conhecido) {
    return domainError(conhecido, error.message, { details: { sqlState: error.code } });
  }

  return fromPostgresError(error.code, error.message);
}

export interface CustomerInput {
  firstName: string;
  lastName?: string | undefined;
  /** E.164. Um dos dois — telefone ou email — é obrigatório. */
  phone?: string | undefined;
  email?: string | undefined;
  locale?: string | undefined;
}

export interface CreateBookingParams {
  locationId: string;
  serviceId: string;
  /** Instante de início. O fim calcula-se da duração do serviço. */
  startAt: Date;
  customer: CustomerInput;
  source: 'public_web' | 'widget' | 'whatsapp' | 'voice' | 'admin' | 'api' | 'import';
  /** Opcional: sem isto, escolhe-se o primeiro profissional livre. */
  staffId?: string | undefined;
  notes?: string | undefined;
  /**
   * Repetir o mesmo pedido com a mesma chave devolve a mesma marcação.
   * É o que torna seguro voltar a tentar depois de um timeout.
   */
  idempotencyKey?: string | undefined;
}

const criacaoSchema = z.object({
  bookingId: z.uuid(),
  customerId: z.uuid().optional(),
  staffId: z.uuid().nullable().optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  status: z.string(),
  accessToken: z.string().optional(),
  idempotent: z.boolean(),
});

export type BookingCreated = z.infer<typeof criacaoSchema>;

export async function createBooking(
  client: BookingClient,
  params: CreateBookingParams,
): Promise<Result<BookingCreated, DomainError>> {
  const { data, error } = await client.rpc('create_booking_atomic', {
    p_location_id: params.locationId,
    p_service_id: params.serviceId,
    p_start_at: params.startAt.toISOString(),
    p_customer: {
      firstName: params.customer.firstName,
      lastName: params.customer.lastName ?? null,
      phone: params.customer.phone ?? null,
      email: params.customer.email ?? null,
      locale: params.customer.locale ?? 'pt-PT',
    },
    p_source: params.source,
    ...(params.staffId ? { p_staff_id: params.staffId } : {}),
    ...(params.notes ? { p_notes: params.notes } : {}),
    ...(params.idempotencyKey ? { p_idempotency_key: params.idempotencyKey } : {}),
  });

  if (error) return err(traduzir(error));

  const validado = criacaoSchema.safeParse(data);
  if (!validado.success) {
    return err(domainError(DomainErrorCode.UNEXPECTED, 'Resposta inesperada ao criar a marcação'));
  }

  return ok(validado.data);
}

export async function cancelBooking(
  client: BookingClient,
  bookingId: string,
  options: { reason?: string | undefined; byCustomer?: boolean } = {},
): Promise<Result<{ bookingId: string; status: string }, DomainError>> {
  const { data, error } = await client.rpc('cancel_booking', {
    p_booking_id: bookingId,
    ...(options.reason ? { p_reason: options.reason } : {}),
    p_by_customer: options.byCustomer ?? false,
  });

  if (error) return err(traduzir(error));

  return ok(data as { bookingId: string; status: string });
}

export async function rescheduleBooking(
  client: BookingClient,
  bookingId: string,
  newStart: Date,
  options: { staffId?: string | undefined; reason?: string | undefined; byCustomer?: boolean } = {},
): Promise<Result<{ bookingId: string; anterior: string }, DomainError>> {
  const { data, error } = await client.rpc('reschedule_booking', {
    p_booking_id: bookingId,
    p_new_start: newStart.toISOString(),
    ...(options.staffId ? { p_new_staff: options.staffId } : {}),
    ...(options.reason ? { p_reason: options.reason } : {}),
    p_by_customer: options.byCustomer ?? false,
  });

  if (error) {
    // Remarcar para uma hora ocupada é `SLOT_TAKEN`, não um erro genérico: a
    // interface tem de mostrar alternativas, não uma mensagem de falha.
    return err(traduzir(error));
  }

  return ok(data as { bookingId: string; anterior: string });
}

export async function confirmBooking(
  client: BookingClient,
  bookingId: string,
  reason?: string,
): Promise<Result<{ bookingId: string; status: string }, DomainError>> {
  const { data, error } = await client.rpc('confirm_booking', {
    p_booking_id: bookingId,
    ...(reason ? { p_reason: reason } : {}),
  });

  if (error) return err(traduzir(error));

  return ok(data as { bookingId: string; status: string });
}

export async function joinGroupSession(
  client: BookingClient,
  sessionId: string,
  customer: CustomerInput,
  source: CreateBookingParams['source'],
  idempotencyKey?: string,
): Promise<Result<{ bookingId: string; lugar: number; vagasRestantes: number }, DomainError>> {
  const { data, error } = await client.rpc('join_group_session', {
    p_session_id: sessionId,
    p_customer: {
      firstName: customer.firstName,
      lastName: customer.lastName ?? null,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
    },
    p_source: source,
    ...(idempotencyKey ? { p_idempotency_key: idempotencyKey } : {}),
  });

  if (error) return err(traduzir(error));

  return ok(data as { bookingId: string; lugar: number; vagasRestantes: number });
}
