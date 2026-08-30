import { describe, expect, it } from 'vitest';

import { proximoTurno, type ContextoDaConversa } from './state-machine';

/**
 * O ciclo que se viu em produção.
 *
 * A conversa real, das capturas de 30 de agosto de 2026:
 *
 *   — queria marcar uma consulta com a Ana amanhã 15h
 *   — Não tenho horas disponíveis nesse dia. Quer tentar outro?
 *   — sim, quando tem disponível?
 *   — Não tenho horas disponíveis nesse dia. Quer tentar outro?
 *   — pode ser em outro dia, qual o próximo horário livre dela?
 *   — Não tenho horas disponíveis nesse dia. Quer tentar outro?
 *
 * Duas causas independentes, e por isso dois conjuntos de testes:
 *
 * 1. a procura era de **um dia só** — ver `procura-multi-dia.test.ts`;
 * 2. a data ficava presa no contexto, e sem data nova na mensagem a procura
 *    repetia-se igual. É esta a parte testada aqui.
 */

const CATALOGO = {
  servicos: ['Consulta', 'Limpeza dentária'],
  profissionais: ['Ana', 'João'],
};

const AGORA = new Date('2026-08-30T10:00:00.000Z');

/** A conversa parada exatamente onde parou em produção. */
const PRESO: ContextoDaConversa = {
  servico: 'Consulta',
  profissional: 'Ana',
  data: '2026-08-31',
  slotsOferecidos: [],
};

const turno = (mensagem: string, contexto: ContextoDaConversa = PRESO) =>
  proximoTurno({
    estado: 'SELECTING_SLOT',
    contexto,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'Clínica Sorriso',
  });

describe('sair do dia sem horas', () => {
  /*
   * Cada uma destas frases apareceu, ou podia ter aparecido, na conversa real.
   * Todas querem dizer a mesma coisa: olha mais à frente.
   */
  const pedidos = [
    'sim, quando tem disponível?',
    'pode ser em outro dia, qual o próximo horário livre dela?',
    'Outro dia',
    'qualquer dia serve',
    'o primeiro que houver',
    'quando tiver vaga',
  ];

  for (const pedido of pedidos) {
    it(`"${pedido}" faz procurar outra vez, sem a data presa`, () => {
      const r = turno(pedido);

      expect(r.necessidade.tipo).toBe('procurar_slots');
      // A data limpa é o que faz a procura recomeçar e varrer os dias à frente.
      expect(r.contexto.data).toBeNull();
    });
  }

  it('o serviço e o profissional sobrevivem — não se recomeça do zero', () => {
    const r = turno('quando tem disponível?');

    expect(r.contexto.servico).toBe('Consulta');
    expect(r.contexto.profissional).toBe('Ana');
  });

  /*
   * A frase repetida era o sintoma. Que ela desapareça é o que se verifica —
   * mas o que importa é que a necessidade devolvida mande procurar de novo, e
   * não que o texto mude.
   */
  it('deixa de responder a mesma frase de sempre', () => {
    expect(turno('sim, quando tem disponível?').texto).not.toMatch(/nesse dia/i);
  });

  it('um dia concreto continua a mandar mais do que a limpeza', () => {
    const r = turno('pode ser dia 4 de setembro');

    expect(r.necessidade.tipo).toBe('procurar_slots');
    expect(r.contexto.data).toBe('2026-09-04');
  });

  /*
   * O limite do reconhecimento largo.
   *
   * "Livre" e "disponível" são palavras comuns, e apanhá-las de mais custa
   * pouco — procura-se noutro dia e mostram-se horas. Mas escolher uma hora que
   * foi oferecida tem de continuar a ganhar a tudo o resto: é uma resposta à
   * pergunta anterior, não um pedido novo.
   */
  it('escolher uma hora oferecida ganha à procura de outro dia', () => {
    const comHoras: ContextoDaConversa = {
      ...PRESO,
      slotsOferecidos: [{ iso: '2026-08-31T14:00:00.000Z', hora: '15:00' }],
    };

    const r = turno('15:00', comHoras);

    expect(r.contexto.slotEscolhido).toBe('2026-08-31T14:00:00.000Z');
    expect(r.necessidade.tipo).not.toBe('procurar_slots');
  });
});
