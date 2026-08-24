import { describe, expect, it } from 'vitest';

import {
  alteracaoDoDia,
  juntarPeriodos,
  semAlteracao,
  subtrairPeriodos,
  type PeriodoLocal,
} from './alterar-dia';

/**
 * O que se grava quando alguém altera um dia.
 *
 * A propriedade que interessa está no fim: aplicar a alteração ao horário base
 * tem de dar exatamente o horário desejado. Se isso falhar, a interface mostra
 * uma coisa e o motor faz outra — e ninguém dá por isso até um cliente aparecer
 * à hora errada.
 */

const p = (startsAt: string, endsAt: string): PeriodoLocal => ({ startsAt, endsAt });

/** O que o motor faria: base menos os fechos, mais as aberturas. */
function aplicar(base: PeriodoLocal[], a: ReturnType<typeof alteracaoDoDia>): PeriodoLocal[] {
  if (a.fecharDiaInteiro) return [];
  return juntarPeriodos([...subtrairPeriodos(base, a.fechar), ...a.abrir]);
}

describe('juntarPeriodos', () => {
  it('junta os que se tocam', () => {
    expect(juntarPeriodos([p('09:00', '12:00'), p('12:00', '18:00')])).toEqual([p('09:00', '18:00')]);
  });

  it('junta os que se sobrepõem e ordena', () => {
    expect(juntarPeriodos([p('14:00', '18:00'), p('09:00', '15:00')])).toEqual([
      p('09:00', '18:00'),
    ]);
  });

  it('deixa em paz os que têm intervalo entre si', () => {
    expect(juntarPeriodos([p('09:00', '13:00'), p('14:00', '18:00')])).toEqual([
      p('09:00', '13:00'),
      p('14:00', '18:00'),
    ]);
  });

  it('descarta os que acabam antes de começar', () => {
    expect(juntarPeriodos([p('18:00', '09:00'), p('10:00', '10:00')])).toEqual([]);
  });
});

describe('subtrairPeriodos', () => {
  it('corta pelo meio e deixa duas pontas', () => {
    expect(subtrairPeriodos([p('09:00', '18:00')], [p('13:00', '14:00')])).toEqual([
      p('09:00', '13:00'),
      p('14:00', '18:00'),
    ]);
  });

  it('corta uma ponta', () => {
    expect(subtrairPeriodos([p('09:00', '18:00')], [p('09:00', '11:00')])).toEqual([
      p('11:00', '18:00'),
    ]);
  });

  it('cobrir tudo devolve vazio', () => {
    expect(subtrairPeriodos([p('09:00', '18:00')], [p('08:00', '20:00')])).toEqual([]);
  });

  it('subtrair fora do intervalo não faz nada', () => {
    expect(subtrairPeriodos([p('09:00', '18:00')], [p('19:00', '20:00')])).toEqual([
      p('09:00', '18:00'),
    ]);
  });
});

describe('alteracaoDoDia', () => {
  it('encurtar o dia grava dois fechos parciais', () => {
    // O caso do enunciado: 08:00–20:00 e a Ana quer sair às 16h.
    const a = alteracaoDoDia([p('08:00', '20:00')], [p('09:00', '16:00')]);

    expect(a.fecharDiaInteiro).toBe(false);
    expect(a.fechar).toEqual([p('08:00', '09:00'), p('16:00', '20:00')]);
    expect(a.abrir).toEqual([]);
  });

  it('alargar o dia grava aberturas', () => {
    const a = alteracaoDoDia([p('09:00', '18:00')], [p('08:00', '20:00')]);

    expect(a.fechar).toEqual([]);
    expect(a.abrir).toEqual([p('08:00', '09:00'), p('18:00', '20:00')]);
  });

  it('não trabalhar é uma linha só, não fechos que por acaso cobrem tudo', () => {
    // Fechos parciais diriam o mesmo hoje e reabririam o dia sozinhos se o
    // padrão base crescesse amanhã.
    const a = alteracaoDoDia([p('08:00', '20:00')], []);

    expect(a.fecharDiaInteiro).toBe(true);
    expect(a.fechar).toEqual([]);
    expect(a.abrir).toEqual([]);
  });

  it('sem mudança nenhuma não grava nada', () => {
    const a = alteracaoDoDia([p('09:00', '18:00')], [p('09:00', '18:00')]);
    expect(semAlteracao(a)).toBe(true);
  });

  it('mudar a hora de almoço grava a abertura e o fecho certos', () => {
    const base = [p('09:00', '13:00'), p('14:00', '18:00')];
    const desejado = [p('09:00', '12:30'), p('13:30', '18:00')];
    const a = alteracaoDoDia(base, desejado);

    expect(a.fechar).toEqual([p('12:30', '13:00')]);
    expect(a.abrir).toEqual([p('13:30', '14:00')]);
  });

  it('trabalhar num dia em que não havia horário é só abertura', () => {
    const a = alteracaoDoDia([], [p('10:00', '14:00')]);
    expect(a.fechar).toEqual([]);
    expect(a.abrir).toEqual([p('10:00', '14:00')]);
  });
});

describe('a propriedade que interessa: aplicar dá o desejado', () => {
  const casos: { nome: string; base: PeriodoLocal[]; desejado: PeriodoLocal[] }[] = [
    { nome: 'encurtar', base: [p('08:00', '20:00')], desejado: [p('09:00', '16:00')] },
    { nome: 'alargar', base: [p('09:00', '18:00')], desejado: [p('08:00', '20:00')] },
    { nome: 'deslocar', base: [p('09:00', '13:00')], desejado: [p('14:00', '18:00')] },
    {
      nome: 'partir em dois',
      base: [p('09:00', '18:00')],
      desejado: [p('09:00', '12:00'), p('15:00', '18:00')],
    },
    {
      nome: 'juntar dois num só',
      base: [p('09:00', '13:00'), p('14:00', '18:00')],
      desejado: [p('09:00', '18:00')],
    },
    { nome: 'sem base', base: [], desejado: [p('10:00', '14:00')] },
    { nome: 'igual', base: [p('09:00', '18:00')], desejado: [p('09:00', '18:00')] },
  ];

  for (const caso of casos) {
    it(caso.nome, () => {
      const a = alteracaoDoDia(caso.base, caso.desejado);
      expect(aplicar(caso.base, a)).toEqual(juntarPeriodos(caso.desejado));
    });
  }

  it('fechar o dia dá mesmo dia fechado', () => {
    const base = [p('08:00', '20:00')];
    expect(aplicar(base, alteracaoDoDia(base, []))).toEqual([]);
  });
});
