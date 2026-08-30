import { describe, expect, it } from 'vitest';

import { LIMIAR_ARRASTO_PX, ultrapassouLimiar } from './arrasto';

const p = (clientX: number, clientY: number) => ({ clientX, clientY });

describe('ultrapassouLimiar', () => {
  it('parado no mesmo sítio nunca é arrasto', () => {
    expect(ultrapassouLimiar(p(100, 100), p(100, 100))).toBe(false);
  });

  /*
   * O tremor da mão não conta. Quem carrega e larga raramente fica no pixel
   * exato, e apanhar isso como arrasto foi o defeito que moveu marcações em
   * produção sem ninguém dar por isso.
   */
  it('um movimento mínimo continua a ser um clique', () => {
    expect(ultrapassouLimiar(p(100, 100), p(103, 102))).toBe(false);
    expect(ultrapassouLimiar(p(100, 100), p(100, 105))).toBe(false);
  });

  it('a partir do limiar é mesmo um arrasto', () => {
    expect(ultrapassouLimiar(p(100, 100), p(100, 100 + LIMIAR_ARRASTO_PX))).toBe(true);
    expect(ultrapassouLimiar(p(100, 100), p(100, 140))).toBe(true);
  });

  it('conta em qualquer direção', () => {
    for (const [dx, dy] of [
      [20, 0],
      [-20, 0],
      [0, -20],
      [-15, -15],
    ]) {
      expect(ultrapassouLimiar(p(100, 100), p(100 + dx!, 100 + dy!)), `${dx},${dy}`).toBe(true);
    }
  });

  /*
   * A diagonal conta como distância, não como soma dos eixos: 4 px para o lado
   * e 4 para baixo dão 5,7 — abaixo do limiar, e continua a ser um clique.
   */
  it('mede a distância, não cada eixo por si', () => {
    expect(ultrapassouLimiar(p(0, 0), p(4, 4))).toBe(false);
    expect(ultrapassouLimiar(p(0, 0), p(5, 5))).toBe(true);
  });
});
