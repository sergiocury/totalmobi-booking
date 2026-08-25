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

    // O código do Postgres vai na resposta, e só o código.
    //
    // O painel do Stripe mostra o corpo de cada entrega falhada. Durante a
    // primeira compra a sério, este sítio devolveu `erro interno` seis vezes
    // seguidas e essa palavra não distingue uma tabela em falta de uma coluna
    // errada ou de um privilégio esquecido — era `42501`, permission denied,
    // e ficou escondido em `console.error`.
    //
    // `42501` não é informação sensível: é um código de cinco caracteres do
    // manual do Postgres. A mensagem, essa, fica no log — pode trazer nomes de
    // colunas e valores, e o corpo de uma resposta HTTP não é sítio para isso.
    return Response.json({ erro: 'erro interno', codigo: erroDeRegisto.code }, { status: 500 });
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
 * Escreve o que o Stripe diz, e cria a empresa se ela ainda não existir.
 *
 * ESTE É O ÚNICO SÍTIO ONDE UMA EMPRESA NASCE DE UMA COMPRA
 *
 * Não é o formulário de registo, não é a página de obrigado. É aqui, depois de
 * o Stripe confirmar o pagamento e com a assinatura verificada. Qualquer outro
 * caminho daria uma empresa a quem soubesse escrever um URL.
 *
 * O estado guarda-se como o Stripe lhe chama — `active`, `past_due`, `canceled`.
 * Traduzir criaria um mapa para manter de cada vez que ele acrescentasse um
 * valor, e um valor não traduzido passaria a `unknown` em silêncio.
 */
async function guardarSubscricao(subscricao: Stripe.Subscription, db: ClienteDb): Promise<void> {
  const meta = subscricao.metadata ?? {};
  const planCode = meta['plan_code'] ?? null;

  if (!planCode) {
    throw new Error(`subscrição ${subscricao.id} sem plan_code nos metadados`);
  }

  const tenantId = meta['tenant_id'] ?? (await provisionar(subscricao, db));

  if (!tenantId) {
    throw new Error(
      `subscrição ${subscricao.id} sem empresa: faltam tenant_id ou os dados de registo nos metadados`,
    );
  }

  const item = subscricao.items.data[0];
  const segundos = (v: number | null | undefined) =>
    typeof v === 'number' ? new Date(v * 1000).toISOString() : null;

  /**
   * O período vive em dois sítios, conforme a idade da API.
   *
   * Nas versões recentes está no **item** da subscrição. Nas antigas estava na
   * própria subscrição. E a versão que conta não é a do SDK: é a que estiver
   * fixada **no endpoint do webhook**, que pode ser muito mais velha do que o
   * resto — o endpoint desta conta está em 2020-03-02.
   *
   * Ler só o item daria `null` nas duas colunas de período, sem erro nenhum e
   * sem ninguém dar por isso até alguém perguntar quando é que a subscrição
   * renova. Lê-se onde estiver.
   *
   * O `as` atravessa `unknown` porque o campo não existe no tipo atual — existe
   * no JSON que uma API antiga envia, que é coisa diferente.
   */
  const antiga = subscricao as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };

  const inicioDoPeriodo = segundos(item?.current_period_start ?? antiga.current_period_start);
  const fimDoPeriodo = segundos(item?.current_period_end ?? antiga.current_period_end);

  const { error } = await db.from('tenant_subscriptions').upsert(
    {
      tenant_id: tenantId,
      stripe_customer_id: String(subscricao.customer),
      stripe_subscription_id: subscricao.id,
      stripe_price_id: item?.price.id ?? '',
      plan_code: planCode,
      status: subscricao.status,
      interval: (meta['interval'] as 'month' | 'year' | undefined) ?? null,
      current_period_start: inicioDoPeriodo,
      current_period_end: fimDoPeriodo,
      cancel_at_period_end: subscricao.cancel_at_period_end,
      trial_end: segundos(subscricao.trial_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );

  if (error) throw new Error(`não foi possível gravar a subscrição: ${error.message}`);

  // O plano da empresa acompanha o que foi pago. É daqui que o `plan_features`
  // resolve o que ela pode fazer.
  await db
    .from('tenants')
    .update({ plan_code: planCode, status: 'active', updated_at: new Date().toISOString() })
    .eq('id', tenantId);
}

/**
 * Criar a empresa a partir do que ficou nos metadados do registo.
 *
 * Idempotente por construção: se já existir uma empresa com este slug e este
 * dono, devolve-a em vez de tentar criar outra. O Stripe reenvia eventos, e um
 * reenvio nunca pode duplicar uma empresa.
 *
 * O slug foi verificado no registo, mas entre esse momento e este passam
 * minutos — e nesses minutos outra pessoa pode ter registado o mesmo nome. A
 * garantia é o índice único, e o desempate é acrescentar um sufixo em vez de
 * falhar: quem pagou tem de ficar com uma empresa.
 */
async function provisionar(
  subscricao: Stripe.Subscription,
  db: ClienteDb,
): Promise<string | null> {
  const meta = subscricao.metadata ?? {};
  const userId = meta['user_id'];
  const slugPedido = meta['slug'];
  const displayName = meta['display_name'];
  const email = meta['email'] ?? null;
  const planCode = meta['plan_code'];

  if (!userId || !slugPedido || !displayName || !planCode) return null;

  // Já provisionada? O reenvio de um evento não pode criar uma segunda empresa.
  const { data: jaExiste } = await db
    .from('memberships')
    .select('tenant_id, tenants!inner(slug)')
    .eq('user_id', userId)
    .limit(50);

  const daPessoa = (jaExiste ?? []).find(
    (m) => (m.tenants as unknown as { slug: string } | null)?.slug?.startsWith(slugPedido),
  );

  if (daPessoa) return daPessoa.tenant_id;

  const slug = await slugLivre(db, slugPedido);

  const { data: empresa, error: erroDaEmpresa } = await db
    .from('tenants')
    .insert({
      slug,
      display_name: displayName,
      email,
      plan_code: planCode,
      status: 'active',
      created_by: userId,
    })
    .select('id')
    .single();

  if (erroDaEmpresa || !empresa) {
    throw new Error(`não foi possível criar a empresa: ${erroDaEmpresa?.message ?? 'sem detalhe'}`);
  }

  // Quem paga fica dono. `accepted_at` preenchido: não faz sentido convidar
  // alguém para a empresa que acabou de comprar.
  const { error: erroDoAcesso } = await db.from('memberships').insert({
    tenant_id: empresa.id,
    user_id: userId,
    role: 'tenant_admin',
    accepted_at: new Date().toISOString(),
  });

  if (erroDoAcesso) {
    throw new Error(`empresa ${empresa.id} criada mas sem acesso: ${erroDoAcesso.message}`);
  }

  return empresa.id;
}

/** O slug pedido, ou o primeiro sufixo livre. Quem pagou não pode ficar sem empresa. */
async function slugLivre(db: ClienteDb, pedido: string): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const candidato = i === 0 ? pedido : `${pedido}-${i + 1}`;
    const { data } = await db.from('tenants').select('id').eq('slug', candidato).maybeSingle();
    if (!data) return candidato;
  }

  // Vinte colisões no mesmo nome é improvável ao ponto de ser suspeito, mas
  // devolver um slug que sabemos estar ocupado seria pior.
  return `${pedido}-${Date.now().toString(36)}`;
}
