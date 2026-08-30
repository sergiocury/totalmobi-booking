import { describe, expect, it } from 'vitest';

import { proximoTurno, type ContextoDaConversa } from './state-machine';

/**
 * Os dias da semana que também são ordinais.
 *
 * Em português, **segunda, quarta e quinta** são as duas coisas. Com cinco
 * horas oferecidas, "Teria para quarta feira?" escolhia a quarta hora e passava
 * logo a pedir o nome:
 *
 *   — Amanhã, para Limpeza dentária tenho: 12:00, 12:15, 14:00, 14:15, 14:30.
 *   — Teria para quarta feira?
 *   — Boa. Fica às 14:15. Qual é o seu nome?
 *
 * A pessoa pediu um dia e ficou com uma hora que nunca viu. Aconteceu em
 * produção a 30 de agosto de 2026.
 *
 * A ambiguidade não se resolve por palavras — "a quarta" é mesmo as duas
 * coisas. Resolve-se pelo resto da frase: se dali sai uma data, a mensagem é
 * sobre dias.
 */

const CATALOGO = { servicos: ['Limpeza dentária'], profissionais: [] as string[] };

/** Domingo. */
const AGORA = new Date('2026-08-30T15:00:00.000Z');

const COM_HORAS: ContextoDaConversa = {
  servico: 'Limpeza dentária',
  data: '2026-08-31',
  slotsOferecidos: [
    { iso: 'iso-1', hora: '12:00' },
    { iso: 'iso-2', hora: '12:15' },
    { iso: 'iso-3', hora: '14:00' },
    { iso: 'iso-4', hora: '14:15' },
    { iso: 'iso-5', hora: '14:30' },
  ],
};

const turno = (mensagem: string) =>
  proximoTurno({
    estado: 'SELECTING_SLOT',
    contexto: COM_HORAS,
    mensagem,
    catalogo: CATALOGO,
    agora: AGORA,
    nomeDaEmpresa: 'Clínica Sorriso',
  });

describe('pedir um dia não escolhe uma hora', () => {
  for (const [mensagem, iaConfundirCom] of [
    ['Teria para quarta feira?', '14:15'],
    ['quinta-feira', '14:30'],
    ['pode ser segunda?', '12:15'],
    ['e na quarta?', '14:15'],
  ] as const) {
    it(`"${mensagem}" não fica com ${iaConfundirCom}`, () => {
      const r = turno(mensagem);

      expect(r.contexto.slotEscolhido ?? null).toBeNull();
      expect(r.texto).not.toContain('Qual é o seu nome');
    });
  }

  it('pedir outro dia manda procurar nesse dia', () => {
    const r = turno('Teria para quarta feira?');

    expect(r.necessidade.tipo).toBe('procurar_slots');
    // Quarta-feira a seguir a domingo 30 de agosto.
    expect(r.contexto.data).toBe('2026-09-02');
  });
});

describe('escolher uma hora continua a funcionar', () => {
  /*
   * A hora explícita não é ambígua e tem de ganhar sempre — inclusive quando
   * vem com o dia colado.
   */
  for (const [mensagem, esperado] of [
    ['14:15', 'iso-4'],
    ['as 12:00', 'iso-1'],
    ['12h15', 'iso-2'],
    ['pode ser 14:30', 'iso-5'],
  ] as const) {
    it(`"${mensagem}" escolhe a hora certa`, () => {
      expect(turno(mensagem).contexto.slotEscolhido).toBe(esperado);
    });
  }

  /*
   * Sem dia na frase, o ordinal continua a valer: é a forma natural de
   * responder a uma lista, e perdê-la seria pagar a correção duas vezes.
   */
  it('sem dia na frase, o ordinal ainda escolhe', () => {
    expect(turno('a primeira').contexto.slotEscolhido).toBe('iso-1');
    expect(turno('a terceira').contexto.slotEscolhido).toBe('iso-3');
  });
});
