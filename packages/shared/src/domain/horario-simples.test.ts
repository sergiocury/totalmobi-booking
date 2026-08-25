import { describe, expect, it } from 'vitest';

import { janelaSemanal } from './horario-simples';

const base = { dias: [1, 2, 3, 4, 5], abre: '09:00', fecha: '18:00' };

describe('janelaSemanal', () => {
  it('aceita a semana de trabalho normal', () => {
    const r = janelaSemanal(base);

    expect(r).toEqual({ ok: { dias: [1, 2, 3, 4, 5], abre: '09:00', fecha: '18:00' } });
  });

  it('recusa horas sem o zero à esquerda', () => {
    // Sem esta guarda, a comparação textual de `abre` e `fecha` mentiria:
    // "9:00" > "18:00" em ordem alfabética.
    expect(janelaSemanal({ ...base, abre: '9:00' })).toEqual({
      erro: 'Horas inválidas. Use o formato 09:00.',
    });
  });

  it.each([
    ['24:00', 'hora fora do relógio'],
    ['12:60', 'minuto fora do relógio'],
    ['', 'vazio'],
    ['manhã', 'texto'],
    ['09:00:00', 'com segundos'],
  ])('recusa %s (%s)', (hora) => {
    expect(janelaSemanal({ ...base, fecha: hora })).toEqual({
      erro: 'Horas inválidas. Use o formato 09:00.',
    });
  });

  it('recusa fechar antes de abrir', () => {
    expect(janelaSemanal({ ...base, abre: '18:00', fecha: '09:00' })).toEqual({
      erro: 'A hora de fecho tem de ser depois da de abertura.',
    });
  });

  it('recusa abrir e fechar à mesma hora', () => {
    expect(janelaSemanal({ ...base, abre: '09:00', fecha: '09:00' })).toEqual({
      erro: 'A hora de fecho tem de ser depois da de abertura.',
    });
  });

  it('a comparação textual respeita a ordem do relógio', () => {
    // O caso que uma comparação ingénua erraria se não houvesse zero à esquerda.
    expect(janelaSemanal({ ...base, abre: '09:00', fecha: '10:00' })).toHaveProperty('ok');
    expect(janelaSemanal({ ...base, abre: '10:00', fecha: '09:00' })).toHaveProperty('erro');
  });

  it('recusa uma semana sem dias', () => {
    expect(janelaSemanal({ ...base, dias: [] })).toEqual({
      erro: 'Escolha pelo menos um dia da semana.',
    });
  });

  it('tira dias repetidos e ordena', () => {
    const r = janelaSemanal({ ...base, dias: [5, 1, 5, 3] });

    expect(r).toHaveProperty('ok');
    expect('ok' in r && r.ok.dias).toEqual([1, 3, 5]);
  });

  it.each([-1, 7, 1.5, Number.NaN])('recusa o dia %s', (dia) => {
    expect(janelaSemanal({ ...base, dias: [dia] })).toEqual({ erro: 'Dia da semana inválido.' });
  });

  it('aceita o domingo, que é 0 e não 7', () => {
    const r = janelaSemanal({ ...base, dias: [0] });

    expect(r).toHaveProperty('ok');
    expect('ok' in r && r.ok.dias).toEqual([0]);
  });
});
