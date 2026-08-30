import { describe, expect, it } from 'vitest';

import { proximoTurno, type ContextoDaConversa, type Estado } from './state-machine';

/**
 * Remarcar sem criar uma segunda marcação.
 *
 * O caminho é o mesmo de marcar — escolher dia, escolher hora, confirmar — e o
 * que muda é o fim: `reschedule_booking` em vez de criar. A distinção viaja no
 * `marcacaoAMudar`, posto pelo adaptador quando encontra a marcação da pessoa
 * pelo número de telemóvel.
 *
 * Sem essa distinção, um pedido de remarcação caía no caminho de marcar — e foi
 * assim que um cliente ficou com duas marcações de implante a 30 de agosto
 * de 2026.
 */

const CATALOGO = {
  servicos: ['implante', 'Limpeza dentária'],
  profissionais: ['Roberto'],
};

const AGORA = new Date('2026-08-30T15:00:00.000Z');

const turno = (mensagem: string, contexto: ContextoDaConversa, estado: Estado) =>
  proximoTurno({
    estado,
    contexto,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'Clínica Sorriso',
  });

/** Já com a marcação encontrada e uma hora nova oferecida. */
const A_MUDAR: ContextoDaConversa = {
  telefone: '+351912345678',
  servico: 'implante',
  marcacaoAMudar: 'booking-123',
  data: '2026-09-04',
  slotsOferecidos: [{ iso: '2026-09-04T09:00:00.000Z', hora: '10:00' }],
};

describe('remarcar', () => {
  it('pede a marcação antes de qualquer outra coisa', () => {
    const r = turno('quero remarcar', { telefone: '+351912345678' }, 'NEW');

    expect(r.necessidade.tipo).toBe('preparar_remarcacao');
  });

  /*
   * Com a marcação já em mãos, o pedido não se repete: seguir-se-ia um ciclo
   * igual ao do cancelamento, a ir buscar a mesma marcação vezes sem conta.
   */
  it('não volta a buscá-la quando já a tem', () => {
    const r = turno('quero remarcar', A_MUDAR, 'SELECTING_DATE');

    expect(r.necessidade.tipo).not.toBe('preparar_remarcacao');
  });

  it('escolher a hora não pergunta o nome a quem já é conhecido', () => {
    const r = turno('10:00', A_MUDAR, 'SELECTING_SLOT');

    expect(r.estado).toBe('CONFIRMING');
    expect(r.texto).not.toContain('nome');
  });

  it('a pergunta final diz que muda, não que marca', () => {
    const r = turno('10:00', A_MUDAR, 'SELECTING_SLOT');

    expect(r.texto).toContain('Mudo');
    expect(r.texto).toContain('10:00');
  });

  /*
   * O ponto todo do trabalho: confirmar uma remarcação **muda** a que existe.
   * Criar seria deixar a pessoa com duas.
   */
  it('confirmar muda a marcação em vez de criar outra', () => {
    const r = turno(
      'Confirmar',
      { ...A_MUDAR, slotEscolhido: '2026-09-04T09:00:00.000Z' },
      'CONFIRMING',
    );

    expect(r.necessidade.tipo).toBe('executar_remarcacao');
  });

  it('sem remarcação em curso, confirmar continua a criar', () => {
    const r = turno(
      'Confirmar',
      {
        telefone: '+351912345678',
        servico: 'implante',
        nome: 'Roger',
        slotEscolhido: '2026-09-04T09:00:00.000Z',
      },
      'CONFIRMING',
    );

    expect(r.necessidade.tipo).toBe('criar_marcacao');
  });

  it('a marcação a mudar sobrevive de turno para turno', () => {
    const r = turno('amanhã', A_MUDAR, 'SELECTING_DATE');

    expect(r.contexto.marcacaoAMudar).toBe('booking-123');
  });

  it('pedir uma pessoa continua a ganhar a tudo', () => {
    expect(turno('falar com alguém', A_MUDAR, 'SELECTING_SLOT').estado).toBe('WAITING_HUMAN');
  });
});
