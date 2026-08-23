import { describe, expect, it } from 'vitest';

import { formatInZone, interval } from '@totalmobi/shared';

import { getAvailableSlots, getAvailableSlotsForStaff } from './engine';
import type { AvailabilityInput, StaffInput } from './types';

/**
 * O motor visto de fora.
 *
 * As horas leem-se sempre no fuso da unidade, nunca em UTC: um teste que
 * afirma `09:00Z` deixa de dizer nada em março, e um teste que só passa em
 * metade do ano é pior do que teste nenhum.
 */

const LISBOA = 'Europe/Lisbon';

/** Horas locais dos slots, para asserções legíveis. */
function horas(resultado: { slots: readonly { start: Date }[] }, timezone = LISBOA): string[] {
  return resultado.slots.map((s) => hora(s.start, timezone));
}

/** `HH:mm` na hora local. */
function hora(instant: Date, timezone = LISBOA): string {
  return formatInZone(instant, timezone, 'pt-PT', 'time');
}

const HORARIO_UTIL = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startsAt: '09:00',
  endsAt: '18:00',
}));

function staff(over: Partial<StaffInput> = {}): StaffInput {
  return {
    staffId: 'ana',
    workingHours: HORARIO_UTIL,
    timeOff: [],
    busy: [],
    ...over,
  };
}

function entrada(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    // 2026-08-19 é uma quarta-feira.
    date: '2026-08-19',
    timezone: LISBOA,
    // Bem antes do dia, para a antecedência não interferir onde não é o tema.
    now: new Date('2026-08-01T10:00:00Z'),
    service: {
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      capacity: 1,
    },
    policy: {
      slotGranularityMinutes: 30,
      minAdvanceMinutes: 60,
      maxAdvanceDays: 90,
    },
    locationHours: HORARIO_UTIL,
    exceptions: [],
    staff: [staff()],
    ...over,
  };
}

/** Um `blocked_range` já existente, dado em hora local. */
function ocupado(hIni: string, hFim: string, date = '2026-08-19') {
  return {
    range: interval(
      new Date(`${date}T${hIni}:00+01:00`),
      new Date(`${date}T${hFim}:00+01:00`),
    ),
  };
}

describe('getAvailableSlots — o caso simples', () => {
  it('um dia de trabalho vazio dá slots de meia em meia hora', () => {
    const r = getAvailableSlots(entrada());

    expect(r.reason).toBeNull();
    // 09:00–18:00 com serviço de 30 min de 30 em 30 min = 18 inícios.
    expect(r.slots).toHaveLength(18);
    expect(horas(r)[0]).toBe('09:00');
    expect(horas(r).at(-1)).toBe('17:30');
  });

  it('o último slot acaba exatamente à hora de fecho, nunca depois', () => {
    const r = getAvailableSlots(entrada());
    const ultimo = r.slots.at(-1)!;

    expect(hora(ultimo.end)).toBe('18:00');
  });

  it('o passo é independente da duração', () => {
    // 45 minutos de serviço, oferecidos de 15 em 15.
    const r = getAvailableSlots(
      entrada({
        service: {
          durationMinutes: 45,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          capacity: 1,
        },
        policy: { slotGranularityMinutes: 15, minAdvanceMinutes: 60, maxAdvanceDays: 90 },
      }),
    );

    expect(horas(r).slice(0, 3)).toEqual(['09:00', '09:15', '09:30']);
    expect(horas(r).at(-1)).toBe('17:15');
  });

  it('a grelha ancora-se à meia-noite local: nada de horas partidas', () => {
    const r = getAvailableSlots(
      entrada({
        locationHours: [{ weekday: 3, startsAt: '09:07', endsAt: '12:00' }],
        staff: [staff({ workingHours: [{ weekday: 3, startsAt: '09:07', endsAt: '12:00' }] })],
      }),
    );

    // A janela começa às 09:07 mas o primeiro slot cai na grelha: 09:30.
    expect(horas(r)[0]).toBe('09:30');
  });
});

describe('fecho para almoço', () => {
  const comAlmoco = [
    { weekday: 3, startsAt: '09:00', endsAt: '13:00' },
    { weekday: 3, startsAt: '14:00', endsAt: '19:00' },
  ];

  it('não oferece slots durante o almoço', () => {
    const r = getAvailableSlots(
      entrada({ locationHours: comAlmoco, staff: [staff({ workingHours: comAlmoco })] }),
    );

    expect(horas(r)).toContain('12:30');
    expect(horas(r)).not.toContain('13:00');
    expect(horas(r)).not.toContain('13:30');
    expect(horas(r)).toContain('14:00');
  });

  it('um serviço não pode começar antes do almoço e acabar depois', () => {
    const r = getAvailableSlots(
      entrada({
        locationHours: comAlmoco,
        staff: [staff({ workingHours: comAlmoco })],
        service: {
          durationMinutes: 90,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          capacity: 1,
        },
      }),
    );

    // 12:30 + 90 min acabaria às 14:00, com a clínica fechada pelo meio.
    expect(horas(r)).not.toContain('12:00');
    expect(horas(r)).toContain('11:30');
  });
});

describe('marcações já feitas', () => {
  it('um bloco ocupado tira os slots que lhe tocam', () => {
    const r = getAvailableSlots(
      entrada({ staff: [staff({ busy: [ocupado('10:00', '11:00')] })] }),
    );

    expect(horas(r)).toContain('09:30');
    expect(horas(r)).not.toContain('10:00');
    expect(horas(r)).not.toContain('10:30');
    expect(horas(r)).toContain('11:00');
  });

  it('os intervalos são semiabertos: 10:30 fica livre depois de 10:00–10:30', () => {
    const r = getAvailableSlots(
      entrada({ staff: [staff({ busy: [ocupado('10:00', '10:30')] })] }),
    );

    expect(horas(r)).not.toContain('10:00');
    expect(horas(r)).toContain('10:30');
  });

  it('com a agenda cheia a razão é "fully_booked", não "closed"', () => {
    const r = getAvailableSlots(
      entrada({ staff: [staff({ busy: [ocupado('09:00', '18:00')] })] }),
    );

    expect(r.slots).toHaveLength(0);
    expect(r.reason).toBe('fully_booked');
  });
});

describe('buffers', () => {
  const comBuffer = {
    durationMinutes: 30,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    capacity: 1,
  };

  it('o serviço cabe à hora de abertura mesmo com buffer antes', () => {
    // A decisão nº 1 do motor. Se o buffer tivesse de caber no horário, as 09:00
    // desapareciam de todos os dias.
    const r = getAvailableSlots(entrada({ service: comBuffer }));

    expect(horas(r)[0]).toBe('09:00');
  });

  it('o buffer conta contra as outras marcações', () => {
    const r = getAvailableSlots(
      entrada({
        service: comBuffer,
        staff: [staff({ busy: [ocupado('11:00', '11:30')] })],
      }),
    );

    // 10:30 + 30 min = 11:00, mas o buffer de depois estica até 11:15 e toca na
    // marcação existente.
    expect(horas(r)).not.toContain('10:30');
    // 11:30 começaria com buffer às 11:15 — também toca.
    expect(horas(r)).not.toContain('11:30');
    expect(horas(r)).toContain('12:00');
  });

  it('o serviço tem de caber inteiro: o buffer de depois não come o fecho', () => {
    const r = getAvailableSlots(entrada({ service: comBuffer }));

    // 17:30 + 30 min acaba às 18:00. O buffer transborda para as 18:15 e isso
    // é aceite — é limpeza, não atendimento.
    expect(horas(r).at(-1)).toBe('17:30');
  });
});

describe('capacidade', () => {
  it('com capacidade 1, uma marcação sobreposta chega para bloquear', () => {
    const r = getAvailableSlots(
      entrada({ staff: [staff({ busy: [ocupado('10:00', '10:30')] })] }),
    );

    expect(horas(r)).not.toContain('10:00');
  });

  it('com capacidade 3, o slot só desaparece à terceira', () => {
    const tresCadeiras = {
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      capacity: 3,
    };

    const duas = getAvailableSlots(
      entrada({
        service: tresCadeiras,
        staff: [staff({ busy: [ocupado('10:00', '10:30'), ocupado('10:00', '10:30')] })],
      }),
    );
    expect(horas(duas)).toContain('10:00');

    const tres = getAvailableSlots(
      entrada({
        service: tresCadeiras,
        staff: [
          staff({
            busy: [ocupado('10:00', '10:30'), ocupado('10:00', '10:30'), ocupado('10:00', '10:30')],
          }),
        ],
      }),
    );
    expect(horas(tres)).not.toContain('10:00');
  });
});

describe('vários profissionais', () => {
  const ana = staff({ staffId: 'ana' });
  const bruno = staff({ staffId: 'bruno' });

  it('o slot vem com quem o pode dar, por ordem estável', () => {
    const r = getAvailableSlots(entrada({ staff: [bruno, ana] }));

    expect(r.slots[0]!.staffIds).toEqual(['ana', 'bruno']);
  });

  it('se um estiver ocupado, o slot continua a existir com o outro', () => {
    const r = getAvailableSlots(
      entrada({ staff: [staff({ staffId: 'ana', busy: [ocupado('10:00', '10:30')] }), bruno] }),
    );

    const dezHoras = r.slots.find(
      (s) => hora(s.start) === '10:00',
    );
    expect(dezHoras?.staffIds).toEqual(['bruno']);
  });

  it('horários diferentes juntam-se: a união é maior do que cada um', () => {
    const manha = staff({
      staffId: 'ana',
      workingHours: [{ weekday: 3, startsAt: '09:00', endsAt: '13:00' }],
    });
    const tarde = staff({
      staffId: 'bruno',
      workingHours: [{ weekday: 3, startsAt: '14:00', endsAt: '18:00' }],
    });

    const r = getAvailableSlots(entrada({ staff: [manha, tarde] }));

    expect(horas(r)[0]).toBe('09:00');
    expect(horas(r).at(-1)).toBe('17:30');
    expect(horas(r)).not.toContain('13:00');
  });

  it('pedir uma pessoa em concreto devolve só a agenda dela', () => {
    const r = getAvailableSlotsForStaff(
      entrada({
        staff: [
          staff({
            staffId: 'ana',
            workingHours: [{ weekday: 3, startsAt: '09:00', endsAt: '11:00' }],
          }),
          bruno,
        ],
      }),
      'ana',
    );

    expect(horas(r)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });
});

describe('a janela de antecedência', () => {
  it('a antecedência mínima corta os slots que já vêm tarde', () => {
    const r = getAvailableSlots(
      entrada({
        // 09:00 local nesse dia.
        now: new Date('2026-08-19T08:00:00Z'),
        policy: { slotGranularityMinutes: 30, minAdvanceMinutes: 60, maxAdvanceDays: 90 },
      }),
    );

    // Agora são 09:00; com uma hora de antecedência o primeiro é às 10:00.
    expect(horas(r)[0]).toBe('10:00');
  });

  it('para lá do horizonte não há nada, e a razão di-lo', () => {
    const r = getAvailableSlots(
      entrada({
        policy: { slotGranularityMinutes: 30, minAdvanceMinutes: 60, maxAdvanceDays: 7 },
      }),
    );

    expect(r.slots).toHaveLength(0);
    expect(r.reason).toBe('outside_advance_window');
  });

  it('um dia já passado não devolve nada', () => {
    const r = getAvailableSlots(entrada({ now: new Date('2026-08-20T10:00:00Z') }));

    expect(r.slots).toHaveLength(0);
    expect(r.reason).toBe('outside_advance_window');
  });
});

describe('as razões do vazio', () => {
  it('domingo está fechado', () => {
    const r = getAvailableSlots(entrada({ date: '2026-08-23' }));

    expect(r.reason).toBe('closed');
  });

  it('um feriado fecha, mesmo em dia útil', () => {
    const r = getAvailableSlots(
      entrada({ exceptions: [{ date: '2026-08-19', kind: 'closed' }] }),
    );

    expect(r.reason).toBe('closed');
  });

  it('férias dizem "ninguém disponível", não "fechado" — a casa está aberta', () => {
    const r = getAvailableSlots(
      entrada({
        staff: [
          staff({
            timeOff: [
              {
                startsAt: new Date('2026-08-17T00:00:00Z'),
                endsAt: new Date('2026-08-24T00:00:00Z'),
              },
            ],
          }),
        ],
      }),
    );

    expect(r.reason).toBe('staff_off');
  });

  it('a folga semanal de uma profissional não é a casa fechada', () => {
    // A unidade abre à quarta; esta profissional só trabalha à segunda. Dizer
    // "fechado" mandaria embora quem podia marcar outro serviço no mesmo dia.
    const r = getAvailableSlots(
      entrada({
        staff: [staff({ workingHours: [{ weekday: 1, startsAt: '09:00', endsAt: '18:00' }] })],
      }),
    );

    expect(r.reason).toBe('staff_off');
  });

  it('domingo continua fechado mesmo sem ninguém a trabalhar', () => {
    // A distinção não pode ir longe de mais: se a unidade não abre, é fechado,
    // independentemente do horário de quem lá trabalha.
    const r = getAvailableSlots(
      entrada({
        date: '2026-08-23',
        staff: [staff({ workingHours: [{ weekday: 0, startsAt: '09:00', endsAt: '18:00' }] })],
      }),
    );

    expect(r.reason).toBe('closed');
  });

  it('um serviço maior do que o dia diz que não cabe', () => {
    const r = getAvailableSlots(
      entrada({
        locationHours: [{ weekday: 3, startsAt: '09:00', endsAt: '11:00' }],
        staff: [staff({ workingHours: [{ weekday: 3, startsAt: '09:00', endsAt: '11:00' }] })],
        service: {
          durationMinutes: 180,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          capacity: 1,
        },
      }),
    );

    expect(r.reason).toBe('service_does_not_fit');
  });

  it('sem ninguém que preste o serviço, a razão é essa e não "fechado"', () => {
    const r = getAvailableSlots(entrada({ staff: [] }));

    expect(r.reason).toBe('no_staff');
  });

  it('uma abertura extraordinária vale ao domingo', () => {
    const r = getAvailableSlots(
      entrada({
        date: '2026-08-23',
        exceptions: [{ date: '2026-08-23', kind: 'open', startsAt: '10:00', endsAt: '12:00' }],
      }),
    );

    expect(horas(r)).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });
});

describe('horário de verão', () => {
  it('um dia normal na mudança de outubro tem os mesmos slots', () => {
    // 25 de outubro de 2026 é o domingo em que o relógio recua, à 01:00 local.
    // Fora do horário comercial: um dia das 09:00 às 18:00 é igual a qualquer
    // outro. Assumi o contrário durante o M6 e estava errado.
    const domingoUtil = [{ weekday: 0, startsAt: '09:00', endsAt: '18:00' }];

    const r = getAvailableSlots(
      entrada({
        date: '2026-10-25',
        now: new Date('2026-10-01T10:00:00Z'),
        locationHours: domingoUtil,
        staff: [staff({ workingHours: domingoUtil })],
      }),
    );

    expect(r.slots).toHaveLength(18);
    expect(horas(r)[0]).toBe('09:00');
  });

  it('um turno de madrugada em outubro ganha uma hora de slots', () => {
    // 00:00–06:00 no dia em que o relógio recua: são 7 horas reais.
    const madrugada = [{ weekday: 0, startsAt: '00:00', endsAt: '06:00' }];

    const r = getAvailableSlots(
      entrada({
        date: '2026-10-25',
        now: new Date('2026-10-01T10:00:00Z'),
        locationHours: madrugada,
        staff: [staff({ workingHours: madrugada })],
      }),
    );

    // 7 horas de 30 em 30 = 14 slots, não 12.
    expect(r.slots).toHaveLength(14);
  });

  it('um turno de madrugada em março perde uma hora de slots', () => {
    // 29 de março de 2026: o relógio salta da 01:00 para as 02:00.
    const madrugada = [{ weekday: 0, startsAt: '00:00', endsAt: '06:00' }];

    const r = getAvailableSlots(
      entrada({
        date: '2026-03-29',
        now: new Date('2026-03-01T10:00:00Z'),
        locationHours: madrugada,
        staff: [staff({ workingHours: madrugada })],
      }),
    );

    // 5 horas reais = 10 slots.
    expect(r.slots).toHaveLength(10);
  });

  it('São Paulo já não tem horário de verão — e o motor não se importa', () => {
    const sp = 'America/Sao_Paulo';
    const r = getAvailableSlots(
      entrada({
        timezone: sp,
        date: '2026-10-21',
        locationHours: [{ weekday: 3, startsAt: '09:00', endsAt: '18:00' }],
        staff: [staff({ workingHours: [{ weekday: 3, startsAt: '09:00', endsAt: '18:00' }] })],
      }),
    );

    expect(r.slots).toHaveLength(18);
    expect(horas(r, sp)[0]).toBe('09:00');
    // E o instante é mesmo o do Brasil, não o de Lisboa.
    expect(r.slots[0]!.start.toISOString()).toBe('2026-10-21T12:00:00.000Z');
  });
});

describe('o orçamento de tempo', () => {
  it('uma semana de cinco profissionais com agenda cheia resolve-se em menos de 50 ms', () => {
    // O pior caso realista: 5 pessoas, 8 marcações por dia cada, 7 dias.
    const equipa = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      staff({
        staffId: id,
        busy: Array.from({ length: 8 }, (_, i) =>
          ocupado(
            `${String(9 + i).padStart(2, '0')}:00`,
            `${String(9 + i).padStart(2, '0')}:30`,
          ),
        ),
      }),
    );

    const dias = [
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ];

    const inicio = performance.now();
    for (const date of dias) {
      getAvailableSlots(entrada({ date, staff: equipa, policy: {
        slotGranularityMinutes: 15,
        minAdvanceMinutes: 60,
        maxAdvanceDays: 90,
      } }));
    }
    const decorrido = performance.now() - inicio;

    expect(decorrido).toBeLessThan(50);
  });
});
