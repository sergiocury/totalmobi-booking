import Link from 'next/link';

import { createServiceClient } from '@totalmobi/database/server';

import { estadoDosPrecos } from '@/lib/stripe/precos';
import { getPublicClient } from '@/lib/supabase/server';

export const metadata = { title: 'Estado do sistema' };

/**
 * Verificação de ligação do Milestone 1.
 *
 * Usa deliberadamente o cliente **anónimo**: o que interessa provar aqui é
 * exatamente o que um visitante sem sessão consegue ver. Se esta página
 * mostrasse os dois tenants do seed a alguém sem sessão, a RLS estaria errada
 * — e é precisamente por só mostrar as colunas públicas que sabemos que não está.
 */
export const dynamic = 'force-dynamic';

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const hasEnv =
    Boolean(process.env['NEXT_PUBLIC_SUPABASE_URL']) &&
    Boolean(process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

  checks.push({
    label: 'Variáveis de ambiente',
    ok: hasEnv,
    detail: hasEnv ? 'URL e chave anónima presentes' : 'Falta copiar .env.example para .env.local',
  });

  if (!hasEnv) return checks;

  const client = getPublicClient();

  const plans = await client.from('plans').select('code, name').order('sort_order');
  checks.push({
    label: 'Schema booking exposto na Data API',
    ok: !plans.error,
    detail: plans.error
      ? `${plans.error.code ?? 'erro'}: ${plans.error.message}`
      : `${plans.data?.length ?? 0} planos legíveis`,
  });

  const tenants = await client.from('tenants').select('slug, display_name, status');
  checks.push({
    label: 'Tenants públicos visíveis por anon',
    ok: !tenants.error,
    detail: tenants.error
      ? tenants.error.message
      : (tenants.data ?? []).map((t) => `${t.display_name} (${t.slug})`).join(' · ') || 'nenhum',
  });

  // A leitura tem de FALHAR ou vir vazia. `memberships` não tem política para
  // `anon`, e o privilégio de tabela também não lhe foi dado.
  /**
   * O Stripe.
   *
   * Nomeia as variáveis que faltam em vez de dizer só "não está configurado".
   * Quando o botão de um plano não funciona, a pergunta é sempre "porquê" — e a
   * resposta é quase sempre uma variável por preencher num dos ambientes.
   *
   * **Nunca mostra valores**, só se estão presentes. Os `price_id` não são
   * segredos, mas as chaves são, e uma página que mostrasse "presente" ao lado
   * do início de uma chave já estaria a dizer de mais.
   */
  const precos = estadoDosPrecos();
  const precosEmFalta = precos.filter((p) => !p.configurado);
  const temChave = Boolean(process.env['STRIPE_SECRET_KEY']);
  const temSegredoDoWebhook = Boolean(process.env['STRIPE_WEBHOOK_SECRET']);

  checks.push({
    label: 'Stripe — chave secreta',
    ok: temChave,
    detail: temChave
      ? `presente${process.env['STRIPE_SECRET_KEY']?.startsWith('sk_test_') ? ' (modo de teste)' : ' (modo real)'}`
      : 'falta STRIPE_SECRET_KEY',
  });

  // O prefixo de um segredo de assinatura é `whsec_` e é conhecimento público —
  // dizer que está lá não revela nada. Mas apanha o engano mais comum, que é
  // colar no campo errado a chave secreta ou o identificador do endpoint.
  const segredoDoWebhook = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
  const formaCerta = segredoDoWebhook.startsWith('whsec_');

  checks.push({
    label: 'Stripe — assinatura do webhook',
    ok: temSegredoDoWebhook && formaCerta,
    detail: !temSegredoDoWebhook
      ? 'falta STRIPE_WEBHOOK_SECRET — só existe depois de criar o endpoint no painel'
      : formaCerta
        ? 'presente, com a forma certa'
        : 'presente mas não começa por whsec_ — foi colado o valor errado',
  });

  /**
   * Chegou algum evento?
   *
   * É a pergunta que decide se uma compra vira empresa. Uma assinatura
   * configurada não prova entrega nenhuma: o endpoint pode não existir no
   * painel, pode existir sem os eventos certos, ou pode estar a apontar para
   * outro sítio. Só o registo prova.
   */
  /*
   * Esta verificação — e só esta — usa o cliente de serviço.
   *
   * O registo de webhooks é o diário interno de uma integração: o `anon` não
   * tem lá leitura, e não é para ter. Mas a versão anterior perguntava-lhe à
   * mesma, e o PostgREST respondia com um erro que o código deitava fora —
   * `data` a null, `count` a null, e a página a escrever «nenhum».
   *
   * «Não tenho permissão para saber» e «não chegou nada» apareciam com as
   * mesmas sete letras. Durante a primeira compra a sério havia quatro eventos
   * na tabela e esta página jurou que não havia nenhum, o que mandou a busca
   * para o lado errado: fui procurar um endpoint mal configurado no Stripe
   * quando o problema estava aqui dentro.
   *
   * Um diagnóstico que confunde ignorância com ausência é pior do que não
   * existir — o silêncio não engana ninguém, uma resposta errada engana.
   */
  const servico = createServiceClient();

  const eventos = await servico
    .from('stripe_webhook_events')
    .select('type, status, received_at')
    .order('received_at', { ascending: false })
    .limit(1);

  const { count, error: erroDaContagem } = await servico
    .from('stripe_webhook_events')
    .select('id', { count: 'exact', head: true });

  const falhou = eventos.error ?? erroDaContagem;
  const ultimo = eventos.data?.[0] ?? null;

  checks.push({
    label: 'Stripe — eventos recebidos',
    ok: !falhou && (count ?? 0) > 0,
    detail: falhou
      ? `não foi possível ler a tabela (${falhou.code ?? 'sem código'}) — isto é um problema desta página, não do Stripe`
      : ultimo
        ? `${count} recebidos · último: ${ultimo.type} (${ultimo.status}) em ${ultimo.received_at.slice(0, 16).replace('T', ' ')}`
        : 'nenhum — o endpoint pode não estar criado no painel do Stripe, ou não ter os eventos certos',
  });

  checks.push({
    label: 'Stripe — preços',
    ok: precosEmFalta.length === 0,
    detail:
      precosEmFalta.length === 0
        ? `${precos.length} de ${precos.length} configurados`
        : `faltam ${precosEmFalta.length}: ${precosEmFalta.map((p) => p.variavel).join(', ')}`,
  });

  const memberships = await client.from('memberships').select('id').limit(1);
  const isolated = Boolean(memberships.error) || (memberships.data ?? []).length === 0;
  checks.push({
    label: 'Isolamento: anon não lê memberships',
    ok: isolated,
    detail: isolated
      ? 'Bloqueado pela RLS, como esperado'
      : '⚠️ FUGA: anon leu memberships. Rever a migration 0006.',
  });

  return checks;
}

export default async function StatusPage() {
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-(--color-ink-muted) hover:underline">
        ← Início
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Estado do sistema</h1>
      <p className="mt-2 text-(--color-ink-muted)">
        {allOk ? 'Tudo a funcionar.' : 'Há verificações por resolver.'}
      </p>

      <ul className="mt-8 divide-y divide-(--color-line) border-y border-(--color-line)">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-4 py-4">
            <span aria-hidden className="mt-0.5 text-lg leading-none">
              {check.ok ? '✅' : '❌'}
            </span>
            <div className="min-w-0">
              <p className="font-medium">
                {check.label}
                <span className="sr-only">{check.ok ? ': ok' : ': falhou'}</span>
              </p>
              <p className="mt-1 text-sm break-words text-(--color-ink-muted)">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
