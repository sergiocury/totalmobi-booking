import { notFound } from 'next/navigation';

import { EmptyState, PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

import { SchedulesManager } from './manager';

export const metadata = { title: 'Horários' };
export const dynamic = 'force-dynamic';

export default async function SchedulesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const [{ data: locations }, { data: staff }] = await Promise.all([
    context.client
      .from('locations')
      .select('id, name, timezone')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .eq('is_active', true)
      .order('sort_order'),
    context.client
      .from('staff')
      .select('id, full_name, calendar_color')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .eq('is_active', true)
      .order('sort_order')
      .order('full_name'),
  ]);

  const unidades = locations ?? [];
  const equipa = staff ?? [];

  if (unidades.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
        <PageHeader title="Horários" />
        <EmptyState
          title="Ainda não há unidades"
          description="O horário pertence a uma unidade — é ela que define o fuso horário. Crie primeiro uma unidade."
        />
      </main>
    );
  }

  const primeira = unidades[0]!;

  const [{ data: locationHours }, { data: staffHours }, { data: exceptions }, { data: timeOff }] =
    await Promise.all([
      context.client
        .from('location_business_hours')
        .select('id, location_id, weekday, opens_at, closes_at')
        .eq('location_id', primeira.id)
        .order('weekday'),
      context.client
        .from('staff_working_hours')
        .select('id, staff_id, location_id, weekday, starts_at, ends_at, valid_from, valid_until')
        .eq('location_id', primeira.id),
      context.client
        .from('schedule_exceptions')
        .select('id, date, kind, starts_at, ends_at, reason, scope_tenant, location_id, staff_id')
        .eq('tenant_id', context.tenantId)
        .gte('date', new Date().toISOString().slice(0, 10))
        .order('date')
        .limit(50),
      context.client
        .from('staff_time_off')
        .select('id, staff_id, starts_at, ends_at, kind, reason')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .limit(50),
    ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Horários"
        description="Quando a unidade abre e quando cada profissional atende. O motor de disponibilidade parte daqui — sem horário, não há horas para oferecer."
      />

      <SchedulesManager
        tenantId={context.tenantId}
        tenantSlug={context.tenantSlug}
        locations={unidades}
        staff={equipa}
        locationHours={locationHours ?? []}
        staffHours={staffHours ?? []}
        exceptions={exceptions ?? []}
        timeOff={timeOff ?? []}
        canManage={canManage(context)}
      />
    </main>
  );
}
