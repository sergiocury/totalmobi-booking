import 'server-only';

import Stripe from 'stripe';

/**
 * O cliente do Stripe.
 *
 * `server-only` no topo não é decoração: é o que faz o build **falhar** se
 * alguém importar isto de um componente de cliente. Sem essa linha, a chave
 * secreta acabaria no bundle que o browser descarrega, e ninguém daria por isso
 * até alguém a ler.
 *
 * NÃO SE FIXA A VERSÃO DA API AQUI
 *
 * A versão fica na conta, no painel do Stripe. Fixá-la no código significa que
 * o dia em que ela mudar há dois sítios a discordar, e o que está no código
 * ganha em silêncio. Quem quiser mudar de versão fá-lo onde essa decisão vive.
 *
 * O cliente é criado a pedido e não no arranque do módulo: uma função da Vercel
 * que nunca toca no Stripe não tem de rebentar por falta de uma chave que não
 * ia usar.
 */

let cache: Stripe | null = null;

export type ResultadoDoCliente = { ok: Stripe } | { erro: string };

export function obterStripe(): ResultadoDoCliente {
  if (cache) return { ok: cache };

  const chave = process.env['STRIPE_SECRET_KEY'];

  if (!chave) {
    return { erro: 'STRIPE_SECRET_KEY não está configurada.' };
  }

  // Uma chave publicável no lugar da secreta é um engano fácil de fazer e
  // difícil de diagnosticar: o Stripe responde com um erro de autorização que
  // não diz qual das duas chaves está lá.
  if (chave.startsWith('pk_')) {
    return {
      erro: 'STRIPE_SECRET_KEY tem uma chave publicável (pk_…). A chave secreta começa por sk_.',
    };
  }

  cache = new Stripe(chave, {
    // Identifica a integração nos registos do Stripe. Ajuda quem for ler o
    // painel a saber de onde veio um pedido.
    appInfo: { name: 'Totalmobi Booking', url: 'https://booking.totalmobi.pt' },
  });

  return { ok: cache };
}

/** Estamos em modo de teste? Lê-se pelo prefixo da chave. */
export function emModoDeTeste(): boolean {
  return (process.env['STRIPE_SECRET_KEY'] ?? '').startsWith('sk_test_');
}
