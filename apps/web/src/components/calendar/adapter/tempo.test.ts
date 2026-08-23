import { describe, expect, it } from 'vitest';

import { diaLocal, diasDesde, etiquetaHora, instanteDe, minutosDoDia, segundaFeiraDe } from './tempo';

/**
 * Os testes do calendário.
 *
 * Isto não se testa clicando. Um erro de fuso aqui não parte nada de forma
 * visível: desenha uma marcação uma hora ao lado, ou na coluna do dia anterior,
 * e ninguém dá por isso até um cliente chegar à hora errada.
 *
 * Portugal continental é UTC+0 no inverno e UTC+1 no verão, e em 2026 a mudança
 * é a **29 de março** e a **25 de outubro** — as duas datas que aparecem abaixo
 * mais vezes do que qualquer outra, de propósito.
 */

const LISBOA = 'Europe/Lisbon';

describe('minutosDoDia', () => {
  it('lê a hora do fuso da unidade, não a do computador', () => {
    // 09:00 UTC em agosto são 10:00 em Lisboa.
    expect(minutosDoDia(new Date('2026-08-24T09:00:00Z'), LISBOA)).toBe(10 * 60);
    // Em janeiro, as mesmas 09:00 UTC são 09:00.
    expect(minutosDoDia(new Date('2026-01-15T09:00:00Z'), LISBOA)).toBe(9 * 60);
  });

  it('num fuso diferente dá outra hora para o mesmo instante', () => {
    const instante = new Date('2026-08-24T09:00:00Z');
    expect(minutosDoDia(instante, 'Europe/Madrid')).toBe(11 * 60);
    expect(minutosDoDia(instante, 'Atlantic/Azores')).toBe(9 * 60);
  });
});

describe('diaLocal', () => {
  it('é o dia da parede, não o dia em UTC', () => {
    // 23:30 UTC de 24 de agosto já é dia 25 em Lisboa. É este o caso que
    // `toISOString().slice(0,10)` erra — e que punha o bloco na coluna errada.
    expect(diaLocal(new Date('2026-08-24T23:30:00Z'), LISBOA)).toBe('2026-08-25');
    expect(new Date('2026-08-24T23:30:00Z').toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('devolve sempre AAAA-MM-DD com zeros à esquerda', () => {
    expect(diaLocal(new Date('2026-01-05T12:00:00Z'), LISBOA)).toBe('2026-01-05');
  });
});

describe('segundaFeiraDe', () => {
  it('a segunda de uma segunda é ela própria', () => {
    expect(segundaFeiraDe('2026-08-24')).toBe('2026-08-24');
  });

  it('recua até à segunda em qualquer dia da semana', () => {
    expect(segundaFeiraDe('2026-08-26')).toBe('2026-08-24'); // quarta
    expect(segundaFeiraDe('2026-08-29')).toBe('2026-08-24'); // sábado
  });

  it('o domingo pertence à semana que acaba, não à que começa', () => {
    // A armadilha clássica: com semanas a começar ao domingo, o sábado e o
    // domingo do mesmo fim de semana caem em vistas diferentes.
    expect(segundaFeiraDe('2026-08-30')).toBe('2026-08-24');
  });

  it('atravessa meses e anos', () => {
    expect(segundaFeiraDe('2026-10-01')).toBe('2026-09-28');
    expect(segundaFeiraDe('2027-01-01')).toBe('2026-12-28');
  });

  it('não se desloca na semana em que o relógio muda', () => {
    // 29 de março de 2026 é o domingo em que Portugal adianta o relógio.
    expect(segundaFeiraDe('2026-03-29')).toBe('2026-03-23');
    expect(segundaFeiraDe('2026-10-25')).toBe('2026-10-19');
  });
});

describe('diasDesde', () => {
  it('dá dias consecutivos, sem repetir nem saltar', () => {
    expect(diasDesde('2026-08-24', 7)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ]);
  });

  it('a semana da mudança de hora tem sete dias distintos', () => {
    // Contas feitas a partir da meia-noite dariam aqui um dia repetido ou um em
    // falta, consoante o sentido do salto.
    const semana = diasDesde('2026-10-19', 7);
    expect(semana).toHaveLength(7);
    expect(new Set(semana).size).toBe(7);
    expect(semana[6]).toBe('2026-10-25');
  });

  it('passa de mês sem tropeçar', () => {
    expect(diasDesde('2026-08-31', 2)).toEqual(['2026-08-31', '2026-09-01']);
  });
});

describe('instanteDe', () => {
  it('as 10:00 de Lisboa em agosto são as 09:00 UTC', () => {
    expect(instanteDe('2026-08-24', 10 * 60, LISBOA).toISOString()).toBe('2026-08-24T09:00:00.000Z');
  });

  it('as 10:00 de Lisboa em janeiro são as 10:00 UTC', () => {
    expect(instanteDe('2026-01-15', 10 * 60, LISBOA).toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('é o inverso de minutosDoDia em todos os dias da semana da mudança', () => {
    // A propriedade que interessa: pôr um bloco às 14:30 e voltar a lê-lo tem
    // de dar 14:30, seja qual for o dia. Se falhasse no dia da mudança, uma
    // marcação arrastada nesse dia aterrava uma hora ao lado.
    for (const dia of diasDesde('2026-10-19', 7)) {
      for (const minuto of [8 * 60, 12 * 60 + 30, 14 * 60 + 30, 19 * 60 + 45]) {
        const instante = instanteDe(dia, minuto, LISBOA);
        expect(minutosDoDia(instante, LISBOA), `${dia} às ${etiquetaHora(minuto)}`).toBe(minuto);
        expect(diaLocal(instante, LISBOA), `${dia} às ${etiquetaHora(minuto)}`).toBe(dia);
      }
    }
  });

  it('o mesmo, na semana em que o relógio adianta', () => {
    for (const dia of diasDesde('2026-03-23', 7)) {
      for (const minuto of [8 * 60, 14 * 60 + 30, 19 * 60 + 45]) {
        const instante = instanteDe(dia, minuto, LISBOA);
        expect(minutosDoDia(instante, LISBOA), `${dia} às ${etiquetaHora(minuto)}`).toBe(minuto);
        expect(diaLocal(instante, LISBOA), `${dia} às ${etiquetaHora(minuto)}`).toBe(dia);
      }
    }
  });
});

describe('etiquetaHora', () => {
  it('escreve sempre com quatro dígitos', () => {
    expect(etiquetaHora(0)).toBe('00:00');
    expect(etiquetaHora(9 * 60 + 5)).toBe('09:05');
    expect(etiquetaHora(23 * 60 + 59)).toBe('23:59');
  });
});
