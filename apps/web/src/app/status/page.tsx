import Link from 'next/link';

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
