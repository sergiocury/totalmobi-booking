import { notFound } from 'next/navigation';

import { getAvailableSlots } from '@totalmobi/availability';
import {
  loadAvailabilityDataset,
  toAvailabilityInput,
  type AvailabilityDataset,
} from '@totalmobi/database';
import { formatInZone, WEEKDAY_LABELS, weekdayOfDate } from '@totalmobi/shared';
import { Badge, Card, EmptyState, PageHeader } from '@totalmobi/ui';

import { loadTenantPage } from '@/lib/tenant-context';

/**
 * Página de inspeção do motor de disponibilidade.
 *
 * Não é um ecrã de produto — o produto vem no M9. É o instrumento que mostra,
 * lado a lado, **o que a base de dados devolveu** e **o que o motor concluiu**.
 *
 * Existe porque um motor de disponibilidade falha sempre da mesma forma: dá
 * uma lista de horas plausível que está errada por uma razão invisível — um
 * horário que caducou, uma exceção de outro âmbito, um fuso mal convertido.
 * Ver as duas coisas ao mesmo tempo transforma meia hora de `console.log` num
 * relance.
 */

export const metadata = { title: 'Disponibilidade' };
export const dynamic = 'force-dynamic';

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AvailabilityDebugPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ unidade?: string; servico?: string; data?: string }>;
}) {
  const { tenantSlug } = await params;
  const filtros = await searchParams;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const [{ data: locations }, { data: services }] = await Promise.all([
    context.client
      .from('locations')
      .select('id, name, timezone')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .eq('is_active', true)
      .order('sort_order'),
    context.client
      .from('services')
      .select('id, name, duration_minutes')
      .eq('tenant_id', context.tenantId)
      .is('archived_at', null)
      .eq('is_active', true)
      .eq('bookable_online', true)
      .order('sort_order'),
  ]);

  const unidades = locations ?? [];
  const servicos = services ?? [];

  if (unidades.length === 0 || servicos.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <PageHeader title="Disponibilidade" />
        <EmptyState
          title="Faltam dados para calcular"
          description="É preciso pelo menos uma unidade e um serviço marcável online."
        />
      </main>
    );
  }

  const unidade = unidades.find((u) => u.id === filtros.unidade) ?? unidades[0]!;
  const servico = servicos.find((s) => s.id === filtros.servico) ?? servicos[0]!;
  const data = filtros.data ?? hoje();

  const dataset = await loadAvailabilityDataset(context.client, {
    locationId: unidade.id,
    serviceId: servico.id,
    from: data,
    to: data,
  });

  const agora = new Date();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Disponibilidade"
        description="Ferramenta interna: o dataset que veio da base de dados e os slots que o motor calculou a partir dele."
      />

      <form method="get" className="mb-8 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-(length:--text-sm)">
          <span className="text-(--ink-muted)">Unidade</span>
          <select
            name="unidade"
            defaultValue={unidade.id}
            className="rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2"
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-(length:--text-sm)">
          <span className="text-(--ink-muted)">Serviço</span>
          <select
            name="servico"
            defaultValue={servico.id}
            className="rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2"
          >
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_minutes} min
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-(length:--text-sm)">
          <span className="text-(--ink-muted)">Data</span>
          <input
            type="date"
            name="data"
            defaultValue={data}
            className="rounded-(--radius-sm) border border-(--line-strong) bg-(--surface) px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="rounded-(--radius-sm) bg-(--brand) px-4 py-2 text-(length:--text-sm) font-medium text-(--brand-ink)"
        >
          Calcular
        </button>
      </form>

      {!dataset.ok ? (
        <EmptyState
          title="A base de dados não devolveu dataset"
          description={dataset.error.message}
        />
      ) : (
        <Resultado dataset={dataset.value} data={data} agora={agora} />
      )}
    </main>
  );
}

function Resultado({
  dataset,
  data,
  agora,
}: {
  dataset: AvailabilityDataset;
  data: string;
  agora: Date;
}) {
  const entrada = toAvailabilityInput(dataset, data, agora);
  const resultado = getAvailableSlots(entrada);

  const diaDaSemana = WEEKDAY_LABELS[weekdayOfDate(data)];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-medium">
          Slots — {diaDaSemana}, {data}
        </h2>

        {resultado.slots.length === 0 ? (
          <Card className="px-5 py-4">
            <p className="text-(length:--text-sm) text-(--ink-muted)">
              Sem disponibilidade. Motivo apurado pelo motor:{' '}
              <code className="text-(--ink)">{resultado.reason}</code>
            </p>
          </Card>
        ) : (
          <Card className="px-5 py-4">
            <p className="mb-3 text-(length:--text-sm) text-(--ink-muted)">
              {resultado.slots.length} slots · fuso {dataset.timezone}
            </p>
            <ul className="flex flex-wrap gap-2">
              {resultado.slots.map((slot) => (
                <li key={slot.start.toISOString()}>
                  <Badge>
                    {formatInZone(slot.start, dataset.timezone, 'pt-PT', 'time')}
                    <span className="ml-1.5 text-(--ink-subtle)">
                      {slot.staffIds.length === dataset.staff.length
                        ? 'todos'
                        : `${slot.staffIds.length}/${dataset.staff.length}`}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-medium">O que a base de dados devolveu</h2>
        <Card className="px-5 py-4">
          <dl className="grid gap-x-8 gap-y-2 text-(length:--text-sm) sm:grid-cols-2">
            <Linha termo="Serviço">
              {dataset.service.name} · {dataset.service.durationMinutes} min
              {dataset.service.bufferBeforeMinutes || dataset.service.bufferAfterMinutes
                ? ` (+${dataset.service.bufferBeforeMinutes}/${dataset.service.bufferAfterMinutes} buffer)`
                : ''}
            </Linha>
            <Linha termo="Capacidade">{dataset.service.capacity}</Linha>
            <Linha termo="Grelha">{dataset.policy.slotGranularityMinutes} min</Linha>
            <Linha termo="Antecedência">
              {dataset.policy.minAdvanceMinutes} min a {dataset.policy.maxAdvanceDays} dias
            </Linha>
            <Linha termo="Horário da unidade">
              {dataset.locationHours.filter((h) => h.weekday === weekdayOfDate(data)).length}{' '}
              períodos neste dia
            </Linha>
            <Linha termo="Exceções">{dataset.exceptions.length}</Linha>
          </dl>

          <ul className="mt-4 space-y-2 border-t border-(--line) pt-4 text-(length:--text-sm)">
            {dataset.staff.map((pessoa) => (
              <li key={pessoa.staffId} className="flex flex-wrap gap-x-4 text-(--ink-muted)">
                <span className="font-medium text-(--ink)">{pessoa.fullName}</span>
                <span>{pessoa.durationMinutes} min</span>
                <span>{pessoa.workingHours.length} linhas de horário</span>
                <span>{pessoa.timeOff.length} ausências</span>
                <span>{pessoa.busy.length} marcações</span>
              </li>
            ))}
          </ul>

          {dataset.staff.length === 0 ? (
            <p className="mt-4 text-(length:--text-sm) text-(--ink-muted)">
              Nenhum profissional presta este serviço nesta unidade.
            </p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}

function Linha({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-(--ink-muted)">{termo}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
