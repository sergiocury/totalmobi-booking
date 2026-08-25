'use server';

import { createServiceClient } from '@totalmobi/database/server';
import { isReservedSlug, slugify, slugSchema } from '@totalmobi/shared';
import { z } from 'zod';

import { obterStripe } from '@/lib/stripe/cliente';
import { resolverPreco, type Periodicidade } from '@/lib/stripe/precos';

/**
 * Registo e início da subscrição.
 *
 * A DECISÃO QUE MOLDA TUDO: QUANDO É QUE A EMPRESA NASCE
 *
 * Há duas ordens possíveis, e a diferença entre elas aparece um mês depois.
 *
 * **Criar a empresa antes do pagamento** é mais simples de escrever e enche a
 * base de empresas mortas: cada checkout abandonado — e são muitos — deixa uma
 * empresa sem dono, a ocupar um slug que alguém a sério podia querer.
 *
 * **Criar a empresa depois do pagamento**, no webhook, deixa a base limpa. O
 * custo é ter de guardar as intenções algures até o pagamento chegar, e é isso
 * que os metadados da sessão fazem.
 *
 * Escolhi a segunda. Aqui só nasce a **conta de utilizador**, porque a
 * palavra-passe tem de ser escrita antes do pagamento — pedi-la depois seria
 * pedi-la a quem já pagou e ainda não tem onde entrar.
 *
 * Um registo abandonado deixa então uma conta sem empresa nenhuma. É inofensivo,
 * e a pessoa pode voltar e continuar de onde ficou.
 *
 * O SLUG É VERIFICADO AQUI E GARANTIDO PELA BASE
 *
 * Verifica-se agora para dar uma mensagem decente antes de alguém pagar. Mas a
 * garantia é o índice único: entre esta verificação e o webhook passam minutos,
 * e nesses minutos outra pessoa pode registar o mesmo nome.
 */

export type EstadoDoRegisto = { erro?: string; url?: string };

const registoSchema = z.object({
  nome: z.string().trim().min(2, 'Diga-nos o seu nome').max(120),
  empresa: z.string().trim().min(2, 'O nome da empresa é obrigatório').max(120),
  email: z.string().trim().toLowerCase().email('Email inválido').max(255),
  // Oito é o mínimo do Supabase. Não se impõem regras de maiúsculas e símbolos:
  // produzem palavras-passe piores, escritas num papel ao lado do teclado.
  palavraPasse: z.string().min(8, 'A palavra-passe precisa de pelo menos 8 caracteres').max(200),
  plano: z.string().min(1).max(40),
  periodo: z.enum(['month', 'year']),
});

export async function iniciarSubscricao(
  _anterior: EstadoDoRegisto,
  formData: FormData,
): Promise<EstadoDoRegisto> {
  const parsed = registoSchema.safeParse({
    nome: formData.get('nome'),
    empresa: formData.get('empresa'),
    email: formData.get('email'),
    palavraPasse: formData.get('palavraPasse'),
    plano: formData.get('plano'),
    periodo: formData.get('periodo'),
  });

  if (!parsed.success) {
    return { erro: parsed.error.issues[0]!.message };
  }

  const preco = resolverPreco(parsed.data.plano, parsed.data.periodo as Periodicidade);
  if ('erro' in preco) {
    if (preco.erro.tipo === 'preco_por_configurar') {
      console.error(`[registo] falta ${preco.erro.variavel}`);
      return { erro: 'Este plano ainda não está disponível. Fale connosco.' };
    }
    return { erro: 'Plano desconhecido.' };
  }

  // ── O identificador público ────────────────────────────────────────────────
  const slug = slugify(parsed.data.empresa);
  const slugValido = slugSchema.safeParse(slug);

  if (!slugValido.success) {
    return {
      erro: 'Não conseguimos criar um endereço a partir desse nome. Experimente outro.',
    };
  }

  if (isReservedSlug(slug)) {
    return { erro: `O endereço "${slug}" está reservado. Experimente outro nome.` };
  }

  const db = createServiceClient();

  const { data: existente } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle();

  if (existente) {
    return {
      erro: `Já existe uma empresa em booking.totalmobi.pt/${slug}. Experimente outro nome.`,
    };
  }

  // ── A conta ────────────────────────────────────────────────────────────────
  const utilizador = await garantirUtilizador(db, parsed.data.email, parsed.data.palavraPasse, parsed.data.nome);

  if ('erro' in utilizador) return { erro: utilizador.erro };

  // ── O pagamento ────────────────────────────────────────────────────────────
  const cliente = obterStripe();
  if ('erro' in cliente) {
    console.error(`[registo] ${cliente.erro}`);
    return { erro: 'Pagamentos indisponíveis. Fale connosco.' };
  }

  const base = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://booking.totalmobi.pt';

  try {
    const sessao = await cliente.ok.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: preco.ok.priceId, quantity: 1 }],
      customer_email: parsed.data.email,

      success_url: `${base}/subscricao/obrigado?sessao={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/registo?plano=${preco.ok.plano.codigo}&periodo=${preco.ok.periodo}`,

      // Tudo o que o webhook precisa para criar a empresa. Nada aqui é segredo:
      // são metadados que o Stripe guarda e nos devolve. A palavra-passe **não**
      // vai — já foi usada para criar a conta e não tem nada que viajar.
      subscription_data: {
        metadata: {
          plan_code: preco.ok.plano.codigo,
          interval: preco.ok.periodo,
          user_id: utilizador.id,
          slug,
          display_name: parsed.data.empresa,
          email: parsed.data.email,
        },
      },

      tax_id_collection: { enabled: true },
      billing_address_collection: 'required',
      locale: 'pt',
    });

    if (!sessao.url) return { erro: 'Não foi possível abrir o pagamento.' };

    return { url: sessao.url };
  } catch (causa) {
    console.error('[registo] falha ao criar a sessão', causa);
    return { erro: 'Não foi possível abrir o pagamento.' };
  }
}

/**
 * A conta de quem está a subscrever.
 *
 * Se o email já existe — e existe com frequência, porque o Supabase é partilhado
 * com o CMS — reutiliza-se a conta em vez de rebentar. Mas **não se muda a
 * palavra-passe**: quem soubesse um email conseguiria reescrever a palavra-passe
 * de outra pessoa apenas começando um registo.
 */
async function garantirUtilizador(
  db: ReturnType<typeof createServiceClient>,
  email: string,
  palavraPasse: string,
  nome: string,
): Promise<{ id: string } | { erro: string }> {
  const { data: criado, error } = await db.auth.admin.createUser({
    email,
    password: palavraPasse,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });

  if (!error && criado.user) return { id: criado.user.id };

  // Já existe. Procura-se o id para se poder continuar — mas quem não souber a
  // palavra-passe antiga continua sem entrar, e é assim que tem de ser.
  const jaExiste =
    error?.status === 422 || (error?.message ?? '').toLowerCase().includes('already');

  if (!jaExiste) {
    console.error('[registo] não foi possível criar a conta', error);
    return { erro: 'Não foi possível criar a conta.' };
  }

  const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const encontrado = lista?.users.find((u) => u.email?.toLowerCase() === email);

  if (!encontrado) {
    return { erro: 'Já existe uma conta com este email. Entre e depois subscreva.' };
  }

  return { id: encontrado.id };
}
