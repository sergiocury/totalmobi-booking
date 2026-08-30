import { describe, expect, it } from 'vitest';

import { diasComHoras, frasearDias, frasearProcura } from './procura-multi-dia';
import { proximoTurno, type ContextoDaConversa, type Estado } from './state-machine';

/**
 * "Que dias tem disponível?"
 *
 * A mensagem real, a 30 de agosto de 2026:
 *
 *   — gostaria de agendar uma limpeza dentária esta semana, que dias tem
 *     disponível?
 *   — Nesse dia não tenho. Amanhã tenho: 12:00, 12:15, 14:00, 14:15, 14:30.
 *
 * Duas coisas erradas na mesma frase. A pergunta era sobre **dias** e a
 * resposta era sobre horas de um só dia. E "nesse dia" referia-se a um dia que
 * ninguém tinha nomeado — a pessoa disse "esta semana", e o dia foi escolhido
 * por nós.
 */

const CATALOGO = {
  servicos: ['Limpeza dentária', 'implante'],
  profissionais: ['Ana Martins'],
};

const AGORA = new Date('2026-08-30T12:00:00.000Z');
const HOJE = '2026-08-30';

const turno = (mensagem: string, contexto: ContextoDaConversa, estado: Estado = 'NEW') =>
  proximoTurno({
    estado,
    contexto,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'Clínica Sorriso',
  });

const hora = (iso: string, h: string) => ({ iso, hora: h });

describe('a pergunta sobre dias', () => {
  it('é reconhecida quando o serviço já se sabe', () => {
    const r = turno('que dias tem disponível?', { servico: 'Limpeza dentária' });

    expect(r.necessidade.tipo).toBe('procurar_dias');
  });

  it('ganha ao pedido do dia — não se pergunta a quem acabou de perguntar', () => {
    const r = turno('gostaria de agendar uma limpeza dentária, que dias tem?', {});

    expect(r.texto).not.toContain('Que dia lhe dá jeito');
  });

  /*
   * "Quando" e "disponível" também aparecem em "quando tem disponível?", que
   * manda procurar noutro dia. Sem a ordem certa, a pergunta sobre dias seria
   * lida como essa e devolvia horas outra vez.
   */
  it('ganha ao "outro dia" quando já se mostram horas', () => {
    const r = turno(
      'e que dias tem disponíveis?',
      { servico: 'Limpeza dentária', data: '2026-08-31', slotsOferecidos: [] },
      'SELECTING_SLOT',
    );

    expect(r.necessidade.tipo).toBe('procurar_dias');
  });

  /*
   * Estreito de propósito: marcar num dia não é perguntar que dias há, e
   * responder com uma lista de dias seria dar um passo atrás.
   */
  it('não apanha um pedido de marcação', () => {
    for (const m of ['quero marcar num dia da próxima semana', 'marca para o dia 4', 'amanhã']) {
      expect(turno(m, { servico: 'Limpeza dentária' }).necessidade.tipo, m).not.toBe(
        'procurar_dias',
      );
    }
  });
});

describe('diasComHoras', () => {
  const dias = [
    { data: '2026-08-30', horas: [] },
    { data: '2026-08-31', horas: [hora('2026-08-31T09:00:00.000Z', '10:00')] },
    { data: '2026-09-01', horas: [] },
    { data: '2026-09-02', horas: [hora('2026-09-02T09:00:00.000Z', '10:00')] },
    { data: '2026-09-03', horas: [hora('2026-09-03T09:00:00.000Z', '10:00')] },
    { data: '2026-09-04', horas: [hora('2026-09-04T09:00:00.000Z', '10:00')] },
  ];

  it('salta os dias vazios e devolve os primeiros com horas', () => {
    expect(diasComHoras(dias, {}).map((d) => d.data)).toEqual([
      '2026-08-31',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  /*
   * As horas do exemplo são todas às 10:00. "Tarde" começa ao meio-dia — ver
   * `JANELAS` —, por isso nenhum destes dias serve a quem pede tarde.
   */
  it('a preferência de período também manda aqui', () => {
    expect(diasComHoras(dias, { periodo: 'tarde' })).toEqual([]);
  });

  it('sem dias nenhuns não inventa', () => {
    expect(diasComHoras([{ data: '2026-08-30', horas: [] }], {})).toEqual([]);
  });
});

describe('frasearDias', () => {
  it('lista os dias e pergunta qual', () => {
    const r = frasearDias(
      [
        { data: '2026-08-31', horas: [] },
        { data: '2026-09-03', horas: [] },
      ],
      'Limpeza dentária',
      HOJE,
    );

    // Minúscula a meio da frase, maiúscula no botão — cada um lê-se no seu sítio.
    expect(r.texto).toContain('tenho amanhã e quinta-feira');
    expect(r.texto).toContain('Que dia lhe dá jeito');
    // As opções são dias, não horas: é o passo que faltava.
    expect(r.opcoes).toHaveLength(2);
    expect(r.opcoes[0]).toBe('Amanhã');
  });

  it('um dia só não leva "e"', () => {
    const r = frasearDias([{ data: '2026-08-31', horas: [] }], 'implante', HOJE);

    expect(r.texto).not.toContain(' e ');
  });

  it('sem dias, diz que não há e oferece uma pessoa', () => {
    const r = frasearDias([], 'implante', HOJE);

    expect(r.opcoes).toEqual(['Falar com alguém']);
  });
});

describe('não se diz "nesse dia" de um dia que ninguém nomeou', () => {
  const encontrado = {
    data: '2026-08-31',
    horas: [hora('2026-08-31T11:00:00.000Z', '12:00')],
    procurouAdiante: true,
    relaxado: false,
  };

  it('com "esta semana", a frase não inventa um dia pedido', () => {
    const r = frasearProcura(encontrado, 'Limpeza dentária', { dataVaga: true }, HOJE);

    expect(r.texto).not.toContain('Nesse dia');
    expect(r.texto).toContain('Amanhã');
  });

  it('com um dia nomeado, continua a dizer que nesse não tem', () => {
    const r = frasearProcura(encontrado, 'Limpeza dentária', {}, HOJE);

    expect(r.texto).toContain('Nesse dia não tenho');
  });

  /*
   * A ligação ponta a ponta: o `dataVaga` tem de sair do extrator, atravessar
   * o contexto e chegar à frase. Testar só a frase deixava passar exatamente o
   * defeito que se viu — a peça certa, nunca ligada.
   */
  it('"esta semana" marca a data como vaga no contexto', () => {
    const r = turno('quero uma limpeza dentária esta semana', {});

    expect(r.contexto.dataVaga).toBe(true);
    expect(r.contexto.data).toBe(HOJE);
  });

  it('um dia nomeado não é vago', () => {
    const r = turno('quero uma limpeza dentária amanhã', {});

    expect(r.contexto.dataVaga).toBe(false);
  });

  it('uma resposta que não fala de dias não apaga o que já se sabia', () => {
    const r = turno('sim', { servico: 'Limpeza dentária', data: HOJE, dataVaga: true });

    expect(r.contexto.dataVaga).toBe(true);
  });
});
