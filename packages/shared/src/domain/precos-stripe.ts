import { PLANOS, planoPorCodigo, type CodigoDePlano, type Plano } from './planos';

/**
 * De um plano para um preço do Stripe.
 *
 * A REGRA QUE MAIS IMPORTA
 *
 * **O browser nunca envia um `price_id`.** Envia o código do plano e a
 * periodicidade — `professional` e `year` — e é aqui que se decide o que
 * cobrar. Aceitar um `price_id` do cliente deixaria qualquer pessoa subscrever
 * o plano de IA ao preço de um cêntimo: bastava abrir as ferramentas do browser
 * e trocar um campo antes de o pedido sair. Do lado do Stripe, esse pedido seria
 * perfeitamente válido.
 *
 * PORQUE É QUE ISTO É PURO E VIVE NUM PACOTE
 *
 * Escrevi isto primeiro em `apps/web/src/lib/stripe/`, com o teste ao lado — e
 * o teste ali dentro **parte a publicação**: o Next verifica os tipos de todos
 * os `.ts` da app e a Vercel instala de dentro de `apps/web`, onde o `vitest`
 * não existe. Já tinha acontecido antes neste projeto, com o calendário.
 *
 * A saída não foi declarar o `vitest` na app. Foi separar o que é lógica do que
 * é acesso ao ambiente: esta função recebe **como ler uma variável**, em vez de
 * ler o `process.env` diretamente. Testa-se sem mexer no ambiente, e o que fica
 * na app é uma casca de três linhas que não precisa de teste nenhum.
 *
 * OS IDENTIFICADORES NÃO SÃO SEGREDOS
 *
 * Um `price_id` pode aparecer numa página sem risco. O que é segredo é a chave
 * secreta e o segredo de assinatura do webhook — esses nunca saem do servidor.
 *
 * Vêm do ambiente porque o modo de teste e o modo real do Stripe têm
 * identificadores diferentes, e a base de dados é partilhada entre esta máquina
 * e produção — por isso também não serve de casa a estes valores.
 */

export type Periodicidade = 'month' | 'year';

/** Como ler uma variável de ambiente. Injetado para isto ser testável. */
export type LerVariavel = (nome: string) => string | undefined;

export interface PrecoResolvido {
  readonly plano: Plano;
  readonly periodo: Periodicidade;
  readonly priceId: string;
  /** Em euros. Serve para conferir contra o que o Stripe devolver. */
  readonly valorEsperado: number;
}

export type ErroDePreco =
  | { readonly tipo: 'plano_desconhecido'; readonly codigo: string }
  | { readonly tipo: 'periodo_indisponivel'; readonly codigo: string }
  | { readonly tipo: 'preco_por_configurar'; readonly variavel: string };

/** O nome da variável de ambiente de cada combinação. */
export function nomeDaVariavel(codigo: CodigoDePlano, periodo: Periodicidade): string {
  return `STRIPE_PRICE_${codigo.toUpperCase()}_${periodo === 'month' ? 'MONTHLY' : 'ANNUAL'}`;
}

/**
 * Resolve o preço, ou diz exatamente o que falta.
 *
 * Um identificador em falta devolve um erro **nomeado** e não `undefined`.
 * Passar `undefined` ao Stripe daria uma mensagem sobre um parâmetro inválido,
 * e quem a lesse não saberia que o problema era uma variável por preencher.
 */
export function resolverPreco(
  codigo: string,
  periodo: Periodicidade,
  ler: LerVariavel,
): { readonly ok: PrecoResolvido } | { readonly erro: ErroDePreco } {
  const plano = planoPorCodigo(codigo);
  if (!plano) return { erro: { tipo: 'plano_desconhecido', codigo } };

  if (periodo === 'year' && plano.precoAnual === null) {
    return { erro: { tipo: 'periodo_indisponivel', codigo } };
  }

  const variavel = nomeDaVariavel(plano.codigo, periodo);
  const priceId = ler(variavel);

  if (!priceId) return { erro: { tipo: 'preco_por_configurar', variavel } };

  return {
    ok: {
      plano,
      periodo,
      priceId,
      valorEsperado: periodo === 'year' ? plano.precoAnual! : plano.precoMensal,
    },
  };
}

/**
 * Que preços já estão configurados.
 *
 * A pergunta que se faz quando um botão não funciona é "porquê", e a resposta
 * costuma ser "falta uma variável". Isto responde sem ninguém ter de adivinhar.
 */
export function estadoDosPrecos(ler: LerVariavel): { variavel: string; configurado: boolean }[] {
  const saida: { variavel: string; configurado: boolean }[] = [];

  for (const plano of PLANOS) {
    const periodos: Periodicidade[] = plano.precoAnual === null ? ['month'] : ['month', 'year'];
    for (const periodo of periodos) {
      const variavel = nomeDaVariavel(plano.codigo, periodo);
      saida.push({ variavel, configurado: Boolean(ler(variavel)) });
    }
  }

  return saida;
}
