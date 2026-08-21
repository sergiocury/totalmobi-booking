import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  overlaps,
  resolveDaySchedule,
  weekdayOfDate,
  type TimeInterval,
} from '@totalmobi/shared';

import { blocoOcupado, getAvailableSlots } from './engine';
import type { AvailabilityInput, BusyInterval, StaffInput } from './types';

/**
 * Testes de propriedade.
 *
 * Os testes de exemplo provam os casos em que eu pensei. Estes provam os casos
 * em que não pensei — é a diferença entre "funciona no meu cenário" e "não
 * consigo arranjar um cenário em que falhe".
 *
 * Foi assim que apanhei o bug do `subtractIntervals` no M1: nenhum exemplo meu
 * tinha janelas base sobrepostas, e o gerador arranjou um em segundos.
 *
 * A propriedade nº 1 é a que justifica o resto todo: **um slot oferecido tem de
 * ser um slot que a base de dados aceite.** Se falhar, o cliente escolhe uma
 * hora e leva com um erro depois de a ter escolhido.
 */

const DIAS = [
  '2026-08-17', // segunda
  '2026-08-19', // quarta
  '2026-08-22', // sábado
  '2026-10-25', // recuo do relógio
  '2026-03-29', // avanço do relógio
];

const FUSOS = ['Europe/Lisbon', 'America/Sao_Paulo', 'Atlantic/Azores', 'Asia/Kolkata'];

/** `HH:mm` a partir de minutos desde a meia-noite. */
function hhmm(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * O gerador tem de produzir casos ÚTEIS, não só casos válidos.
 *
 * A primeira versão sorteava o horário da unidade e o do profissional de forma
 * independente. Resultado: 4 casos em 400 tinham disponibilidade — as
 * propriedades passavam sobre listas vazias, que é a forma mais silenciosa de
 * um teste não testar nada. O meta-teste no fim deste ficheiro é a guarda.
 *
 * A correção é gerar como a realidade é: o horário do profissional vive
 * **dentro** do da unidade, e ambos caem no dia que está a ser pedido. O ruído
 * (dias fechados, horizontes curtos) continua lá, mas em minoria.
 */

/** Um período no dia pedido: início, e um fim depois do início. */
function arbPeriodo(weekday: number) {
  return fc
    .tuple(fc.integer({ min: 0, max: 18 * 60 }), fc.integer({ min: 60, max: 10 * 60 }))
    .map(([inicio, duracao]) => ({
      weekday,
      startsAt: hhmm(inicio),
      endsAt: hhmm(Math.min(inicio + duracao, 24 * 60 - 1)),
    }))
    .filter((h) => h.startsAt < h.endsAt);
}

const arbServico = fc.record({
  durationMinutes: fc.integer({ min: 5, max: 240 }),
  bufferBeforeMinutes: fc.integer({ min: 0, max: 60 }),
  bufferAfterMinutes: fc.integer({ min: 0, max: 60 }),
  capacity: fc.integer({ min: 1, max: 3 }),
});

/** Marcações existentes, dadas como instantes dentro do dia gerado. */
function arbOcupado(date: string): fc.Arbitrary<BusyInterval> {
  return fc
    .tuple(fc.integer({ min: 0, max: 1439 }), fc.integer({ min: 5, max: 240 }))
    .map(([inicioMin, duracao]) => {
      const base = Date.parse(`${date}T00:00:00Z`);
      return {
        range: {
          start: new Date(base + inicioMin * 60_000),
          end: new Date(base + (inicioMin + duracao) * 60_000),
        },
      };
    });
}

function arbEntrada(): fc.Arbitrary<AvailabilityInput> {
  return fc.constantFrom(...DIAS).chain((date) => {
    const diaDaSemana = weekdayOfDate(date);

    return fc
      .record({
        timezone: fc.constantFrom(...FUSOS),
        service: arbServico,
        granularidade: fc.constantFrom(5, 10, 15, 20, 30, 60),
        minAdvanceMinutes: fc.integer({ min: 0, max: 240 }),
        // O horizonte cobre sempre a antecedência gerada abaixo — senão
        // cortava tudo e voltávamos às listas vazias.
        maxAdvanceDays: fc.integer({ min: 31, max: 365 }),
        diasAntes: fc.integer({ min: 0, max: 30 }),
        // Uma minoria dos casos cai noutro dia da semana de propósito: é assim
        // que continuam a aparecer dias fechados na amostra.
        diaDoHorario: fc.oneof(
          { weight: 8, arbitrary: fc.constant(diaDaSemana) },
          { weight: 2, arbitrary: fc.integer({ min: 0, max: 6 }) },
        ),
        quantosStaff: fc.integer({ min: 1, max: 3 }),
        quantasMarcacoes: fc.integer({ min: 0, max: 6 }),
      })
      .chain((base) =>
        fc
          .record({
            locationHours: fc.array(arbPeriodo(base.diaDoHorario), {
              minLength: 1,
              maxLength: 2,
            }),
            staffHours: fc.array(arbPeriodo(base.diaDoHorario), {
              minLength: 1,
              maxLength: 2,
            }),
            busy: fc.array(arbOcupado(date), {
              minLength: base.quantasMarcacoes,
              maxLength: base.quantasMarcacoes,
            }),
          })
          .map(({ locationHours, staffHours, busy }): AvailabilityInput => {
            const staff: StaffInput[] = Array.from(
              { length: base.quantosStaff },
              (_, i) => ({
                staffId: `s${i}`,
                workingHours: staffHours,
                timeOff: [],
                busy,
              }),
            );

            return {
              date,
              timezone: base.timezone,
              now: new Date(
                Date.parse(`${date}T00:00:00Z`) - base.diasAntes * 86_400_000,
              ),
              service: base.service,
              policy: {
                slotGranularityMinutes: base.granularidade,
                minAdvanceMinutes: base.minAdvanceMinutes,
                maxAdvanceDays: base.maxAdvanceDays,
              },
              locationHours,
              exceptions: [],
              staff,
            };
          }),
      );
  });
}

/** As janelas de trabalho de um profissional, tal como o motor as vê. */
function janelasDe(entrada: AvailabilityInput, profissional: StaffInput): TimeInterval[] {
  return resolveDaySchedule({
    date: entrada.date,
    timezone: entrada.timezone,
    locationHours: entrada.locationHours,
    staffHours: profissional.workingHours,
    exceptions: [...entrada.exceptions, ...(profissional.exceptions ?? [])],
    timeOff: profissional.timeOff,
  }).windows;
}

describe('propriedades do motor', () => {
  it('nenhum slot oferecido colide com uma marcação existente', () => {
    // A propriedade que justifica o motor todo. Compara-se `blocked_range` com
    // `blocked_range` — exatamente o que a constraint de exclusão faz.
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const { slots } = getAvailableSlots(entrada);

        for (const slot of slots) {
          const bloco = blocoOcupado(slot.start, entrada.service);

          for (const staffId of slot.staffIds) {
            const profissional = entrada.staff.find((s) => s.staffId === staffId)!;
            const colisoes = profissional.busy.filter((b) => overlaps(bloco, b.range)).length;

            // Com capacidade 1 não pode haver nenhuma; com capacidade N, menos
            // de N — senão a marcação seguinte estoirava.
            expect(colisoes).toBeLessThan(entrada.service.capacity);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('todo o slot cabe inteiro dentro de uma janela de trabalho', () => {
    // O serviço, não o bloco com buffers: os buffers podem transbordar de
    // propósito. Ver a decisão nº 1 em `engine.ts`.
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const { slots } = getAvailableSlots(entrada);

        for (const slot of slots) {
          for (const staffId of slot.staffIds) {
            const profissional = entrada.staff.find((s) => s.staffId === staffId)!;
            const janelas = janelasDe(entrada, profissional);

            const cabe = janelas.some(
              (j) => slot.start >= j.start && slot.end <= j.end,
            );
            expect(cabe).toBe(true);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('todo o slot respeita a janela de antecedência', () => {
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const { slots } = getAvailableSlots(entrada);
        const maisCedo = entrada.now.getTime() + entrada.policy.minAdvanceMinutes * 60_000;
        const maisTarde = entrada.now.getTime() + entrada.policy.maxAdvanceDays * 86_400_000;

        for (const slot of slots) {
          expect(slot.start.getTime()).toBeGreaterThanOrEqual(maisCedo);
          expect(slot.start.getTime()).toBeLessThanOrEqual(maisTarde);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('os slots vêm ordenados, sem repetições, e cada um com pelo menos um profissional', () => {
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const { slots } = getAvailableSlots(entrada);

        const instantes = slots.map((s) => s.start.getTime());
        expect(instantes).toEqual([...instantes].sort((a, b) => a - b));
        expect(new Set(instantes).size).toBe(instantes.length);

        for (const slot of slots) {
          expect(slot.staffIds.length).toBeGreaterThan(0);
          expect(new Set(slot.staffIds).size).toBe(slot.staffIds.length);
          expect(slot.end.getTime()).toBeGreaterThan(slot.start.getTime());
        }
      }),
      { numRuns: 300 },
    );
  });

  it('acrescentar uma marcação nunca aumenta o número de slots', () => {
    // Monotonia. Um motor que devolvesse mais disponibilidade depois de alguém
    // marcar teria um erro de sinal algures — e ninguém daria por isso a olhar
    // para um caso concreto.
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const antes = getAvailableSlots(entrada).slots.length;

        const base = Date.parse(`${entrada.date}T09:00:00Z`);
        const maisUma: BusyInterval = {
          range: { start: new Date(base), end: new Date(base + 60 * 60_000) },
        };

        const depois = getAvailableSlots({
          ...entrada,
          staff: entrada.staff.map((s) => ({ ...s, busy: [...s.busy, maisUma] })),
        }).slots.length;

        expect(depois).toBeLessThanOrEqual(antes);
      }),
      { numRuns: 300 },
    );
  });

  it('a função é determinista: a mesma entrada dá sempre a mesma resposta', () => {
    // Parece óbvio, mas é o que autoriza a memoizar, a cachear no CDN e a
    // reproduzir uma queixa de um cliente a partir dos dados que ele tinha.
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const a = getAvailableSlots(entrada);
        const b = getAvailableSlots(entrada);

        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: 200 },
    );
  });

  it('o gerador produz mesmo casos com slots — senão isto não provava nada', () => {
    // Meta-teste. Uma propriedade do género "nenhum slot colide" passa
    // triunfalmente se o gerador só produzir dias fechados. Este teste é a
    // guarda contra isso: se uma alteração aos geradores fizer secar os casos
    // úteis, falha aqui em vez de dar uma falsa sensação de cobertura.
    const amostra = fc.sample(arbEntrada(), 400);
    const resultados = amostra.map((e) => getAvailableSlots(e));
    const comSlots = resultados.filter((r) => r.slots.length > 0);
    const totalSlots = comSlots.reduce((s, r) => s + r.slots.length, 0);
    console.log(
      `[gerador] ${comSlots.length}/400 casos com disponibilidade, ${totalSlots} slots no total`,
    );

    const razoes = new Set(resultados.map((r) => r.reason).filter((r) => r !== null));

    // Pelo menos um quarto dos casos gerados tem disponibilidade real.
    expect(comSlots.length).toBeGreaterThan(100);
    // E os casos vazios não são todos pela mesma razão.
    expect(razoes.size).toBeGreaterThanOrEqual(2);
  });

  it('sem horário nenhum não há slots, e a razão é sempre uma das previstas', () => {
    fc.assert(
      fc.property(arbEntrada(), (entrada) => {
        const r = getAvailableSlots(entrada);

        if (r.slots.length === 0) {
          expect(r.reason).not.toBeNull();
        } else {
          expect(r.reason).toBeNull();
        }
      }),
      { numRuns: 300 },
    );
  });
});
