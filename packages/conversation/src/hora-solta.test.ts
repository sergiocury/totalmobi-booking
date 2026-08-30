import { describe, expect, it } from 'vitest';

import { extrair, extrairLimitesDeHora } from './extractor';
import { filtrarPorPreferencia } from './preferencia-horaria';

/**
 * A hora dita sem "às".
 *
 * A mensagem real, a 30 de agosto de 2026:
 *
 *   — Poderia também marcar uma consulta com a Ana na quarta feira 14:30?
 *   — Quarta-feira, 2 de setembro, para Consulta tenho: 09:00, 09:15, 09:30…
 *
 * O dia foi lido; a hora foi deitada fora. O reconhecimento exigia "às" antes
 * do número, e "na quarta feira 14:30" é uma forma perfeitamente normal de
 * pedir. Quem disse 14:30 recebeu as primeiras horas da manhã.
 */

const CATALOGO = { servicos: ['Consulta'], profissionais: ['Ana Martins'] };
const AGORA = new Date('2026-08-30T15:00:00.000Z');

describe('uma hora solta é uma hora', () => {
  it('a mensagem real passa a trazer a hora', () => {
    const r = extrairLimitesDeHora(
      'Poderia também marcar uma consulta com a Ana na quarta feira 14:30?',
    );

    expect(r.minima).toBe('14:30');
    expect(r.maxima).toBe('14:30');
  });

  it('aceita as formas correntes de escrever horas', () => {
    for (const [m, esperado] of [
      ['quarta 14h30', '14:30'],
      ['pode ser 9h', '09:00'],
      ['sexta 08:15', '08:15'],
    ] as const) {
      expect(extrairLimitesDeHora(m).minima, m).toBe(esperado);
    }
  });

  /*
   * O contrário: um número que não é uma hora não pode virar uma. Sem exigir
   * `:` ou `h`, "dia 2" seria as duas da manhã.
   */
  it('não confunde números com horas', () => {
    for (const m of ['dia 2 de setembro', 'marcar para 4 pessoas', 'o meu nº é 912345678']) {
      expect(extrairLimitesDeHora(m).minima, m).toBeNull();
    }
  });

  it('uma hora impossível não é uma hora', () => {
    expect(extrairLimitesDeHora('o código é 45:99').minima).toBeNull();
  });

  it('"depois das" continua a ser um mínimo, não uma hora exata', () => {
    const r = extrairLimitesDeHora('depois das 14:30');

    expect(r.minima).toBe('14:30');
    expect(r.maxima).toBeNull();
  });

  /*
   * A ligação que interessa: a hora tem de sair do extrator e chegar ao filtro,
   * senão corrige-se a peça e o defeito fica.
   */
  it('a hora chega ao filtro e escolhe a hora certa', () => {
    const i = extrair(
      'Poderia também marcar uma consulta com a Ana na quarta feira 14:30?',
      CATALOGO,
      AGORA,
    );

    const horas = [
      { iso: 'a', hora: '09:00' },
      { iso: 'b', hora: '14:30' },
      { iso: 'c', hora: '15:00' },
    ];

    const r = filtrarPorPreferencia(horas, {
      horaMinima: i.horaMinima,
      horaMaxima: i.horaMaxima,
    });

    expect(r.horas.map((h) => h.hora)).toEqual(['14:30']);
    expect(r.relaxado).toBe(false);
  });

  it('e o dia continua a ser lido na mesma frase', () => {
    const i = extrair('com a Ana na quarta feira 14:30', CATALOGO, AGORA);

    expect(i.data).toBe('2026-09-02');
    expect(i.profissional).toBe('Ana Martins');
  });
});
