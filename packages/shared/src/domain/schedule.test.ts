import { describe, expect, it } from 'vitest';

import { instantToWallClock } from '../time';

import {
  filterExceptions,
  isHoursValidOn,
  periodsForDay,
  resolveDaySchedule,
  type DayScheduleInput,
} from './schedule';

const LISBOA = 'Europe/Lisbon';
const SAO_PAULO = 'America/Sao_Paulo';

/** 2026-08-17 é uma segunda-feira. */
const SEGUNDA = '2026-08-17';

const horario = (weekday: number, startsAt: string, endsAt: string, extra = {}) => ({
  weekday,
  startsAt,
  endsAt,
  ...extra,
});

function base(over: Partial<DayScheduleInput> = {}): DayScheduleInput {
  return {
    date: SEGUNDA,
    timezone: LISBOA,
    locationHours: [horario(1, '09:00', '19:00')],
    staffHours: [horario(1, '09:00', '13:00'), horario(1, '14:00', '18:00')],
    exceptions: [],
    timeOff: [],
    ...over,
  };
}

/** Janelas em hora local, para as asserções serem legíveis. */
function locais(input: DayScheduleInput): string[] {
  return resolveDaySchedule(input).windows.map((w) => {
    const i = instantToWallClock(w.start, input.timezone);
    const f = instantToWallClock(w.end, input.timezone);
    return `${i.time}-${f.time}`;
  });
}

describe('periodsForDay', () => {
  it('filtra pelo dia da semana', () => {
    const horas = [horario(1, '09:00', '13:00'), horario(2, '10:00', '20:00')];
    expect(periodsForDay(horas, SEGUNDA)).toEqual([{ startsAt: '09:00', endsAt: '13:00' }]);
  });

  it('devolve os vários períodos do mesmo dia', () => {
    // O fecho para almoço são duas linhas, não uma com um buraco.
    const horas = [horario(1, '09:00', '13:00'), horario(1, '14:00', '18:00')];
    expect(periodsForDay(horas, SEGUNDA)).toHaveLength(2);
  });
});

describe('validade dos horários', () => {
  it('respeita as datas de início e fim', () => {
    const h = horario(1, '09:00', '13:00', { validFrom: '2026-09-01' });
    expect(isHoursValidOn(h, '2026-08-17')).toBe(false);
    expect(isHoursValidOn(h, '2026-09-07')).toBe(true);
  });

  it('dois horários que se sucedem não se pisam', () => {
    // "A partir de setembro passo a trabalhar às sextas" sem apagar o antigo —
    // é o antigo que explica as marcações de agosto.
    const antigo = horario(1, '09:00', '13:00', { validUntil: '2026-08-31' });
    const novo = horario(1, '10:00', '19:00', { validFrom: '2026-09-01' });

    expect(periodsForDay([antigo, novo], '2026-08-17')).toEqual([
      { startsAt: '09:00', endsAt: '13:00' },
    ]);
    expect(periodsForDay([antigo, novo], '2026-09-07')).toEqual([
      { startsAt: '10:00', endsAt: '19:00' },
    ]);
  });
});

describe('resolveDaySchedule — caso normal', () => {
  it('interseta o horário do profissional com o da unidade', () => {
    expect(locais(base())).toEqual(['09:00-13:00', '14:00-18:00']);
  });

  it('a unidade limita o profissional', () => {
    // O profissional diz que trabalha até às 20h mas a clínica fecha às 19h.
    const input = base({
      locationHours: [horario(1, '09:00', '19:00')],
      staffHours: [horario(1, '09:00', '20:00')],
    });
    expect(locais(input)).toEqual(['09:00-19:00']);
  });

  it('sem horário da unidade não há nada', () => {
    const r = resolveDaySchedule(base({ locationHours: [] }));
    expect(r.windows).toEqual([]);
    expect(r.closedReason).toBe('no_location_hours');
  });

  it('sem horário do profissional não há nada', () => {
    const r = resolveDaySchedule(base({ staffHours: [] }));
    expect(r.windows).toEqual([]);
    expect(r.closedReason).toBe('no_staff_hours');
  });

  it('num dia em que não trabalha, devolve vazio', () => {
    // 2026-08-16 é domingo.
    const r = resolveDaySchedule(base({ date: '2026-08-16' }));
    expect(r.windows).toEqual([]);
  });
});

describe('precedência das exceções', () => {
  it('um fecho de dia inteiro ganha a tudo', () => {
    const r = resolveDaySchedule(
      base({ exceptions: [{ date: SEGUNDA, kind: 'closed', startsAt: null, endsAt: null }] }),
    );
    expect(r.windows).toEqual([]);
    expect(r.closedReason).toBe('exception');
  });

  it('um feriado ganha a uma abertura extraordinária no mesmo dia', () => {
    // A ordem importa: um feriado nacional fecha a clínica mesmo que alguém
    // tenha marcado abertura especial nesse dia.
    const r = resolveDaySchedule(
      base({
        exceptions: [
          { date: SEGUNDA, kind: 'open', startsAt: '10:00', endsAt: '12:00' },
          { date: SEGUNDA, kind: 'closed', startsAt: null, endsAt: null },
        ],
      }),
    );
    expect(r.windows).toEqual([]);
  });

  it('um fecho parcial corta o horário', () => {
    const input = base({
      exceptions: [{ date: SEGUNDA, kind: 'closed', startsAt: '11:00', endsAt: '12:00' }],
    });
    expect(locais(input)).toEqual(['09:00-11:00', '12:00-13:00', '14:00-18:00']);
  });

  it('uma abertura extraordinária acrescenta horas fora do normal', () => {
    const input = base({
      exceptions: [{ date: SEGUNDA, kind: 'open', startsAt: '19:00', endsAt: '21:00' }],
    });
    expect(locais(input)).toEqual(['09:00-13:00', '14:00-18:00', '19:00-21:00']);
  });

  it('uma abertura extraordinária vale num dia em que ninguém trabalharia', () => {
    // Domingo, sem horário nenhum, mas alguém abriu para receber um cliente.
    const input = base({
      date: '2026-08-16',
      exceptions: [{ date: '2026-08-16', kind: 'open', startsAt: '10:00', endsAt: '12:00' }],
    });
    expect(locais(input)).toEqual(['10:00-12:00']);
  });
});

describe('ausências', () => {
  it('umas férias de dia inteiro esvaziam o dia', () => {
    const r = resolveDaySchedule(
      base({
        timeOff: [
          { startsAt: new Date('2026-08-17T00:00:00Z'), endsAt: new Date('2026-08-18T00:00:00Z') },
        ],
      }),
    );
    expect(r.windows).toEqual([]);
    expect(r.closedReason).toBe('time_off');
  });

  it('uma ausência de algumas horas corta só essas', () => {
    // Formação das 10h às 12h locais (09:00–11:00 UTC no verão de Lisboa).
    const input = base({
      timeOff: [
        { startsAt: new Date('2026-08-17T09:00:00Z'), endsAt: new Date('2026-08-17T11:00:00Z') },
      ],
    });
    expect(locais(input)).toEqual(['09:00-10:00', '12:00-13:00', '14:00-18:00']);
  });

  it('a ausência vale mesmo com a unidade aberta', () => {
    const r = resolveDaySchedule(
      base({
        exceptions: [{ date: SEGUNDA, kind: 'open', startsAt: '19:00', endsAt: '21:00' }],
        timeOff: [
          { startsAt: new Date('2026-08-17T00:00:00Z'), endsAt: new Date('2026-08-18T00:00:00Z') },
        ],
      }),
    );
    expect(r.windows).toEqual([]);
  });
});

/**
 * Horário de verão — a razão pela qual os horários são hora de parede.
 *
 * Em Portugal, em 2026: o relógio adianta-se a 29 de março e atrasa-se a
 * 25 de outubro. Os dois são domingos, por isso os testes usam horário de
 * domingo (weekday 0).
 */
describe('mudança da hora', () => {
  const domingo = (date: string, over: Partial<DayScheduleInput> = {}) =>
    base({
      date,
      locationHours: [horario(0, '09:00', '19:00')],
      staffHours: [horario(0, '09:00', '18:00')],
      ...over,
    });

  it('"abro às 9" continua a ser às 9 depois de o relógio adiantar', () => {
    // É isto que se perderia se os horários fossem guardados como instantes:
    // a clínica passaria a abrir às 8 ou às 10, duas vezes por ano.
    expect(locais(domingo('2026-03-29'))).toEqual(['09:00-18:00']);
  });

  it('"abro às 9" continua a ser às 9 depois de o relógio atrasar', () => {
    expect(locais(domingo('2026-10-25'))).toEqual(['09:00-18:00']);
  });

  it('o horário comercial NÃO é afetado — a transição é de madrugada', () => {
    // Um erro que eu próprio cometi ao escrever estes testes: assumi que o dia
    // da mudança tinha mais ou menos uma hora de agenda. Não tem. Em Lisboa a
    // transição acontece à 01:00 local, fora do horário de qualquer negócio
    // normal — logo um turno das 09:00 às 18:00 tem sempre 9 horas.
    //
    // A conversão para instante é que muda (08:00Z no verão, 09:00Z no
    // inverno), e é isso que o teste acima verifica.
    const horas = (w: { start: Date; end: Date }) =>
      (w.end.getTime() - w.start.getTime()) / 3_600_000;

    for (const date of ['2026-03-22', '2026-03-29', '2026-10-18', '2026-10-25']) {
      expect(horas(resolveDaySchedule(domingo(date)).windows[0]!), date).toBe(9);
    }
  });

  it('um turno que ATRAVESSA a transição perde uma hora real', () => {
    // Aqui sim. Quem trabalha de madrugada — urgências, hotéis, serviços 24h —
    // apanha a mudança em cheio. O relógio marca as mesmas 6 horas, mas só
    // passaram 5.
    const noturno = base({
      date: '2026-03-29',
      locationHours: [horario(0, '00:00', '06:00')],
      staffHours: [horario(0, '00:00', '06:00')],
    });

    const janela = resolveDaySchedule(noturno).windows[0]!;
    expect((janela.end.getTime() - janela.start.getTime()) / 3_600_000).toBe(5);
  });

  it('um turno que atravessa a transição de outono ganha uma hora real', () => {
    const noturno = base({
      date: '2026-10-25',
      locationHours: [horario(0, '00:00', '06:00')],
      staffHours: [horario(0, '00:00', '06:00')],
    });

    const janela = resolveDaySchedule(noturno).windows[0]!;
    expect((janela.end.getTime() - janela.start.getTime()) / 3_600_000).toBe(7);
  });

  it('a hora que não existe é empurrada, não perdida', () => {
    // A 01:30 de 29 de março não existe em Lisboa. Um turno que comece aí não
    // pode rebentar a agenda: a versão permissiva empurra-o para a frente.
    const input = base({
      date: '2026-03-29',
      locationHours: [horario(0, '01:00', '05:00')],
      staffHours: [horario(0, '01:30', '05:00')],
    });

    const r = resolveDaySchedule(input);
    expect(r.windows).toHaveLength(1);

    // Empurrada para 02:30 local, que é a hora que existe do outro lado do
    // salto — 01:30 UTC, já com o desvio de verão.
    expect(instantToWallClock(r.windows[0]!.start, LISBOA).time).toBe('02:30');
    expect(r.windows[0]!.start.toISOString()).toBe('2026-03-29T01:30:00.000Z');

    // O que importa mesmo: a janela continua válida. Uma hora inexistente não
    // pode produzir um intervalo invertido nem uma agenda partida.
    expect(r.windows[0]!.end.getTime()).toBeGreaterThan(r.windows[0]!.start.getTime());
  });

  it('São Paulo não tem transições — o Brasil aboliu o horário de verão em 2019', () => {
    for (const date of ['2026-02-15', '2026-10-18', '2026-11-01']) {
      const r = resolveDaySchedule(domingo(date, { timezone: SAO_PAULO }));
      // Todos os domingos do ano têm exatamente as mesmas 9 horas.
      const horas = (r.windows[0]!.end.getTime() - r.windows[0]!.start.getTime()) / 3_600_000;
      expect(horas).toBe(9);
    }
  });

  it('uma unidade em São Paulo abre à hora de São Paulo', () => {
    const r = resolveDaySchedule(domingo('2026-08-16', { timezone: SAO_PAULO }));
    // 09:00 em São Paulo é 12:00 UTC.
    expect(r.windows[0]!.start.toISOString()).toBe('2026-08-16T12:00:00.000Z');
  });
});

describe('filterExceptions', () => {
  const excecoes = [
    { date: SEGUNDA, scopeTenant: true, locationId: null, staffId: null, nome: 'feriado' },
    { date: SEGUNDA, scopeTenant: false, locationId: 'loc-a', staffId: null, nome: 'obras' },
    { date: SEGUNDA, scopeTenant: false, locationId: 'loc-b', staffId: null, nome: 'outra' },
    { date: SEGUNDA, scopeTenant: false, locationId: null, staffId: 'ana', nome: 'ana' },
    { date: SEGUNDA, scopeTenant: false, locationId: null, staffId: 'joao', nome: 'joao' },
    { date: '2026-08-18', scopeTenant: true, locationId: null, staffId: null, nome: 'outro dia' },
  ];

  it('junta as do tenant, as da unidade e as do próprio', () => {
    const r = filterExceptions(excecoes, SEGUNDA, 'loc-a', 'ana');
    expect(r.map((e) => e.nome).sort()).toEqual(['ana', 'feriado', 'obras']);
  });

  it('não traz as de outra unidade nem de outro profissional', () => {
    const r = filterExceptions(excecoes, SEGUNDA, 'loc-a', 'ana');
    expect(r.map((e) => e.nome)).not.toContain('outra');
    expect(r.map((e) => e.nome)).not.toContain('joao');
  });

  it('não traz as de outro dia', () => {
    const r = filterExceptions(excecoes, SEGUNDA, 'loc-a', 'ana');
    expect(r.map((e) => e.nome)).not.toContain('outro dia');
  });
});
