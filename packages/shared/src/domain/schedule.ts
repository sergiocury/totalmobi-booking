import {
  interval,
  mergeIntervals,
  subtractIntervals,
  wallClockToInstantLenient,
  weekdayOfDate,
  type TimeInterval,
} from '../time';

/**
 * Resolução do horário efetivo de um dia.
 *
 * É a peça de que o motor de disponibilidade (M7) parte: dado um dia, um
 * profissional e uma unidade, devolve os intervalos em que ele **poderia**
 * atender — antes de descontar marcações já feitas.
 *
 * PRECEDÊNCIA, POR ORDEM
 *
 *   1. exceção `closed`      → fecha, e ganha a tudo
 *   2. ausência do profissional → tira-o, mesmo com a unidade aberta
 *   3. exceção `open`        → abre fora do horário normal
 *   4. horário do profissional ∩ horário da unidade
 *
 * Não é arbitrária. Um feriado tem de fechar a clínica mesmo que alguém tenha
 * marcado uma abertura extraordinária nesse dia; e as férias de alguém têm de
 * valer mesmo com a unidade aberta.
 *
 * TUDO EM HORA LOCAL ATÉ AO ÚLTIMO PASSO
 *
 * Os horários recorrentes são horas de parede — "abro às 9" tem de continuar
 * verdadeiro depois da mudança da hora. A conversão para instante acontece só
 * no fim, com o fuso da unidade, e usa a versão permissiva: no dia em que o
 * relógio salta, parar a agenda com um erro não ajudaria ninguém.
 */

export interface WeeklyHours {
  readonly weekday: number;
  /** `HH:mm` na hora local da unidade. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** `YYYY-MM-DD`. `null` = sem limite. */
  readonly validFrom?: string | null;
  readonly validUntil?: string | null;
}

export interface ScheduleException {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly kind: 'closed' | 'open';
  /** `null` nos dois = o dia inteiro. */
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
}

export interface TimeOff {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface DayScheduleInput {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** IANA, da unidade. */
  readonly timezone: string;
  readonly locationHours: readonly WeeklyHours[];
  readonly staffHours: readonly WeeklyHours[];
  /** Exceções já filtradas para este dia, de qualquer âmbito. */
  readonly exceptions: readonly ScheduleException[];
  readonly timeOff: readonly TimeOff[];
}

/** Uma linha de horário está em vigor nesta data? */
export function isHoursValidOn(hours: WeeklyHours, date: string): boolean {
  if (hours.validFrom && date < hours.validFrom) return false;
  if (hours.validUntil && date > hours.validUntil) return false;
  return true;
}

/** Períodos de um dia da semana, em hora local, já filtrados por validade. */
export function periodsForDay(
  hours: readonly WeeklyHours[],
  date: string,
): { startsAt: string; endsAt: string }[] {
  const weekday = weekdayOfDate(date);

  return hours
    .filter((h) => h.weekday === weekday && isHoursValidOn(h, date))
    .map((h) => ({ startsAt: h.startsAt, endsAt: h.endsAt }));
}

/** Interseção de dois conjuntos de períodos em hora local (`HH:mm`). */
function intersectLocal(
  a: readonly { startsAt: string; endsAt: string }[],
  b: readonly { startsAt: string; endsAt: string }[],
): { startsAt: string; endsAt: string }[] {
  const resultado: { startsAt: string; endsAt: string }[] = [];

  for (const x of a) {
    for (const y of b) {
      // As horas em `HH:mm` comparam-se lexicograficamente sem conversão —
      // é uma das razões para as guardar assim.
      const inicio = x.startsAt > y.startsAt ? x.startsAt : y.startsAt;
      const fim = x.endsAt < y.endsAt ? x.endsAt : y.endsAt;
      if (inicio < fim) resultado.push({ startsAt: inicio, endsAt: fim });
    }
  }

  return resultado;
}

export interface DaySchedule {
  /** Intervalos em que o profissional poderia atender. Vazio = não trabalha. */
  readonly windows: TimeInterval[];
  /** Porque é que o dia está vazio, quando está. Serve para explicar na UI. */
  readonly closedReason: 'exception' | 'no_location_hours' | 'no_staff_hours' | 'time_off' | null;
}

/**
 * Resolve o horário de um dia.
 *
 * Devolve instantes (UTC por dentro), prontos para o motor subtrair marcações.
 */
export function resolveDaySchedule(input: DayScheduleInput): DaySchedule {
  const { date, timezone } = input;

  // 1. Uma exceção `closed` de dia inteiro fecha tudo, e não há mais nada a ver.
  const fechoTotal = input.exceptions.find((e) => e.kind === 'closed' && !e.startsAt);
  if (fechoTotal) {
    return { windows: [], closedReason: 'exception' };
  }

  // 2. Horário base: profissional ∩ unidade, em hora local.
  const horasUnidade = periodsForDay(input.locationHours, date);
  const horasStaff = periodsForDay(input.staffHours, date);

  const locais = intersectLocal(horasStaff, horasUnidade);

  const semUnidade = horasUnidade.length === 0;
  const semStaff = horasStaff.length === 0;

  // 3. Aberturas extraordinárias acrescentam-se ao que houver. Uma exceção
  //    `open` vale mesmo num dia em que ninguém trabalharia — é para isso que
  //    serve: abrir num domingo, receber um cliente fora de horas.
  for (const excecao of input.exceptions) {
    if (excecao.kind === 'open' && excecao.startsAt && excecao.endsAt) {
      locais.push({ startsAt: excecao.startsAt, endsAt: excecao.endsAt });
    }
  }

  if (locais.length === 0) {
    return {
      windows: [],
      closedReason: semUnidade ? 'no_location_hours' : semStaff ? 'no_staff_hours' : null,
    };
  }

  // 4. Converter para instantes, com o fuso da unidade.
  //
  //    Versão permissiva de propósito: na madrugada em que o relógio salta, uma
  //    hora local pode não existir ou existir duas vezes. Parar a agenda com um
  //    erro seria pior do que escolher — o que se quer é uma agenda coerente.
  let janelas: TimeInterval[] = locais.map((p) =>
    interval(
      wallClockToInstantLenient({ date, time: p.startsAt }, timezone),
      wallClockToInstantLenient({ date, time: p.endsAt }, timezone),
    ),
  );

  janelas = mergeIntervals(janelas);

  // 5. Descontar fechos parciais e ausências. As ausências já são instantes.
  const bloqueios: TimeInterval[] = [];

  for (const excecao of input.exceptions) {
    if (excecao.kind === 'closed' && excecao.startsAt && excecao.endsAt) {
      bloqueios.push(
        interval(
          wallClockToInstantLenient({ date, time: excecao.startsAt }, timezone),
          wallClockToInstantLenient({ date, time: excecao.endsAt }, timezone),
        ),
      );
    }
  }

  for (const ausencia of input.timeOff) {
    bloqueios.push(interval(ausencia.startsAt, ausencia.endsAt));
  }

  const livres = subtractIntervals(janelas, bloqueios);

  if (livres.length === 0) {
    // Havia janela e ficou tudo bloqueado. Distinguir a causa permite à UI
    // dizer "de férias" em vez de "não trabalha", que são coisas diferentes.
    const porAusencia = input.timeOff.length > 0;
    return { windows: [], closedReason: porAusencia ? 'time_off' : 'exception' };
  }

  return { windows: livres, closedReason: null };
}

/**
 * As exceções que se aplicam a um profissional numa unidade.
 *
 * Filtra por âmbito: as do tenant valem para toda a gente, as da unidade só
 * para quem lá está, e as do profissional só para ele. Separado da resolução
 * porque quem carrega os dados normalmente traz tudo de uma vez.
 */
export function filterExceptions<
  T extends {
    date: string;
    scopeTenant: boolean;
    locationId: string | null;
    staffId: string | null;
  },
>(exceptions: readonly T[], date: string, locationId: string, staffId: string): T[] {
  return exceptions.filter(
    (e) =>
      e.date === date &&
      (e.scopeTenant || e.locationId === locationId || e.staffId === staffId),
  );
}

/** Etiquetas dos dias da semana. 0 = domingo, como no PostgreSQL. */
export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
