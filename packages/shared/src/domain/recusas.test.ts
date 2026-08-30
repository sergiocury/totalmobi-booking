import { describe, expect, it } from 'vitest';

import { DomainErrorCode } from '../errors';
import { motivoDaRecusa, regraDeAntecedencia } from './recusas';

/**
 * A recusa que parecia avaria.
 *
 * A 30 de agosto de 2026, remarcar uma consulta que era daí a três horas
 * devolveu "Não consegui mudar a hora. Vou pedir a um colega que trate disso."
 * A recusa estava certa — a empresa exige 24 horas — e a mensagem escondia-a.
 */

describe('motivoDaRecusa', () => {
  it('a janela fechada tem explicação', () => {
    expect(motivoDaRecusa(DomainErrorCode.CANCELLATION_WINDOW_CLOSED)).toContain('cima da hora');
  });

  it('cada recusa que a pessoa pode resolver tem palavras', () => {
    for (const c of [
      DomainErrorCode.OUTSIDE_WORKING_HOURS,
      DomainErrorCode.SLOT_TAKEN,
      DomainErrorCode.BOOKING_NOT_FOUND,
    ]) {
      expect(motivoDaRecusa(c), c).toBeTruthy();
    }
  });

  /*
   * O que a pessoa não pode usar não se diz. "Sem permissão" faria o cliente
   * pensar que o problema é dele.
   */
  it('o que não se pode explicar não se inventa', () => {
    expect(motivoDaRecusa(DomainErrorCode.NOT_AUTHORIZED)).toBeNull();
    expect(motivoDaRecusa('QUALQUER_COISA')).toBeNull();
  });
});

describe('regraDeAntecedencia', () => {
  it('aproveita o número de horas que só o SQL sabe', () => {
    expect(
      regraDeAntecedencia(
        DomainErrorCode.CANCELLATION_WINDOW_CLOSED,
        'A remarcação exige 24 horas de antecedência',
      ),
    ).toBe('A remarcação exige 24 horas de antecedência');
  });

  it('tira o ponto final, para caber a meio de uma frase', () => {
    expect(regraDeAntecedencia(DomainErrorCode.CANCELLATION_WINDOW_CLOSED, 'Exige 2 horas.')).toBe(
      'Exige 2 horas',
    );
  });

  /*
   * Só se repete a mensagem do Postgres quando ela é mesmo a regra. Qualquer
   * outra pode trazer nomes de colunas, constraints ou caminhos internos.
   */
  it('não repete mensagens que não sejam a regra', () => {
    expect(regraDeAntecedencia(DomainErrorCode.CONFLICT, 'duplicate key value')).toBeNull();
    expect(
      regraDeAntecedencia(DomainErrorCode.CANCELLATION_WINDOW_CLOSED, 'recusado pela política'),
    ).toBeNull();
  });
});
