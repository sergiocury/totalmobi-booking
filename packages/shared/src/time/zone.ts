import { DateTime, IANAZone, Interval } from 'luxon';

import { DomainErrorCode, domainError, type DomainError } from '../errors';
import { err, ok, type Result } from '../result';

/**
 * Conversão entre hora local e instante, com horário de verão tratado à mão.
 *
 * Este é o único módulo do projeto autorizado a converter entre hora de parede
 * ("abro às 9") e instante absoluto. Tudo o resto trabalha com `Date`/epoch em
 * UTC e formata no fim.
 *
 * A razão para não usar `DateTime.fromISO(str, { zone })` diretamente é que o
 * Luxon resolve os casos difíceis em silêncio: uma hora que não existe (a
 * madrugada em que o relógio salta para a frente) é empurrada, e uma hora
 * ambígua (a madrugada em que o relógio recua e 01:30 acontece duas vezes)
 * escolhe a primeira. Num sistema de marcações, resolver isto em silêncio
 * significa marcar o cliente à hora errada — e ninguém dá por isso até ao dia.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface WallClock {
  /** `YYYY-MM-DD` na zona indicada. */
  readonly date: string;
  /** `HH:mm` (24 h) na zona indicada. */
  readonly time: string;
}

export type LocalTimeResolution =
  | { readonly kind: 'unique'; readonly instant: Date }
  /** A hora não existe: o relógio saltou por cima dela. */
  | { readonly kind: 'nonexistent'; readonly nextValid: Date }
  /** A hora aconteceu duas vezes. `first` é a de antes da mudança. */
  | { readonly kind: 'ambiguous'; readonly first: Date; readonly second: Date };

export function isValidTimezone(timezone: string): boolean {
  return IANAZone.isValidZone(timezone);
}

export function assertTimezone(timezone: string): Result<string, DomainError> {
  return isValidTimezone(timezone)
    ? ok(timezone)
    : err(
        domainError(DomainErrorCode.INVALID_TIMEZONE, `Fuso horário desconhecido: ${timezone}`, {
          field: 'timezone',
        }),
      );
}

/** Desvio da zona, em minutos, no instante indicado. */
export function zoneOffsetMinutes(timezone: string, instant: Date | number): number {
  const ts = typeof instant === 'number' ? instant : instant.getTime();
  return IANAZone.create(timezone).offset(ts);
}

/**
 * Todos os instantes que correspondem a uma dada hora de parede.
 *
 * Normalmente devolve um; zero se a hora não existe naquele dia; dois se o
 * relógio recuou e a hora se repetiu. O algoritmo é o clássico: tratar a hora
 * de parede como se fosse UTC, gerar candidatos com o desvio de 24 h antes e de
 * 24 h depois (que abrangem qualquer transição), e manter apenas os que voltam
 * a dar a mesma hora de parede.
 */
export function instantsForWallClock(wall: WallClock, timezone: string): Date[] {
  const parsed = parseWallClock(wall);
  if (parsed === null) return [];

  const wallAsUtcMs = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
  );

  const offsetBefore = zoneOffsetMinutes(timezone, wallAsUtcMs - DAY_MS);
  const offsetAfter = zoneOffsetMinutes(timezone, wallAsUtcMs + DAY_MS);

  const candidates = new Set<number>([
    wallAsUtcMs - offsetBefore * MINUTE_MS,
    wallAsUtcMs - offsetAfter * MINUTE_MS,
  ]);

  const valid = [...candidates]
    .filter((ts) => zoneOffsetMinutes(timezone, ts) * MINUTE_MS === wallAsUtcMs - ts)
    .sort((a, b) => a - b);

  return valid.map((ts) => new Date(ts));
}

/** Resolve uma hora de parede, dizendo explicitamente o que aconteceu. */
export function resolveWallClock(wall: WallClock, timezone: string): LocalTimeResolution {
  const instants = instantsForWallClock(wall, timezone);

  if (instants.length === 1) {
    return { kind: 'unique', instant: instants[0]! };
  }

  if (instants.length >= 2) {
    return { kind: 'ambiguous', first: instants[0]!, second: instants[1]! };
  }

  // Hora inexistente: o Luxon empurra-a para o outro lado da transição, o que é
  // exatamente o "próximo instante válido" que queremos oferecer.
  const shifted = DateTime.fromISO(`${wall.date}T${wall.time}`, { zone: timezone });
  return { kind: 'nonexistent', nextValid: shifted.toJSDate() };
}

/**
 * Converte hora de parede em instante, recusando os casos ambíguos.
 *
 * É a função a usar em tudo o que é input de utilizador: mais vale devolver um
 * erro que a UI explica ("nessa noite o relógio muda; escolha outra hora") do
 * que adivinhar.
 */
export function wallClockToInstant(
  wall: WallClock,
  timezone: string,
): Result<Date, DomainError> {
  const zoneCheck = assertTimezone(timezone);
  if (!zoneCheck.ok) return zoneCheck;

  const resolution = resolveWallClock(wall, timezone);

  switch (resolution.kind) {
    case 'unique':
      return ok(resolution.instant);
    case 'nonexistent':
      return err(
        domainError(
          DomainErrorCode.NONEXISTENT_LOCAL_TIME,
          `${wall.date} ${wall.time} não existe em ${timezone}: o relógio adiantou-se`,
          { details: { nextValid: resolution.nextValid.toISOString() } },
        ),
      );
    case 'ambiguous':
      return err(
        domainError(
          DomainErrorCode.AMBIGUOUS_LOCAL_TIME,
          `${wall.date} ${wall.time} acontece duas vezes em ${timezone}: o relógio atrasou-se`,
          {
            details: {
              first: resolution.first.toISOString(),
              second: resolution.second.toISOString(),
            },
          },
        ),
      );
  }
}

/**
 * Como `wallClockToInstant`, mas escolhe uma leitura em vez de falhar.
 *
 * Para dados gerados pelo sistema (expandir um horário semanal recorrente sobre
 * um intervalo de datas), parar por causa da mudança de hora não ajuda ninguém:
 * o que se quer é uma agenda coerente. Na hora ambígua fica-se pela primeira
 * ocorrência; na inexistente, pelo instante seguinte.
 */
export function wallClockToInstantLenient(wall: WallClock, timezone: string): Date {
  const resolution = resolveWallClock(wall, timezone);
  switch (resolution.kind) {
    case 'unique':
      return resolution.instant;
    case 'ambiguous':
      return resolution.first;
    case 'nonexistent':
      return resolution.nextValid;
  }
}

/** Hora de parede correspondente a um instante, na zona indicada. */
export function instantToWallClock(instant: Date, timezone: string): WallClock {
  const dt = DateTime.fromJSDate(instant, { zone: timezone });
  return { date: dt.toFormat('yyyy-MM-dd'), time: dt.toFormat('HH:mm') };
}

/** Dia da semana na zona indicada: 0 = domingo, para bater com `EXTRACT(DOW)`. */
export function weekdayInZone(instant: Date, timezone: string): number {
  return DateTime.fromJSDate(instant, { zone: timezone }).weekday % 7;
}

/** Dia da semana de uma data `YYYY-MM-DD`, sem envolver instantes. */
export function weekdayOfDate(date: string): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday % 7;
}

/**
 * Soma minutos a um instante.
 *
 * Aritmética pura de epoch, deliberadamente: 30 minutos são 30 minutos em
 * qualquer zona, inclusive por cima de uma transição de horário de verão.
 * Uma consulta de 30 minutos que comece às 01:45 na noite da mudança termina
 * às 03:15 no relógio — e é isso que está certo.
 */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}

export function diffMinutes(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MINUTE_MS;
}

/**
 * Soma dias de calendário na zona indicada.
 *
 * Não é o mesmo que somar 24 h: no dia da mudança de hora, "amanhã à mesma
 * hora" está a 23 ou a 25 horas de distância. A agenda pensa em dias de
 * calendário, não em múltiplos de 24 h.
 */
export function addCalendarDays(instant: Date, days: number, timezone: string): Date {
  return DateTime.fromJSDate(instant, { zone: timezone }).plus({ days }).toJSDate();
}

/** Início do dia (00:00 local) na zona indicada. */
export function startOfDayInZone(date: string, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).startOf('day').toJSDate();
}

/** Fim exclusivo do dia — 00:00 do dia seguinte. */
export function endOfDayInZone(date: string, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).startOf('day').plus({ days: 1 }).toJSDate();
}

/** Lista de datas `YYYY-MM-DD` entre duas datas, inclusive. */
export function datesBetween(fromDate: string, toDate: string): string[] {
  const start = DateTime.fromISO(fromDate, { zone: 'utc' }).startOf('day');
  const end = DateTime.fromISO(toDate, { zone: 'utc' }).startOf('day');
  if (!start.isValid || !end.isValid || end < start) return [];

  return Interval.fromDateTimes(start, end.plus({ days: 1 }))
    .splitBy({ days: 1 })
    .map((i) => i.start!.toFormat('yyyy-MM-dd'));
}

/** Formatação para apresentação, na zona e locale indicados. */
export function formatInZone(
  instant: Date,
  timezone: string,
  locale: string,
  format: 'date' | 'time' | 'datetime' | 'weekday_short' = 'datetime',
): string {
  const dt = DateTime.fromJSDate(instant, { zone: timezone }).setLocale(locale);
  switch (format) {
    case 'date':
      return dt.toLocaleString(DateTime.DATE_SHORT);
    case 'time':
      return dt.toFormat('HH:mm');
    case 'weekday_short':
      return dt.toFormat('ccc dd');
    case 'datetime':
      return `${dt.toLocaleString(DateTime.DATE_SHORT)} ${dt.toFormat('HH:mm')}`;
  }
}

// --- internos ---------------------------------------------------------------

interface ParsedWallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function parseWallClock(wall: WallClock): ParsedWallClock | null {
  const dateMatch = DATE_RE.exec(wall.date);
  const timeMatch = TIME_RE.exec(wall.time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  // Rejeita 31 de fevereiro e afins: o Date.UTC normalizaria em silêncio.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return { year, month, day, hour, minute };
}
