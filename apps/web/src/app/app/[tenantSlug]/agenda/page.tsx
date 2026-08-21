import { notFound } from 'next/navigation';

import { EmptyState, PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

import { AgendaClient } from './agenda-client';

export const metadata = { title: 'Agenda' };
export const dynamic = 'force-dynamic';

/**
 * A agenda de um dia.
 *
 * O dia inteiro vem do servidor no primeiro render — não há um esqueleto a
 * piscar seguido de um pedido do browser. Quem abre a agenda de manhã quer
 * vê-la, não vê-la a chegar.
 *
 * O intervalo pedido vai das 00:00 UTC do dia até 36 horas depois, de propósito
 * folgado: em fusos a leste de Greenwich o dia local começa antes das 00:00 UTC,
 * e um intervalo justo cortaria as primeiras marcações da manhã.
 */
export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ data?: string; unidade?: string }>;
}) {
  const { tenantSlug } = await params;
  const filtros = await searchParams;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const { data: locations } = await context.client
    .from('locations')
    .select('id, name, timezone')
    .eq('tenant_id', context.tenantId)
    .is('archived_at', null)
    .eq('is_active', true)
    .order('sort_order');

  const unidades = locations ?? [];

  if (unidades.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <PageHeader title="Agenda" />
        <EmptyState
          title="Ainda não há unidades"
          description="A agenda pertence a uma unidade — é ela que define o fuso horário."
        />
      </main>
    );
  }

  const unidade = unidades.find((u) => u.id === filtros.unidade) ?? unidades[0]!;
  const data = filtros.data ?? new Date().toISOString().slice(0, 10);

  const inicio = new Date(`${data}T00:00:00Z`);
  const fim = new Date(inicio.getTime() + 36 * 3_600_000);

  const [{ data: marcacoes }, { data: equipa }, { data: horas }, { data: serv }, { data: politicas }] =
    await Promise.all([
      context.client.rpc('agenda', {
        p_location_id: unidade.id,
        p_from: inicio.toISOString(),
        p_to: fim.toISOString(),
      }),
      context.client
        .from('staff')
        .select('id, full_name, calendar_color')
        .eq('tenant_id', context.tenantId)
        .is('archived_at', null)
        .eq('is_active', true)
        .order('sort_order'),
      context.client
        .from('location_business_hours')
        .select('opens_at, closes_at')
        .eq('location_id', unidade.id),
      context.client
        .from('services')
        .select('id, name, duration_minutes')
        .eq('tenant_id', context.tenantId)
        .is('archived_at', null)
        .eq('is_active', true)
        .order('sort_order'),
      context.client
        .from('tenant_policies')
        .select('slot_granularity_minutes')
        .eq('tenant_id', context.tenantId)
        .maybeSingle(),
    ]);

  // A grelha começa e acaba no horário real da casa, não às 00:00. Uma agenda
  // que abre com oito horas de madrugada vazia obriga a rolar antes de ver
  // seja o que for.
  const minutos = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const aberturas = (horas ?? []).map((h) => minutos(h.opens_at));
  const fechos = (horas ?? []).map((h) => minutos(h.closes_at));

  const abre = aberturas.length > 0 ? Math.max(Math.min(...aberturas) - 30, 0) : 8 * 60;
  const fecha = fechos.length > 0 ? Math.min(Math.max(...fechos) + 30, 24 * 60) : 20 * 60;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
      <PageHeader
        title="Agenda"
        description={unidades.length > 1 ? unidade.name : undefined}
      />

      <AgendaClient
        tenantId={context.tenantId}
        tenantSlug={tenantSlug}
        locationId={unidade.id}
        timezone={unidade.timezone}
        data={data}
        equipa={(equipa ?? []).map((p) => ({
          id: p.id,
          nome: p.full_name,
          cor: p.calendar_color,
        }))}
        servicos={(serv ?? []).map((s) => ({
          id: s.id,
          nome: s.name,
          duracao: s.duration_minutes,
        }))}
        iniciais={marcacoes ?? []}
        podeGerir={canManage(context)}
        abreMinuto={abre}
        fechaMinuto={fecha}
        granularidade={politicas?.slot_granularity_minutes ?? 15}
      />
    </main>
  );
}
