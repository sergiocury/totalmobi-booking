import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card, InteractiveCard, PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

/**
 * Resumo da empresa.
 *
 * O acesso já foi validado e registado no `layout.tsx` — esta página só precisa
 * de mostrar. Se `loadTenantPage` devolvesse `null` aqui, seria um bug: o
 * layout teria deixado passar algo que não devia.
 *
 * Mostra o que **falta configurar** em vez de números vazios. Uma empresa nova
 * não quer saber que tem 0 marcações; quer saber qual é o passo seguinte.
 */
export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const [servicos, equipa, unidades] = await Promise.all([
    context.client
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null),
    context.client
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null),
    context.client
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null),
  ]);

  const passos = [
    {
      href: `/app/${tenantSlug}/unidades`,
      label: 'Unidades',
      count: unidades.count ?? 0,
      texto: 'Onde se atende, com morada e fuso horário.',
    },
    {
      href: `/app/${tenantSlug}/servicos`,
      label: 'Serviços',
      count: servicos.count ?? 0,
      texto: 'O que se vende, quanto demora e quanto custa.',
    },
    {
      href: `/app/${tenantSlug}/equipa`,
      label: 'Equipa',
      count: equipa.count ?? 0,
      texto: 'Quem atende e o que cada um faz.',
    },
  ];

  const porFazer = passos.filter((p) => p.count === 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title={context.displayName}
        description={
          context.role
            ? undefined
            : 'Está a ver esta empresa como administrador da plataforma.'
        }
        actions={context.role ? undefined : <Badge tone="warning">Plataforma</Badge>}
      />

      {porFazer.length > 0 && canManage(context) ? (
        <Card className="mb-8 px-6 py-5">
          <h2 className="font-medium">Falta configurar</h2>
          <p className="mt-1 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-muted)">
            A agenda só abre quando houver pelo menos uma unidade, um serviço e um profissional
            que o execute.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {porFazer.map((passo) => (
              <li key={passo.href}>
                <Link
                  href={passo.href}
                  className="inline-flex rounded-(--radius-full) border border-(--line-strong) px-3.5 py-1.5 text-(length:--text-sm) font-medium hover:bg-(--surface-sunken)"
                >
                  {passo.label} →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {passos.map((passo) => (
          <InteractiveCard key={passo.href}>
            <Link href={passo.href} className="block px-5 py-5">
              <p className="text-(length:--text-3xl) leading-(--leading-tight) font-semibold tracking-(--tracking-tight)">
                {passo.count}
              </p>
              <p className="mt-1 font-medium">{passo.label}</p>
              <p className="mt-1 text-(length:--text-sm) text-pretty text-(--ink-muted)">
                {passo.texto}
              </p>
            </Link>
          </InteractiveCard>
        ))}
      </div>

      <Card className="mt-8 px-6 py-8">
        <h2 className="font-medium">Agenda e marcações</h2>
        <p className="mt-2 max-w-prose text-pretty text-(--ink-muted)">
          Chegam nos milestones 7 a 10: o motor de disponibilidade, a criação atómica de
          marcações, a página pública e o calendário. O catálogo que configurar aqui é o que
          esses vão usar.
        </p>
      </Card>
    </main>
  );
}
