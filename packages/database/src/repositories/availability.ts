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

import type { AvailabilityInput } from '@totalmobi/availability';

import type { BookingClient } from '../client/anon';

/**
 * O dataset de disponibilidade, numa chamada.
 *
 * A alternativa era carregar horários, exceções, ausências e marcações em
 * consultas separadas, por profissional. Num mês com cinco pessoas isso são
 * 150 idas à base de dados por cada clique no calendário — o N+1 clássico,
 * agora no caminho mais quente do produto.
 *
 * Toda a filtragem, a autorização e a escolha de colunas ficam do lado do
 * PostgreSQL, em `booking.availability_dataset()`. Aqui só se valida o que
 * chega e se traduz para a forma que o motor entende.
 *
 * POR QUE É QUE ISTO VALIDA COM ZOD EM VEZ DE CONFIAR NOS TIPOS
 *
 * A função devolve `jsonb`. Os tipos gerados dizem `Json`, que é
 * `unknown`-com-passos-extra: o TypeScript não sabe nada sobre a forma real.
 * Sem validação, uma alteração à função SQL passava despercebida até rebentar
 * em produção com um `Cannot read properties of undefined`. O Zod transforma
 * isso num erro com nome, no sítio certo.
 */

const horaSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Hora em formato HH:mm');
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data em formato YYYY-MM-DD');

const horarioSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: horaSchema,
  endsAt: horaSchema,
  // `.default(null)` em vez de `.optional()`: com `exactOptionalPropertyTypes`
  // uma propriedade opcional e uma propriedade que pode ser `null` são tipos
  // diferentes, e o motor declara a segunda.
  validFrom: dataSchema.nullable().default(null),
  validUntil: dataSchema.nullable().default(null),
});

const excecaoSchema = z.object({
  date: dataSchema,
  kind: z.enum(['closed', 'open']),
  startsAt: horaSchema.nullable(),
  endsAt: horaSchema.nullable(),
});

const ausenciaSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
});

const ocupadoSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
});

const pessoaSchema = z.object({
  staffId: z.uuid(),
  fullName: z.string(),
  photoUrl: z.string().nullable(),
  durationMinutes: z.number().int().positive(),
  workingHours: z.array(horarioSchema),
  timeOff: z.array(ausenciaSchema),
  exceptions: z.array(excecaoSchema),
  busy: z.array(ocupadoSchema),
});

const datasetSchema = z.object({
  tenantId: z.uuid(),
  timezone: z.string(),
  from: dataSchema,
  to: dataSchema,
  service: z.object({
    id: z.uuid(),
    name: z.string(),
    durationMinutes: z.number().int().positive(),
    bufferBeforeMinutes: z.number().int().min(0),
    bufferAfterMinutes: z.number().int().min(0),
    capacity: z.number().int().positive(),
    requiresConfirmation: z.boolean(),
  }),
  policy: z.object({
    slotGranularityMinutes: z.number().int().positive(),
    minAdvanceMinutes: z.number().int().min(0),
    maxAdvanceDays: z.number().int().positive(),
  }),
  locationHours: z.array(horarioSchema),
  exceptions: z.array(excecaoSchema),
  staff: z.array(pessoaSchema),
});

/** O dataset validado, ainda com datas em texto — como veio do PostgreSQL. */
export type AvailabilityDataset = z.infer<typeof datasetSchema>;

export interface LoadAvailabilityParams {
  locationId: string;
  serviceId: string;
  /** `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Opcional: "quero a Dra. Ana". */
  staffId?: string | undefined;
}

export async function loadAvailabilityDataset(
  client: BookingClient,
  params: LoadAvailabilityParams,
): Promise<Result<AvailabilityDataset, DomainError>> {
  const { data, error } = await client.rpc('availability_dataset', {
    p_location_id: params.locationId,
    p_service_id: params.serviceId,
    p_from: params.from,
    p_to: params.to,
    // Espalhado em vez de `?? null`: o parâmetro tem `default null` no SQL e o
    // tipo gerado é opcional. Com `exactOptionalPropertyTypes`, passar
    // `undefined` explicitamente não é o mesmo que não passar a chave.
    ...(params.staffId ? { p_staff_id: params.staffId } : {}),
  });

  if (error) return err(fromPostgresError(error.code, error.message));

  // A função devolve `null` para unidade desconhecida, serviço inexistente e
  // falta de autorização — de propósito, e com a mesma resposta nos três casos.
  // Distingui-los aqui desfaria isso: quem tentasse ids à sorte descobriria
  // quais existem.
  if (data === null) {
    return err(
      domainError(
        DomainErrorCode.NOT_FOUND,
        'Não foi possível calcular a disponibilidade para esta unidade e serviço.',
      ),
    );
  }

  const validado = datasetSchema.safeParse(data);

  if (!validado.success) {
    return err(
      domainError(
        DomainErrorCode.UNEXPECTED,
        `O dataset de disponibilidade não tem a forma esperada: ${validado.error.issues[0]?.message ?? 'erro desconhecido'}`,
      ),
    );
  }

  return ok(validado.data);
}

/**
 * Do dataset para a entrada do motor.
 *
 * É aqui que o texto vira instante. O PostgreSQL devolve as ausências como
 * `timestamptz` em ISO — com fuso — e os horários como horas de parede sem
 * fuso nenhum, que é como têm de ficar: "abro às 9" continua verdadeiro depois
 * da mudança da hora, e o motor é que converte, com o fuso da unidade.
 *
 * O `now` entra por parâmetro. O motor é puro e não lê relógio; quem sabe que
 * horas são é quem está a servir o pedido.
 */
export function toAvailabilityInput(
  dataset: AvailabilityDataset,
  date: string,
  now: Date,
): AvailabilityInput {
  return {
    date,
    timezone: dataset.timezone,
    now,
    service: {
      durationMinutes: dataset.service.durationMinutes,
      bufferBeforeMinutes: dataset.service.bufferBeforeMinutes,
      bufferAfterMinutes: dataset.service.bufferAfterMinutes,
      capacity: dataset.service.capacity,
    },
    policy: dataset.policy,
    locationHours: dataset.locationHours,
    exceptions: dataset.exceptions.filter((e) => e.date === date),
    staff: dataset.staff.map((p) => ({
      staffId: p.staffId,
      workingHours: p.workingHours,
      // As ausências chegam como instantes e ficam instantes: uma ausência
      // marcada de 3ª às 14:00 a 5ª às 09:00 é um bloco contínuo, não um
      // horário que se repete.
      timeOff: p.timeOff.map((a) => ({
        startsAt: new Date(a.startsAt),
        endsAt: new Date(a.endsAt),
      })),
      exceptions: p.exceptions.filter((e) => e.date === date),
      busy: p.busy.map((b) => ({
        range: { start: new Date(b.startsAt), end: new Date(b.endsAt) },
      })),
    })),
  };
}

/**
 * A duração pode variar por profissional, e o motor recebe **uma** duração.
 *
 * Quando as durações divergem, calcular uma vez só daria slots errados para
 * metade da equipa. A saída é correr o motor uma vez por duração distinta e
 * juntar — normalmente é uma só, e nesse caso isto não custa nada.
 */
export function agruparPorDuracao(dataset: AvailabilityDataset): Map<number, string[]> {
  const grupos = new Map<number, string[]>();

  for (const pessoa of dataset.staff) {
    const atual = grupos.get(pessoa.durationMinutes);
    if (atual) atual.push(pessoa.staffId);
    else grupos.set(pessoa.durationMinutes, [pessoa.staffId]);
  }

  return grupos;
}
