import { describe, expect, it } from 'vitest';

import { DomainErrorCode } from '../errors';
import {
  addCalendarDays,
  addMinutes,
  datesBetween,
  instantToWallClock,
  instantsForWallClock,
  isValidTimezone,
  resolveWallClock,
  wallClockToInstant,
  wallClockToInstantLenient,
  weekdayOfDate,
  zoneOffsetMinutes,
} from './zone';

const LISBON = 'Europe/Lisbon';
const SAO_PAULO = 'America/Sao_Paulo';

describe('isValidTimezone', () => {
  it('aceita identificadores IANA reais', () => {
    expect(isValidTimezone(LISBON)).toBe(true);
    expect(isValidTimezone(SAO_PAULO)).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejeita o que não é IANA', () => {
    expect(isValidTimezone('Europe/Lisboa')).toBe(false);
    expect(isValidTimezone('GMT+1')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('hora de parede → instante, caso normal', () => {
  it('converte uma hora de inverno em Lisboa (UTC+0)', () => {
    const result = wallClockToInstant({ date: '2026-01-15', time: '09:00' }, LISBON);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('converte uma hora de verão em Lisboa (UTC+1)', () => {
    const result = wallClockToInstant({ date: '2026-07-15', time: '09:00' }, LISBON);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('converte uma hora em São Paulo (UTC-3, sem horário de verão desde 2019)', () => {
    const january = wallClockToInstant({ date: '2026-01-15', time: '09:00' }, SAO_PAULO);
    const july = wallClockToInstant({ date: '2026-07-15', time: '09:00' }, SAO_PAULO);

    expect(january.ok && january.value.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(july.ok && july.value.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('faz ida e volta sem perder informação', () => {
    const wall = { date: '2026-05-20', time: '14:30' };
    const result = wallClockToInstant(wall, LISBON);
    expect(result.ok).toBe(true);
    if (result.ok) expect(instantToWallClock(result.value, LISBON)).toEqual(wall);
  });
});

/**
 * Os dois casos que partem sistemas de marcações.
 *
 * Em Portugal, em 2026: o relógio adianta-se a 29 de março (01:00 → 02:00, e a
 * 01:30 nunca acontece) e atrasa-se a 25 de outubro (02:00 → 01:00, e a 01:30
 * acontece duas vezes).
 */
describe('horário de verão em Lisboa', () => {
  it('a hora que não existe é detetada, não empurrada em silêncio', () => {
    const resolution = resolveWallClock({ date: '2026-03-29', time: '01:30' }, LISBON);
    expect(resolution.kind).toBe('nonexistent');

    const result = wallClockToInstant({ date: '2026-03-29', time: '01:30' }, LISBON);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(DomainErrorCode.NONEXISTENT_LOCAL_TIME);
  });

  it('a hora ambígua é detetada e devolve as duas leituras', () => {
    const instants = instantsForWallClock({ date: '2026-10-25', time: '01:30' }, LISBON);
    expect(instants).toHaveLength(2);
    expect(instants[0]!.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(instants[1]!.toISOString()).toBe('2026-10-25T01:30:00.000Z');

    const result = wallClockToInstant({ date: '2026-10-25', time: '01:30' }, LISBON);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(DomainErrorCode.AMBIGUOUS_LOCAL_TIME);
  });

  it('as horas à volta da transição continuam a resolver-se normalmente', () => {
    for (const time of ['00:30', '03:30', '09:00']) {
      expect(instantsForWallClock({ date: '2026-03-29', time }, LISBON)).toHaveLength(1);
    }
    for (const time of ['00:30', '03:30', '09:00']) {
      expect(instantsForWallClock({ date: '2026-10-25', time }, LISBON)).toHaveLength(1);
    }
  });

  it('a versão permissiva escolhe uma leitura em vez de falhar', () => {
    // Serve para expandir horários semanais recorrentes: parar a agenda por
    // causa da mudança de hora não ajudaria ninguém.
    const ambiguous = wallClockToInstantLenient({ date: '2026-10-25', time: '01:30' }, LISBON);
    expect(ambiguous.toISOString()).toBe('2026-10-25T00:30:00.000Z');

    const nonexistent = wallClockToInstantLenient({ date: '2026-03-29', time: '01:30' }, LISBON);
    expect(nonexistent.getTime()).toBeGreaterThan(Date.parse('2026-03-29T00:00:00Z'));
  });

  it('São Paulo não tem transições — o Brasil aboliu o horário de verão em 2019', () => {
    for (const date of ['2026-02-15', '2026-10-18', '2026-11-01']) {
      expect(instantsForWallClock({ date, time: '01:30' }, SAO_PAULO)).toHaveLength(1);
    }
  });
});

describe('zoneOffsetMinutes', () => {
  it('reflete a mudança de hora em Lisboa', () => {
    expect(zoneOffsetMinutes(LISBON, Date.parse('2026-01-15T12:00:00Z'))).toBe(0);
    expect(zoneOffsetMinutes(LISBON, Date.parse('2026-07-15T12:00:00Z'))).toBe(60);
  });

  it('é constante em São Paulo', () => {
    expect(zoneOffsetMinutes(SAO_PAULO, Date.parse('2026-01-15T12:00:00Z'))).toBe(-180);
    expect(zoneOffsetMinutes(SAO_PAULO, Date.parse('2026-07-15T12:00:00Z'))).toBe(-180);
  });
});

describe('addMinutes vs addCalendarDays', () => {
  it('addMinutes é aritmética de instantes e atravessa a transição', () => {
    // A mudança da hora na UE é às 01:00 UTC. Como Lisboa está em UTC+0 no
    // inverno, o relógio local salta de 01:00 para 02:00.
    //
    // Uma consulta de 30 minutos que comece às 00:45 locais termina às 02:15
    // no relógio de parede: 90 minutos de relógio, 30 minutos de cadeira.
    // O que se cobra e o que se bloqueia na agenda são os 30.
    const start = new Date('2026-03-29T00:45:00Z');
    expect(instantToWallClock(start, LISBON).time).toBe('00:45');

    const end = addMinutes(start, 30);
    expect(end.toISOString()).toBe('2026-03-29T01:15:00.000Z');
    expect(instantToWallClock(end, LISBON).time).toBe('02:15');

    // A duração real não se deixou distorcer pela mudança de hora.
    expect((end.getTime() - start.getTime()) / 60_000).toBe(30);
  });

  it('addCalendarDays mantém a hora de parede, mesmo com mudança de hora pelo meio', () => {
    const before = new Date('2026-03-28T09:00:00Z'); // 09:00 em Lisboa (inverno)
    const after = addCalendarDays(before, 2, LISBON); // 30/03, já no verão
    expect(instantToWallClock(after, LISBON)).toEqual({ date: '2026-03-30', time: '09:00' });
    // 48 h "de calendário" são aqui 47 h reais.
    expect((after.getTime() - before.getTime()) / 3_600_000).toBe(47);
  });
});

describe('weekdayOfDate', () => {
  it('usa 0 = domingo, para bater com EXTRACT(DOW) do PostgreSQL', () => {
    expect(weekdayOfDate('2026-08-16')).toBe(0); // domingo
    expect(weekdayOfDate('2026-08-17')).toBe(1); // segunda
    expect(weekdayOfDate('2026-08-22')).toBe(6); // sábado
  });
});

describe('datesBetween', () => {
  it('inclui as duas pontas', () => {
    expect(datesBetween('2026-08-17', '2026-08-20')).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
    ]);
  });

  it('atravessa a mudança de mês e o fim do ano', () => {
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('devolve vazio quando o intervalo está invertido', () => {
    expect(datesBetween('2026-08-20', '2026-08-17')).toEqual([]);
  });
});

describe('validação de entrada', () => {
  it('recusa fusos inválidos', () => {
    const result = wallClockToInstant({ date: '2026-08-17', time: '10:00' }, 'Marte/Olympus');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(DomainErrorCode.INVALID_TIMEZONE);
  });

  it('recusa datas que não existem em vez de as normalizar em silêncio', () => {
    // O Date.UTC transformaria 31 de fevereiro em 3 de março sem se queixar.
    expect(instantsForWallClock({ date: '2026-02-31', time: '10:00' }, LISBON)).toEqual([]);
    expect(instantsForWallClock({ date: '2026-13-01', time: '10:00' }, LISBON)).toEqual([]);
    expect(instantsForWallClock({ date: '2026-08-17', time: '25:00' }, LISBON)).toEqual([]);
  });

  it('aceita 29 de fevereiro num ano bissexto', () => {
    expect(instantsForWallClock({ date: '2028-02-29', time: '10:00' }, LISBON)).toHaveLength(1);
    expect(instantsForWallClock({ date: '2026-02-29', time: '10:00' }, LISBON)).toEqual([]);
  });
});
