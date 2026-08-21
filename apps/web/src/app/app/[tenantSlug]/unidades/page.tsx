import { notFound } from 'next/navigation';

import { Badge, Card, EmptyState, PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

export const metadata = { title: 'Unidades' };
export const dynamic = 'force-dynamic';

export default async function LocationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const { data: locations } = await context.client
    .from('locations')
    .select('id, name, slug, address_line1, postal_code, city, timezone, phone_e164, is_active, is_default')
    .eq('tenant_id', context.tenantId)
    .is('archived_at', null)
    .order('sort_order');

  const lista = locations ?? [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Unidades"
        description="Onde se atende. O fuso horário pertence à unidade e não à empresa — uma rede com Lisboa e São Paulo precisa dos dois."
      />

      {lista.length === 0 ? (
        <EmptyState
          title="Ainda não há unidades"
          description={
            canManage(context)
              ? 'Uma empresa precisa de pelo menos uma unidade para poder ter agenda.'
              : 'Quem gere a empresa ainda não configurou as unidades.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {lista.map((local) => (
            <li key={local.id}>
              <Card className="px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{local.name}</span>
                      {local.is_default ? <Badge tone="brand">Principal</Badge> : null}
                      {!local.is_active ? <Badge tone="neutral">Inativa</Badge> : null}
                    </div>
                    <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                      {[local.address_line1, local.postal_code, local.city]
                        .filter(Boolean)
                        .join(', ') || 'sem morada'}
                    </p>
                    <p className="mt-0.5 text-(length:--text-sm) text-(--ink-subtle)">
                      {local.timezone}
                      {local.phone_e164 ? ` · ${local.phone_e164}` : ''}
                    </p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 max-w-prose text-(length:--text-sm) text-pretty text-(--ink-subtle)">
        Criar e editar unidades pela interface chega com os horários, no Milestone 6 — é aí que
        a unidade passa a ter comportamento e não só morada.
      </p>
    </main>
  );
}
