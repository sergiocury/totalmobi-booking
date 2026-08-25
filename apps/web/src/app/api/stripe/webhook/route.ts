import 'server-only';

import type Stripe from 'stripe';

import type { Json } from '@totalmobi/database';
import { createServiceClient } from '@totalmobi/database/server';

import { obterStripe } from '@/lib/stripe/cliente';

/**
 * O webhook do Stripe.
 *
 * É A ÚNICA COISA QUE ATIVA UMA SUBSCRIÇÃO
 *
 * Não é o browser chegar à página de obrigado — qualquer pessoa consegue abrir
 * esse endereço, e um produto que dá acesso por causa disso está a dar acesso a
 * quem escrever um URL. É este ficheiro, com a assinatura verificada, e mais
 * nada.
 *
 * A ASSINATURA VERIFICA-SE SOBRE O CORPO EM BRUTO
 *
 * `request.text()` e nunca `request.json()`. A assinatura é calculada sobre os
 * bytes exatos que o Stripe enviou; se o corpo for lido como JSON e depois
 * voltado a serializar, a ordem das chaves ou o escape de um acento podem
 * mudar, e a verificação falha por uma razão que não tem nada a ver com
 * segurança. Já vi este mesmo erro no webhook do WhatsApp neste projeto.
 *
 * A IDEMPOTÊNCIA É UMA CHAVE PRIMÁRIA, NÃO UM `IF`
 *
 * O Stripe reenvia eventos quando não recebe resposta a tempo, e pode entregar
 * o mesmo evento mais do que uma vez mesmo quando corre tudo bem. O `insert` em
 * `stripe_webhook_events` tem o id do evento como chave primária: a segunda
 * entrega falha na base de dados e nunca chega ao processamento. Uma
 * verificação em código é uma verificação que alguém acaba por esquecer numa
 * ramificação nova.
 *
 * RESPONDER DEPRESSA
 *
 * O Stripe considera a entrega falhada se demorarmos, e reenvia. Cada evento
 * faz o mínimo: escreve o estado e sai.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Os eventos que este endpoint trata. Os outros ficam registados como ignorados. */
const TRATADOS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export async function POST(request: Request): Promise<Response> {
  const assinatura = request.headers.get('stripe-signature');
  const segredo = process.env['STRIPE_WEBHOOK_SECRET'];

  if (!segredo) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET não configurado');
    return Response.json({ erro: 'não configurado' }, { status: 503 });
  }

  if (!assinatura) {
    return Response.json({ erro: 'sem assinatura' }, { status: 400 });
  }

  const cliente = obterStripe();
  if ('erro' in cliente) {
    console.error(`[stripe] ${cliente.erro}`);
    return Response.json({ erro: 'não configurado' }, { status: 503 });
  }

  const bruto = await request.text();

  let evento: Stripe.Event;
  try {
    evento = cliente.ok.webhooks.constructEvent(bruto, assinatura, segredo);
  } catch (causa) {
    // Assinatura inválida é a definição de pedido não autêntico. 400 e nada
    // mais — não se regista o corpo, porque não se sabe de onde veio.
    console.warn('[stripe] assinatura inválida', causa);
    return Response.json({ erro: 'assinatura inválida' }, { status: 400 });
  }

  const db = createServiceClient();

  // A porta da idempotência. Se este insert falhar por chave duplicada, o
  // evento já cá esteve e não se volta a processar.
  const { error: erroDeRegisto } = await db.from('stripe_webhook_events').insert({
    id: evento.id,
    type: evento.type,
    status: 'received',
    // O evento vem tipado como `Stripe.Event`, e a coluna é `jsonb`. O cast
    // atravessa `unknown` porque as duas formas não se sobrepõem — é
    // serialização, não conversão de tipos.
    payload: JSON.parse(bruto) as Json,
  });

  if (erroDeRegisto) {
    // `23505` é violação de unicidade. Responder 200: o Stripe já fez a parte
    // dele, e insistir só gera mais entregas.
    if (erroDeRegisto.code === '23505') {
      return Response.json({ recebido: true, repetido: true });
    }
    console.error('[stripe] não foi possível registar o evento', erroDeRegisto);
    return Response.json({ erro: 'erro interno' }, { status: 500 });
  }

  if (!TRATADOS.has(evento.type)) {
    await db
      .from('stripe_webhook_events')
      .update({ status: 'ignored', processed_at: new Date().toISOString() })
      .eq('id', evento.id);
    return Response.json({ recebido: true, ignorado: true });
  }

  try {
    await processar(evento, db);

    await db
      .from('stripe_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', evento.id);

    return Response.json({ recebido: true });
  } catch (causa) {
    const mensagem = causa instanceof Error ? causa.message : String(causa);
    console.error(`[stripe] falha a processar ${evento.type}`, causa);

    await db
      .from('stripe_webhook_events')
      .update({ status: 'failed', error: mensagem.slice(0, 500) })
      .eq('id', evento.id);

    // 500 faz o Stripe reenviar. Mas o registo já cá está com o id do evento,
    // por isso a repetição vai bater na chave duplicada e sair sem processar.
    // Fica por resolver à mão, com a linha `failed` a dizer o que aconteceu —
    // que é melhor do que uma tentativa automática a repetir o mesmo erro.
    return Response.json({ erro: 'falha a processar' }, { status: 500 });
  }
}

type ClienteDb = ReturnType<typeof createServiceClient>;

async function processar(evento: Stripe.Event, db: ClienteDb): Promise<void> {
  switch (evento.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await guardarSubscricao(evento.data.object, db);
      return;

    case 'checkout.session.completed': {
      // A sessão não traz a subscrição expandida. O evento
      // `customer.subscription.created` chega logo a seguir e traz tudo — este
      // fica só registado, para se poder responder a "quando é que esta pessoa
      // pagou pela primeira vez".
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      // O estado da subscrição muda com estes eventos, e o Stripe envia
      // `customer.subscription.updated` a seguir com o estado novo. Não se
      // duplica a escrita aqui: dois sítios a escrever o mesmo campo é a
      // receita para eles discordarem.
      return;
    }

    default:
      return;
  }
}

/**
 * Escreve o que o Stripe diz.
 *
 * Sem interpretar. O estado é o que ele chama ao estado — `active`, `past_due`,
 * `canceled`. Traduzir criaria um mapa para manter de cada vez que ele
 * acrescentasse um valor novo, e um valor não traduzido passaria a `unknown`
 * em silêncio.
 */
async function guardarSubscricao(subscricao: Stripe.Subscription, db: ClienteDb): Promise<void> {
  const tenantId = subscricao.metadata?.['tenant_id'] ?? null;
  const planCode = subscricao.metadata?.['plan_code'] ?? null;

  if (!tenantId) {
    // Ainda não há empresa: a subscrição foi criada antes do registo, que é o
    // caso normal de quem compra primeiro e cria a conta depois. Fica no
    // registo de eventos e é ligada quando a empresa nascer.
    throw new Error(
      `subscrição ${subscricao.id} sem tenant_id nos metadados — fica por ligar à empresa`,
    );
  }

  if (!planCode) {
    throw new Error(`subscrição ${subscricao.id} sem plan_code nos metadados`);
  }

  const item = subscricao.items.data[0];
  const segundos = (v: number | null | undefined) =>
    typeof v === 'number' ? new Date(v * 1000).toISOString() : null;

  const { error } = await db.from('tenant_subscriptions').upsert(
    {
      tenant_id: tenantId,
      stripe_customer_id: String(subscricao.customer),
      stripe_subscription_id: subscricao.id,
      stripe_price_id: item?.price.id ?? '',
      plan_code: planCode,
      status: subscricao.status,
      interval: (subscricao.metadata?.['interval'] as 'month' | 'year' | undefined) ?? null,
      current_period_start: segundos(item?.current_period_start),
      current_period_end: segundos(item?.current_period_end),
      cancel_at_period_end: subscricao.cancel_at_period_end,
      trial_end: segundos(subscricao.trial_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );

  if (error) throw new Error(`não foi possível gravar a subscrição: ${error.message}`);
}
