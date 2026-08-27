import { notFound } from 'next/navigation';

import Link from 'next/link';

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

  /**
   * Os horários de **todas** as unidades, não só da primeira.
   *
   * Isto era um bug com dentes. O seletor deixava mudar de unidade, mas só
   * vinham as horas da primeira — a segunda aparecia **vazia mesmo quando
   * estava configurada**. E como `setLocationHours` faz `delete` seguido de
   * `insert`, bastava alguém abrir a segunda unidade, ver o vazio e carregar em
   * guardar para apagar o horário verdadeiro.
   *
   * O volume não justifica o risco: são sete dias vezes o número de unidades.
   */
  const idsUnidades = unidades.map((u) => u.id);

  const [{ data: locationHours }, { data: staffHours }, { data: exceptions }, { data: timeOff }] =
    await Promise.all([
      context.client
        .from('location_business_hours')
        .select('id, location_id, weekday, opens_at, closes_at')
        .in('location_id', idsUnidades)
        .order('weekday'),
      context.client
        .from('staff_working_hours')
        .select('id, staff_id, location_id, weekday, starts_at, ends_at, valid_from, valid_until')
        .in('location_id', idsUnidades),
      // Doze semanas para a frente: é o que a fita mostra, e um limite fixo de
      // 50 linhas cortava-a em silêncio numa clínica com muitas ausências.
      context.client
        .from('schedule_exceptions')
        .select('id, date, kind, starts_at, ends_at, reason, scope_tenant, location_id, staff_id')
        .eq('tenant_id', context.tenantId)
        .gte('date', new Date().toISOString().slice(0, 10))
        .lte(
          'date',
          new Date(Date.now() + 84 * 86_400_000).toISOString().slice(0, 10),
        )
        .order('date'),
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

      {/*
        O link para a ajuda vive aqui, e não só no menu.

        Esta é a página onde as pessoas encalham: quatro mecanismos que se
        sobrepõem, e uma regra de precedência que não se descobre a tentar —
        descobre-se quando um cliente marca num feriado. Quem está com a dúvida
        está nesta página, não no menu.
      */}
      <Link
        href={`/app/${tenantSlug}/ajuda`}
        className="mb-8 inline-flex items-center gap-2 rounded-(--radius-md) border border-(--line) px-4 py-2.5 text-(length:--text-sm) transition-colors duration-(--duration-fast) hover:bg-(--surface-sunken)"
      >
        <span aria-hidden>?</span>
        Exceções, ausências e feriados — qual usar em cada caso
      </Link>

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
