import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  interval,
  mergeIntervals,
  overlaps,
  sliceIntoSlots,
  subtractIntervals,
  withinAdvanceWindow,
} from './interval';

const at = (iso: string) => new Date(iso);
const window = (from: string, to: string) => interval(at(from), at(to));
const isoOf = (i: { start: Date; end: Date }) => [i.start.toISOString(), i.end.toISOString()];

describe('overlaps — intervalos semiabertos [)', () => {
  it('duas marcações que se tocam nas pontas NÃO se sobrepõem', () => {
    // É a regra que decide se metade da agenda fica por preencher.
    // 10:00–10:30 e 10:30–11:00 são consecutivas, não conflituosas.
    const a = window('2026-08-17T10:00:00Z', '2026-08-17T10:30:00Z');
    const b = window('2026-08-17T10:30:00Z', '2026-08-17T11:00:00Z');
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it('um minuto de sobreposição já é sobreposição', () => {
    const a = window('2026-08-17T10:00:00Z', '2026-08-17T10:30:00Z');
    const b = window('2026-08-17T10:29:00Z', '2026-08-17T11:00:00Z');
    expect(overlaps(a, b)).toBe(true);
  });

  it('contenção total conta como sobreposição', () => {
    const outer = window('2026-08-17T09:00:00Z', '2026-08-17T18:00:00Z');
    const inner = window('2026-08-17T10:00:00Z', '2026-08-17T10:30:00Z');
    expect(overlaps(outer, inner)).toBe(true);
  });
});

describe('mergeIntervals', () => {
  it('funde os que se sobrepõem e os que se tocam', () => {
    const merged = mergeIntervals([
      window('2026-08-17T10:00:00Z', '2026-08-17T11:00:00Z'),
      window('2026-08-17T10:30:00Z', '2026-08-17T12:00:00Z'),
      window('2026-08-17T12:00:00Z', '2026-08-17T13:00:00Z'),
    ]);
    expect(merged).toHaveLength(1);
    expect(isoOf(merged[0]!)).toEqual([
      '2026-08-17T10:00:00.000Z',
      '2026-08-17T13:00:00.000Z',
    ]);
  });

  it('mantém separados os que têm intervalo entre si', () => {
    const merged = mergeIntervals([
      window('2026-08-17T09:00:00Z', '2026-08-17T10:00:00Z'),
      window('2026-08-17T14:00:00Z', '2026-08-17T15:00:00Z'),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('ordena a entrada desordenada e ignora intervalos degenerados', () => {
    const merged = mergeIntervals([
      window('2026-08-17T14:00:00Z', '2026-08-17T15:00:00Z'),
      window('2026-08-17T11:00:00Z', '2026-08-17T11:00:00Z'), // vazio
      window('2026-08-17T09:00:00Z', '2026-08-17T10:00:00Z'),
    ]);
    expect(merged.map(isoOf)).toEqual([
      ['2026-08-17T09:00:00.000Z', '2026-08-17T10:00:00.000Z'],
      ['2026-08-17T14:00:00.000Z', '2026-08-17T15:00:00.000Z'],
    ]);
  });
});

describe('subtractIntervals — o coração do cálculo de disponibilidade', () => {
  it('uma marcação a meio parte a janela em duas', () => {
    const result = subtractIntervals(
      [window('2026-08-17T09:00:00Z', '2026-08-17T13:00:00Z')],
      [window('2026-08-17T10:00:00Z', '2026-08-17T10:30:00Z')],
    );
    expect(result.map(isoOf)).toEqual([
      ['2026-08-17T09:00:00.000Z', '2026-08-17T10:00:00.000Z'],
      ['2026-08-17T10:30:00.000Z', '2026-08-17T13:00:00.000Z'],
    ]);
  });

  it('um bloqueio que cobre tudo não deixa nada', () => {
    const result = subtractIntervals(
      [window('2026-08-17T09:00:00Z', '2026-08-17T13:00:00Z')],
      [window('2026-08-17T08:00:00Z', '2026-08-17T14:00:00Z')],
    );
    expect(result).toEqual([]);
  });

  it('um bloqueio fora da janela não a afeta', () => {
    const base = window('2026-08-17T09:00:00Z', '2026-08-17T13:00:00Z');
    const result = subtractIntervals([base], [window('2026-08-17T15:00:00Z', '2026-08-17T16:00:00Z')]);
    expect(result.map(isoOf)).toEqual([isoOf(base)]);
  });

  it('lida com pausa de almoço mais duas marcações', () => {
    const result = subtractIntervals(
      [window('2026-08-17T09:00:00Z', '2026-08-17T18:00:00Z')],
      [
        window('2026-08-17T13:00:00Z', '2026-08-17T14:00:00Z'), // almoço
        window('2026-08-17T09:30:00Z', '2026-08-17T10:15:00Z'),
        window('2026-08-17T16:00:00Z', '2026-08-17T17:00:00Z'),
      ],
    );
    expect(result.map(isoOf)).toEqual([
      ['2026-08-17T09:00:00.000Z', '2026-08-17T09:30:00.000Z'],
      ['2026-08-17T10:15:00.000Z', '2026-08-17T13:00:00.000Z'],
      ['2026-08-17T14:00:00.000Z', '2026-08-17T16:00:00.000Z'],
      ['2026-08-17T17:00:00.000Z', '2026-08-17T18:00:00.000Z'],
    ]);
  });
});

describe('sliceIntoSlots', () => {
  it('só oferece inícios em que o serviço cabe por inteiro', () => {
    // Janela de 09:00 a 10:00, serviço de 45 min, passo de 15: 09:00 e 09:15.
    // Às 09:30 já não cabe.
    const slots = sliceIntoSlots(window('2026-08-17T09:00:00Z', '2026-08-17T10:00:00Z'), 45, 15);
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-08-17T09:00:00.000Z',
      '2026-08-17T09:15:00.000Z',
    ]);
  });

  it('alinha a uma grelha em vez de propor horas como 10:37', () => {
    const anchor = at('2026-08-17T00:00:00Z');
    const slots = sliceIntoSlots(
      window('2026-08-17T10:07:00Z', '2026-08-17T11:00:00Z'),
      30,
      15,
      anchor,
    );
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-08-17T10:15:00.000Z',
      '2026-08-17T10:30:00.000Z',
    ]);
  });

  it('devolve vazio quando o serviço não cabe na janela', () => {
    expect(sliceIntoSlots(window('2026-08-17T09:00:00Z', '2026-08-17T09:20:00Z'), 30, 15)).toEqual(
      [],
    );
  });

  it('recusa parâmetros inválidos em vez de entrar em ciclo infinito', () => {
    const w = window('2026-08-17T09:00:00Z', '2026-08-17T18:00:00Z');
    expect(sliceIntoSlots(w, 0, 15)).toEqual([]);
    expect(sliceIntoSlots(w, 30, 0)).toEqual([]);
    expect(sliceIntoSlots(w, 30, -15)).toEqual([]);
  });
});

describe('withinAdvanceWindow', () => {
  const now = at('2026-08-17T10:00:00Z');

  it('corta o que está demasiado perto e o que está demasiado longe', () => {
    const starts = [
      at('2026-08-17T10:30:00Z'), // 30 min — cedo demais com min de 120
      at('2026-08-17T13:00:00Z'), // 3 h — ok
      at('2026-11-20T10:00:00Z'), // 95 dias — longe demais com max de 90
    ];
    const filtered = withinAdvanceWindow(starts, now, 120, 90);
    expect(filtered.map((s) => s.toISOString())).toEqual(['2026-08-17T13:00:00.000Z']);
  });
});

/**
 * Teste de propriedade.
 *
 * Os exemplos acima cobrem o que nos lembrámos de imaginar. Este cobre o que
 * não nos lembrámos: gera centenas de combinações de janelas e bloqueios e
 * verifica a invariante que o produto inteiro assenta.
 */
describe('propriedades invariantes', () => {
  const arbInstant = fc
    .integer({ min: 0, max: 24 * 60 })
    .map((minutes) => new Date(Date.parse('2026-08-17T00:00:00Z') + minutes * 60_000));

  const arbInterval = fc
    .tuple(arbInstant, fc.integer({ min: 1, max: 240 }))
    .map(([start, minutes]) => interval(start, new Date(start.getTime() + minutes * 60_000)));

  it('nenhum resultado de subtractIntervals sobrepõe um bloqueio', () => {
    fc.assert(
      fc.property(
        fc.array(arbInterval, { minLength: 1, maxLength: 4 }),
        fc.array(arbInterval, { maxLength: 8 }),
        (base, blockers) => {
          const free = subtractIntervals(base, blockers);
          return free.every((f) => blockers.every((b) => !overlaps(f, b)));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('o tempo livre nunca excede o tempo de partida', () => {
    fc.assert(
      fc.property(
        fc.array(arbInterval, { minLength: 1, maxLength: 4 }),
        fc.array(arbInterval, { maxLength: 8 }),
        (base, blockers) => {
          const total = (list: readonly { start: Date; end: Date }[]) =>
            mergeIntervals(list).reduce((sum, i) => sum + (i.end.getTime() - i.start.getTime()), 0);
          return total(subtractIntervals(base, blockers)) <= total(base);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('os intervalos livres nunca se sobrepõem entre si', () => {
    fc.assert(
      fc.property(
        fc.array(arbInterval, { minLength: 1, maxLength: 4 }),
        fc.array(arbInterval, { maxLength: 8 }),
        (base, blockers) => {
          const free = subtractIntervals(base, blockers);
          for (let i = 0; i < free.length; i += 1) {
            for (let j = i + 1; j < free.length; j += 1) {
              if (overlaps(free[i]!, free[j]!)) return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});
