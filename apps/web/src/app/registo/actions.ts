'use server';

import { createServiceClient } from '@totalmobi/database/server';
import { isReservedSlug, slugify, slugSchema } from '@totalmobi/shared';
import { z } from 'zod';

import { obterStripe } from '@/lib/stripe/cliente';
import { resolverPreco, type Periodicidade } from '@/lib/stripe/precos';
import { getSessionClient } from '@/lib/supabase/server';

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
 * NÃO SE REUTILIZA UMA CONTA EM SILÊNCIO
 *
 * A versão anterior fazia o contrário: se o email já existisse, aproveitava a
 * conta e seguia em frente sem mudar a palavra-passe. A intenção de segurança
 * estava certa — quem soubesse um email alheio não pode reescrever-lhe a
 * palavra-passe começando um registo. Mas faltava a outra metade: **dizer à
 * pessoa que a palavra-passe que acabou de escrever não vale nada**.
 *
 * O que aconteceu a sério, a 26/08: registo com `sergio@totalmobi.com.br`,
 * palavra-passe nova escrita no formulário, pagamento feito, empresa criada — e
 * depois impossível entrar, porque a palavra-passe verdadeira era a de uma
 * conta criada em março, no CMS. O formulário pediu uma coisa que ignorou, e a
 * cobrança seguiu na mesma.
 *
 * Este risco é maior aqui do que na maioria dos produtos: o pool de
 * `auth.users` é **partilhado com o Totalmobi CMS** (ver ARCHITECTURE.md §4).
 * Um email «novo» para o Booking pode ter conta desde há meses.
 *
 * Agora há dois caminhos, e nenhum deles cobra antes de estar resolvido:
 *
 * 1. **Email sem conta** — cria-se, com a palavra-passe escrita. Caso normal.
 * 2. **Email com conta** — se a sessão atual já for dessa pessoa, segue-se sem
 *    tocar na palavra-passe (é o dono a comprar uma segunda empresa, coisa
 *    legítima). Se não for, pára-se e manda-se entrar primeiro.
 *
 * O caso 2 revela que aquele email tem conta. É um preço real e assumido: a
 * alternativa é aceitar dinheiro de alguém que vai ficar de fora da própria
 * conta, e isso é pior do que a enumeração de emails num registo pago.
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

  const jaExiste =
    error?.status === 422 || (error?.message ?? '').toLowerCase().includes('already');

  if (!jaExiste) {
    console.error('[registo] não foi possível criar a conta', error);
    return { erro: 'Não foi possível criar a conta.' };
  }

  // É o próprio, já com sessão aberta? Então é o dono a comprar outra empresa.
  const sessao = await getSessionClient();
  const { data: quemEsta } = await sessao.auth.getUser();

  if (quemEsta.user?.email?.toLowerCase() === email) {
    return { id: quemEsta.user.id };
  }

  return {
    erro:
      'Já existe uma conta com este email. Inicie sessão primeiro e volte a esta página — ' +
      'se não se lembrar da palavra-passe, pode entrar com um link enviado por email.',
  };
}
