import { describe, expect, it } from 'vitest';

import { FEATURE_KEYS } from '../constants';
import { PLANOS, mesesPoupados, planoPorCodigo, temAnual } from './planos';

/**
 * Os planos são a montra do produto. Um erro aqui não parte nada — vende uma
 * coisa que não existe, ou cobra um número que não era o combinado.
 */

describe('os planos', () => {
  it('são três, e os códigos não se repetem', () => {
    expect(PLANOS).toHaveLength(3);
    expect(new Set(PLANOS.map((p) => p.codigo)).size).toBe(3);
  });

  it('sobem de preço pela ordem em que aparecem', () => {
    // Um cartão mais caro à esquerda do mais barato lê-se como erro, e é.
    const precos = PLANOS.map((p) => p.precoMensal);
    expect([...precos].sort((a, b) => a - b)).toEqual(precos);
  });

  it('só um leva o destaque', () => {
    expect(PLANOS.filter((p) => p.recomendado)).toHaveLength(1);
    expect(PLANOS.find((p) => p.recomendado)?.codigo).toBe('professional');
  });

  it('cada capacidade é uma chave de funcionalidade que existe', () => {
    // Uma capacidade inventada aqui prometeria no cartão uma coisa que o
    // `hasFeature` nunca vai encontrar.
    for (const plano of PLANOS) {
      for (const c of plano.capacidades) {
        expect(FEATURE_KEYS, `${plano.codigo} → ${c}`).toContain(c);
      }
    }
  });

  it('cada plano inclui tudo o que o anterior incluía', () => {
    // É o que o cartão diz — "tudo do Essencial". Se deixasse de ser verdade,
    // alguém pagava mais para perder uma funcionalidade.
    for (let i = 1; i < PLANOS.length; i += 1) {
      const anterior = new Set(PLANOS[i - 1]!.capacidades);
      const atual = new Set(PLANOS[i]!.capacidades);

      for (const c of anterior) {
        expect(atual, `${PLANOS[i]!.codigo} devia incluir ${c}`).toContain(c);
      }
    }
  });

  it('a página pública está em todos, incluindo o mais barato', () => {
    // É o argumento que responde a "eu não tenho site". Cortá-lo ao plano de
    // entrada seria cortar a razão pela qual alguém entra.
    for (const plano of PLANOS) {
      expect(plano.capacidades, plano.codigo).toContain('widget');
    }
  });

  it('nenhum plano promete voz', () => {
    // Existe como chave e como canal na base de dados; não existe como
    // funcionalidade. O plano de IA di-lo em `aindaNao`, e é lá que fica.
    for (const plano of PLANOS) {
      expect(plano.capacidades, plano.codigo).not.toContain('voice');
    }
  });
});

describe('o preço anual', () => {
  it('são dez mensalidades em todos', () => {
    for (const plano of PLANOS) {
      expect(plano.precoAnual, plano.codigo).toBe(plano.precoMensal * 10);
    }
  });

  it('dá dois meses grátis', () => {
    for (const plano of PLANOS) {
      expect(mesesPoupados(plano), plano.codigo).toBe(2);
    }
  });

  it('o seletor mensal/anual faz sentido', () => {
    expect(temAnual()).toBe(true);
  });
});

describe('planoPorCodigo', () => {
  it('encontra o que existe', () => {
    expect(planoPorCodigo('professional')?.nome).toBe('Profissional');
  });

  it('devolve null para o que não existe, em vez de rebentar', () => {
    // Um código antigo pode chegar de um tenant criado antes de uma renomeação.
    expect(planoPorCodigo('premium')).toBeNull();
  });
});
