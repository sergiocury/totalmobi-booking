import { describe, expect, it } from 'vitest';

import { estadoDosPrecos, nomeDaVariavel, resolverPreco, type LerVariavel } from './precos-stripe';

/**
 * A regra que este ficheiro guarda é a que custa dinheiro se falhar.
 *
 * O browser diz **que plano quer**. O servidor decide **o que isso custa**.
 */

const TODOS: Record<string, string> = {
  STRIPE_PRICE_ESSENTIAL_MONTHLY: 'price_essencial_mensal',
  STRIPE_PRICE_ESSENTIAL_ANNUAL: 'price_essencial_anual',
  STRIPE_PRICE_PROFESSIONAL_MONTHLY: 'price_prof_mensal',
  STRIPE_PRICE_PROFESSIONAL_ANNUAL: 'price_prof_anual',
  STRIPE_PRICE_AI_MONTHLY: 'price_ia_mensal',
  STRIPE_PRICE_AI_ANNUAL: 'price_ia_anual',
};

/** Um ambiente falso. Sem `process.env`, sem restaurar nada entre testes. */
function ambiente(excepto: string[] = []): LerVariavel {
  return (nome) => (excepto.includes(nome) ? undefined : TODOS[nome]);
}

describe('nomeDaVariavel', () => {
  it('é previsível a partir do plano e da periodicidade', () => {
    expect(nomeDaVariavel('essential', 'month')).toBe('STRIPE_PRICE_ESSENTIAL_MONTHLY');
    expect(nomeDaVariavel('ai', 'year')).toBe('STRIPE_PRICE_AI_ANNUAL');
  });
});

describe('resolverPreco', () => {
  it('devolve o preço do plano e da periodicidade pedidos', () => {
    const r = resolverPreco('professional', 'year', ambiente());

    expect(r).toHaveProperty('ok');
    if (!('ok' in r)) return;

    expect(r.ok.priceId).toBe('price_prof_anual');
    expect(r.ok.valorEsperado).toBe(490);
    expect(r.ok.plano.nome).toBe('Profissional');
  });

  it('o valor esperado acompanha a periodicidade', () => {
    const mensal = resolverPreco('professional', 'month', ambiente());
    const anual = resolverPreco('professional', 'year', ambiente());

    expect('ok' in mensal && mensal.ok.valorEsperado).toBe(49);
    expect('ok' in anual && anual.ok.valorEsperado).toBe(490);
  });

  it('recusa um plano que não existe', () => {
    // Códigos antigos, e o que alguém escreveria a tentar a sorte.
    for (const codigo of ['premium', 'basic', 'gratis', '../admin', '']) {
      expect('erro' in resolverPreco(codigo, 'month', ambiente()), codigo).toBe(true);
    }
  });

  it('não há forma de pedir um preço diretamente', () => {
    // A assinatura aceita código, periodicidade e o leitor de ambiente — e mais
    // nada. Este teste falha no dia em que alguém lhe acrescentar um parâmetro
    // de `priceId` "só para o caso de".
    expect(resolverPreco.length).toBe(3);
  });

  it('diz qual variável falta, em vez de devolver vazio', () => {
    const r = resolverPreco('ai', 'year', ambiente(['STRIPE_PRICE_AI_ANNUAL']));

    expect('erro' in r).toBe(true);
    if (!('erro' in r)) return;

    expect(r.erro.tipo).toBe('preco_por_configurar');
    expect(r.erro).toHaveProperty('variavel', 'STRIPE_PRICE_AI_ANNUAL');
  });

  it('uma variável em falta não afeta os outros planos', () => {
    const env = ambiente(['STRIPE_PRICE_AI_ANNUAL']);

    expect('ok' in resolverPreco('essential', 'month', env)).toBe(true);
    expect('ok' in resolverPreco('professional', 'year', env)).toBe(true);
    expect('ok' in resolverPreco('ai', 'month', env)).toBe(true);
  });

  it('cada plano resolve para um identificador diferente', () => {
    // Um copiar-colar na configuração faria dois planos cobrarem o mesmo, e
    // ninguém daria por isso até ver a fatura errada.
    const ids = new Set<string>();

    for (const codigo of ['essential', 'professional', 'ai']) {
      for (const periodo of ['month', 'year'] as const) {
        const r = resolverPreco(codigo, periodo, ambiente());
        if ('ok' in r) ids.add(r.ok.priceId);
      }
    }

    expect(ids.size).toBe(6);
  });
});

describe('estadoDosPrecos', () => {
  it('lista as seis combinações', () => {
    const estado = estadoDosPrecos(ambiente());
    expect(estado).toHaveLength(6);
    expect(estado.every((p) => p.configurado)).toBe(true);
  });

  it('aponta exatamente a que falta', () => {
    const porConfigurar = estadoDosPrecos(
      ambiente(['STRIPE_PRICE_PROFESSIONAL_MONTHLY']),
    ).filter((p) => !p.configurado);

    expect(porConfigurar).toEqual([
      { variavel: 'STRIPE_PRICE_PROFESSIONAL_MONTHLY', configurado: false },
    ]);
  });
});
