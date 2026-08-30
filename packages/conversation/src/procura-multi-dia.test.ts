import { describe, expect, it } from 'vitest';

import { diasDoIntervalo, nomeDoDia, primeiroDiaComHoras } from './procura-multi-dia';

const hora = (h: string) => ({ iso: `2026-09-01T${h}:00.000Z`, hora: h });

const MANHA = [hora('09:00'), hora('10:00'), hora('11:00')];
const TARDE = [hora('14:00'), hora('15:00'), hora('16:00')];

const horas = (r: { horas: { hora: string }[] }) => r.horas.map((h) => h.hora);

describe('primeiroDiaComHoras', () => {
  it('sem dias nenhuns não inventa nada', () => {
    const r = primeiroDiaComHoras([], {});

    expect(r.data).toBeNull();
    expect(r.horas).toEqual([]);
    expect(r.procurouAdiante).toBe(false);
  });

  it('o dia pedido serve quando tem horas', () => {
    const r = primeiroDiaComHoras(
      [
        { data: '2026-09-01', horas: MANHA },
        { data: '2026-09-02', horas: TARDE },
      ],
      {},
    );

    expect(r.data).toBe('2026-09-01');
    expect(r.procurouAdiante).toBe(false);
  });

  /*
   * O ciclo que isto acaba.
   *
   * A procura era de um dia só. Sem nada nesse dia, a resposta era sempre "não
   * tenho horas nesse dia, quer tentar outro?" — e à pergunta seguinte, a
   * mesma frase, porque o contexto mantinha a mesma data.
   */
  it('salta os dias vazios em vez de desistir', () => {
    const r = primeiroDiaComHoras(
      [
        { data: '2026-09-01', horas: [] },
        { data: '2026-09-02', horas: [] },
        { data: '2026-09-03', horas: MANHA },
      ],
      {},
    );

    expect(r.data).toBe('2026-09-03');
    expect(r.procurouAdiante).toBe(true);
    expect(horas(r)).toEqual(['09:00', '10:00', '11:00']);
  });

  it('quando não há nada em dia nenhum, diz que não há', () => {
    const r = primeiroDiaComHoras(
      [
        { data: '2026-09-01', horas: [] },
        { data: '2026-09-02', horas: [] },
      ],
      {},
    );

    expect(r.data).toBeNull();
    expect(r.relaxado).toBe(false);
  });

  /*
   * A decisão que justifica as duas passagens.
   *
   * Quem pede "à tarde" e não tem tarde no dia pedido prefere a tarde de outro
   * dia à manhã do dia seguinte. Uma passagem só daria sempre a manhã: cumpria
   * a letra e falhava a intenção.
   */
  it('prefere a tarde de outro dia à manhã do dia seguinte', () => {
    const r = primeiroDiaComHoras(
      [
        { data: '2026-09-01', horas: [] },
        { data: '2026-09-02', horas: MANHA },
        { data: '2026-09-03', horas: TARDE },
      ],
      { periodo: 'tarde' },
    );

    expect(r.data).toBe('2026-09-03');
    expect(r.relaxado).toBe(false);
    expect(horas(r)).toEqual(['14:00', '15:00', '16:00']);
  });

  it('sem nenhum dia a cumprir a preferência, relaxa e assinala', () => {
    const r = primeiroDiaComHoras(
      [
        { data: '2026-09-01', horas: [] },
        { data: '2026-09-02', horas: MANHA },
      ],
      { periodo: 'tarde' },
    );

    expect(r.data).toBe('2026-09-02');
    expect(r.relaxado).toBe(true);
    expect(r.procurouAdiante).toBe(true);
    expect(horas(r)).toEqual(['09:00', '10:00', '11:00']);
  });

  it('a preferência filtra as horas do dia escolhido', () => {
    const r = primeiroDiaComHoras([{ data: '2026-09-01', horas: [...MANHA, ...TARDE] }], {
      periodo: 'tarde',
    });

    expect(horas(r)).toEqual(['14:00', '15:00', '16:00']);
  });
});

describe('diasDoIntervalo', () => {
  it('inclui o próprio dia', () => {
    expect(diasDoIntervalo('2026-09-01', 3)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('atravessa a fronteira do mês', () => {
    expect(diasDoIntervalo('2026-08-30', 3)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  /*
   * Aritmética em UTC.
   *
   * Estas datas são etiquetas de calendário, não instantes. Em Lisboa, somar
   * 24 horas na madrugada de 25 de outubro devolve o mesmo dia — a hora
   * recua. A conta em UTC não tem esse problema.
   */
  it('não tropeça na mudança da hora', () => {
    expect(diasDoIntervalo('2026-10-24', 4)).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
  });

  it('uma data inválida devolve nada, em vez de datas inventadas', () => {
    expect(diasDoIntervalo('nao-e-data', 3)).toEqual([]);
    expect(diasDoIntervalo('2026-09-01', 0)).toEqual([]);
  });
});

describe('nomeDoDia', () => {
  it('hoje e amanhã dizem-se pelo nome', () => {
    expect(nomeDoDia('2026-09-01', '2026-09-01')).toBe('hoje');
    expect(nomeDoDia('2026-09-02', '2026-09-01')).toBe('amanhã');
  });

  it('mais longe, diz o dia da semana e a data', () => {
    // 4 de setembro de 2026 é uma sexta-feira.
    expect(nomeDoDia('2026-09-04', '2026-09-01')).toContain('sexta');
    expect(nomeDoDia('2026-09-04', '2026-09-01')).toContain('setembro');
  });
});
