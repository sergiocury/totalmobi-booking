import 'server-only';

import { z } from 'zod';

import { obterStripe } from '@/lib/stripe/cliente';
import { resolverPreco, type Periodicidade } from '@/lib/stripe/precos';

/**
 * Criar a sessão de pagamento.
 *
 * O QUE ESTA ROTA ACEITA, E O QUE NÃO ACEITA
 *
 * Aceita **o código do plano e a periodicidade**. Não aceita um `price_id`, nem
 * um valor, nem uma moeda. Se aceitasse, qualquer pessoa subscrevia o plano de
 * IA ao preço que quisesse — bastava abrir as ferramentas do browser e trocar
 * um campo antes de o pedido sair.
 *
 * É o mesmo princípio do resto do produto: o cliente diz o que quer, o servidor
 * decide o que isso custa.
 *
 * O QUE ESTA ROTA NÃO FAZ
 *
 * Não cria empresa nenhuma, não dá acesso a nada e não escreve uma subscrição.
 * Devolve um endereço do Stripe e mais nada. A subscrição nasce do webhook,
 * depois do pagamento e com a assinatura verificada — o browser chegar a uma
 * página de sucesso não prova pagamento nenhum, porque qualquer pessoa consegue
 * abrir esse endereço.
 */

export const dynamic = 'force-dynamic';

const pedidoSchema = z.object({
  plano: z.string().min(1).max(40),
  periodo: z.enum(['month', 'year']),
  /** Para o Stripe pré-preencher e para associar o cliente depois. */
  email: z.string().email().max(255).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let corpo: unknown;

  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: 'Corpo do pedido inválido.' }, { status: 400 });
  }

  const parsed = pedidoSchema.safeParse(corpo);
  if (!parsed.success) {
    return Response.json({ erro: 'Pedido inválido.' }, { status: 400 });
  }

  const preco = resolverPreco(parsed.data.plano, parsed.data.periodo as Periodicidade);

  if ('erro' in preco) {
    // A mensagem que sai para fora não diz qual variável falta: isso é
    // informação sobre a nossa configuração e não interessa a quem está do
    // outro lado. O registo interno diz.
    if (preco.erro.tipo === 'preco_por_configurar') {
      console.error(`[stripe] falta a variável ${preco.erro.variavel}`);
      return Response.json({ erro: 'Este plano ainda não está disponível.' }, { status: 503 });
    }
    return Response.json({ erro: 'Plano desconhecido.' }, { status: 400 });
  }

  const cliente = obterStripe();
  if ('erro' in cliente) {
    console.error(`[stripe] ${cliente.erro}`);
    return Response.json({ erro: 'Pagamentos indisponíveis.' }, { status: 503 });
  }

  const base = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://booking.totalmobi.pt';

  try {
    const sessao = await cliente.ok.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: preco.ok.priceId, quantity: 1 }],

      success_url: `${base}/subscricao/obrigado?sessao={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/#precos`,

      ...(parsed.data.email ? { customer_email: parsed.data.email } : {}),

      // O que o webhook vai precisar de saber e não consegue adivinhar do
      // preço: qual dos nossos planos é, e se foi mensal ou anual.
      subscription_data: {
        metadata: {
          plan_code: preco.ok.plano.codigo,
          interval: preco.ok.periodo,
        },
      },
      metadata: {
        plan_code: preco.ok.plano.codigo,
        interval: preco.ok.periodo,
      },

      // Permite ao cliente pôr o NIF. Um SaaS vendido em Portugal emite fatura,
      // e quem compra para uma empresa precisa do número lá.
      tax_id_collection: { enabled: true },
      billing_address_collection: 'required',

      locale: 'pt',
    });

    if (!sessao.url) {
      console.error('[stripe] sessão criada sem url');
      return Response.json({ erro: 'Não foi possível abrir o pagamento.' }, { status: 502 });
    }

    return Response.json({ url: sessao.url });
  } catch (causa) {
    console.error('[stripe] falha ao criar a sessão', causa);
    return Response.json({ erro: 'Não foi possível abrir o pagamento.' }, { status: 502 });
  }
}
