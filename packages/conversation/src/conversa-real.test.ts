import { describe, expect, it } from 'vitest';

import { extrairData } from './extractor';
import { frasearProcura } from './procura-multi-dia';
import { proximoTurno, type ContextoDaConversa } from './state-machine';

/**
 * A conversa de 30 de agosto de 2026, no número de produção.
 *
 * Correu de fio a pavio e expôs quatro defeitos que nenhum teste apanhava,
 * porque nenhum deles é um erro de cálculo — são todos erros do que se diz e do
 * que se entende. Ficam aqui, com a conversa real por trás de cada um.
 */

const CATALOGO = {
  servicos: ['Consulta', 'implante', 'Limpeza dentária'],
  profissionais: ['Ana Martins', 'Roberto', 'Sergio'],
};

/** Domingo. */
const AGORA = new Date('2026-08-30T12:10:00.000Z');
const HOJE = '2026-08-30';

const turno = (
  mensagem: string,
  contexto: ContextoDaConversa,
  estado = 'SELECTING_DATE' as const,
) =>
  proximoTurno({
    estado,
    contexto,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'X',
  });

describe('"Esta semana" era um botão que o bot não sabia ler', () => {
  /*
   * 12:10:26 — "Esta semana" → "Para implante. Que dia lhe dá jeito?"
   * 12:10:41 — "Esta semana" → a mesma pergunta, outra vez.
   *
   * O bot desenhou o botão e não reconhecia a própria resposta: o contexto
   * ficava sem data e a pergunta repetia-se.
   */
  it('resolve para hoje, e a procura varre daí para a frente', () => {
    expect(extrairData('Esta semana', AGORA)).toBe(HOJE);
    expect(extrairData('qualquer dia', AGORA)).toBe(HOJE);
    expect(extrairData('o mais cedo possível', AGORA)).toBe(HOJE);
  });

  it('deixa de repetir a pergunta do dia', () => {
    const r = turno('Esta semana', { servico: 'implante' });

    expect(r.necessidade.tipo).toBe('procurar_slots');
    expect(r.texto).not.toContain('Que dia lhe dá jeito');
  });
});

describe('as horas nunca saem sem o dia', () => {
  const horas = [
    { iso: '2026-08-31T08:00:00.000Z', hora: '09:00' },
    { iso: '2026-08-31T08:30:00.000Z', hora: '09:30' },
  ];

  /*
   * 12:12:06 — "Para implante, tenho: 09:00, 09:15, 09:30…"
   *
   * O dia era amanhã, escolhido três mensagens antes. A frase não o dizia, e a
   * pessoa leu como sendo hoje. A marcação ficou certa; a pessoa ficou errada —
   * que num assistente de marcações dá no mesmo.
   */
  it('diz o dia mesmo quando é o dia pedido', () => {
    const r = frasearProcura(
      { data: '2026-08-31', horas, procurouAdiante: false, relaxado: false },
      'implante',
      {},
      HOJE,
    );

    expect(r.texto).toContain('Amanhã');
    expect(r.texto).toContain('09:00');
  });

  it('continua a distinguir o dia encontrado do dia pedido', () => {
    const r = frasearProcura(
      { data: '2026-08-31', horas, procurouAdiante: true, relaxado: false },
      'implante',
      {},
      HOJE,
    );

    expect(r.texto).toContain('Nesse dia não tenho');
    expect(r.texto).toContain('Amanhã');
  });

  it('a confirmação também diz o dia', () => {
    const r = proximoTurno({
      estado: 'COLLECTING_CUSTOMER_DATA',
      contexto: {
        servico: 'implante',
        data: '2026-08-31',
        slotEscolhido: '2026-08-31T08:30:00.000Z',
        slotsOferecidos: horas,
      },
      mensagem: 'Sergio',
      catalogo: CATALOGO,
      agora: AGORA,
      nomeDaEmpresa: 'X',
    });

    expect(r.texto).toContain('amanhã');
    expect(r.texto).toContain('09:30');
  });
});

describe('remarcar não pode virar uma marcação nova', () => {
  /*
   * 12:13:18 — "Poderia remarcar para mais tarde?" → "Claro. Que serviço
   * pretende?" → e no fim, uma **segunda** marcação de implante.
   *
   * Os padrões de remarcação exigiam um substantivo a seguir ao verbo, e
   * "remarcar para mais tarde" não tem nenhum.
   */
  it('reconhece o verbo sozinho', () => {
    const r = turno('Poderia remarcar para mais tarde?', { servico: 'implante' }, 'BOOKED');

    expect(r.necessidade.tipo).toBe('chamar_humano');
    expect(r.estado).toBe('WAITING_HUMAN');
  });

  it('não pergunta o serviço — isso é o caminho de marcar', () => {
    const r = turno('quero reagendar', {}, 'BOOKED');

    expect(r.texto).not.toContain('Que serviço');
  });

  it('marcar de raiz continua a funcionar', () => {
    const r = turno('quero marcar um implante', {}, 'NEW');

    expect(r.estado).not.toBe('WAITING_HUMAN');
  });
});
