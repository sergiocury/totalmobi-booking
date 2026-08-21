import { notFound } from 'next/navigation';

import { PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

import { TeamManager } from './manager';

export const metadata = { title: 'Equipa' };
export const dynamic = 'force-dynamic';

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const [{ data: staff }, { data: services }, { data: links }] = await Promise.all([
    context.client
      .from('staff')
      .select(
        'id, full_name, job_title, email, calendar_color, is_active, accepts_online_booking, priority, sort_order',
      )
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .order('sort_order')
      .order('full_name'),
    context.client
      .from('services')
      .select('id, name, duration_minutes')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .order('name'),
    context.client.from('staff_services').select('staff_id, service_id').eq('is_active', true),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Equipa"
        description="Quem atende e o que cada um faz. Um profissional não precisa de conta para estar na agenda — só quem gere é que entra no painel."
      />

      <TeamManager
        tenantId={context.tenantId}
        tenantSlug={context.tenantSlug}
        staff={staff ?? []}
        services={services ?? []}
        links={links ?? []}
        canManage={canManage(context)}
      />
    </main>
  );
}
