import { notFound } from 'next/navigation';

import { PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

import { ServicesManager } from './manager';

export const metadata = { title: 'Serviços' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  // O layout já tratou a recusa; chegar aqui sem contexto seria um bug.
  if (!context) notFound();

  const { data: services } = await context.client
    .from('services')
    .select(
      'id, name, slug, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, price, currency, capacity, is_active, bookable_online, requires_confirmation, sort_order',
    )
    .eq('tenant_id', context.tenantId)
    .is('archived_at', null)
    .order('sort_order')
    .order('name');

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Serviços"
        description="O que a empresa vende, quanto tempo demora e quanto custa. A duração e os buffers são o que o motor de disponibilidade usa para calcular horas livres."
      />

      <ServicesManager
        tenantId={context.tenantId}
        tenantSlug={context.tenantSlug}
        services={services ?? []}
        canManage={canManage(context)}
      />
    </main>
  );
}
