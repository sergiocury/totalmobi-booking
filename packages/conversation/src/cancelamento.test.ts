import { describe, expect, it } from 'vitest';

import { proximoTurno, type ContextoDaConversa, type Estado } from './state-machine';

/**
 * O cancelamento que andava em círculo.
 *
 * A conversa real, a 30 de agosto de 2026, logo a seguir à confirmação:
 *
 *   — Boa tarde gostaria de cancelar esta marcação
 *   — Quer mesmo cancelar a marcação? Responda "sim" para confirmar.
 *   — sim              → a mesma pergunta
 *   — Sim, cancelar    → a mesma pergunta
 *
 * Duas causas, ambas do nosso lado:
 *
 * 1. **Ninguém tratava o "sim".** Não havia ramo nenhum para `MANAGING_BOOKING`,
 *    e a resposta caía no "não percebi".
 * 2. **A opção chamava-se "Sim, cancelar"** — e o extrator lia-a outra vez como
 *    intenção de cancelar, reiniciando a pergunta. O bot desenhava o botão que
 *    o punha a andar em círculo, tal como já tinha feito com "Esta semana".
 */

const CATALOGO = { servicos: ['implante'], profissionais: ['Roberto'] };
const AGORA = new Date('2026-08-30T15:00:00.000Z');
const CONTEXTO: ContextoDaConversa = { telefone: '+351912345678' };

const turno = (mensagem: string, estado: Estado) =>
  proximoTurno({
    estado,
    contexto: CONTEXTO,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'Clínica Sorriso',
  });

describe('cancelar', () => {
  it('pedir para cancelar pergunta primeiro, e não cancela nada', () => {
    const r = turno('Boa tarde gostaria de cancelar esta marcação', 'NEW');

    expect(r.estado).toBe('MANAGING_BOOKING');
    // A necessidade de perguntar não é a de executar.
    expect(r.necessidade.tipo).toBe('cancelar_marcacao');
  });

  it('o botão oferecido não volta a fazer a mesma pergunta', () => {
    const pergunta = turno('quero cancelar a consulta', 'NEW');
    const opcao = pergunta.opcoes?.[0] ?? '';

    const r = turno(opcao, 'MANAGING_BOOKING');

    expect(r.necessidade.tipo).toBe('executar_cancelamento');
  });

  /*
   * Todas estas respostas significam "sim". Falhar qualquer uma devolve a
   * pessoa ao ciclo, e ninguém tenta três vezes.
   */
  for (const sim of ['sim', 'Sim', 'sim por favor', 'Sim, confirmo', 'confirmo', 'sim, cancelar']) {
    it(`"${sim}" executa o cancelamento`, () => {
      expect(turno(sim, 'MANAGING_BOOKING').necessidade.tipo).toBe('executar_cancelamento');
    });
  }

  /*
   * O outro lado: cancelar por engano não se desfaz. Qualquer coisa que não
   * seja um sim tem de recuar — e dizê-lo, para não ficar a dúvida.
   */
  it('recua em qualquer outra resposta', () => {
    for (const nao of ['não', 'Não, manter', 'espera', 'afinal não']) {
      const r = turno(nao, 'MANAGING_BOOKING');

      expect(r.necessidade.tipo, nao).not.toBe('executar_cancelamento');
      expect(r.texto, nao).toContain('Não cancelei');
    }
  });

  it('pedir uma pessoa continua a ganhar a tudo', () => {
    const r = turno('quero falar com alguém', 'MANAGING_BOOKING');

    expect(r.estado).toBe('WAITING_HUMAN');
  });
});
