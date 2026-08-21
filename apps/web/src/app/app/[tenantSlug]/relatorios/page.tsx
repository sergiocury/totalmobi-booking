import { notFound } from 'next/navigation';

import { EmptyState, PageHeader } from '@totalmobi/ui';

import { loadTenantPage } from '@/lib/tenant-context';

import { Relatorio } from './relatorio';

export const metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

/**
 * Relatórios.
 *
 * **Nada de marcações em bruto chega aqui.** As duas funções do PostgreSQL
 * devolvem agregados — algumas dezenas de linhas — e é isso que atravessa a
 * rede. Um ano de uma clínica média são milhares de marcações com nomes e
 * telefones lá dentro; nenhum desses dados precisa de sair da base para se
 * desenhar uma barra.
 *
 * Medido em produção com 1578 marcações ao longo de um ano: **39,8 ms** de
 * execução para o relatório de doze meses.
 */
export default async function RelatoriosPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ unidade?: string; dias?: string }>;
}) {
  const { tenantSlug } = await params;
  const filtros = await searchParams;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const { data: unidades } = await context.client
    .from('locations')
    .select('id, name')
    .eq('tenant_id', context.tenantId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('sort_order');

  const lista = unidades ?? [];
  const unidade = lista.find((u) => u.id === filtros.unidade) ?? lista[0];

  if (!unidade) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <PageHeader title="Relatórios" />
        <EmptyState
          title="Ainda não há unidades"
          description="Os números pertencem a uma unidade — é ela que define o fuso horário."
        />
      </main>
    );
  }

  const dias = Math.min(Math.max(Number(filtros.dias) || 30, 7), 365);
  const ate = new Date();
  const de = new Date(ate.getTime() - dias * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [{ data: hoje }, { data: periodo }] = await Promise.all([
    context.client.rpc('report_today', { p_location_id: unidade.id }),
    context.client.rpc('report_period', {
      p_location_id: unidade.id,
      p_from: iso(de),
      p_to: iso(ate),
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Relatórios"
        description={lista.length > 1 ? unidade.name : undefined}
      />

      <Relatorio
        tenantSlug={tenantSlug}
        unidadeId={unidade.id}
        unidades={lista}
        dias={dias}
        hoje={hoje as never}
        periodo={periodo as never}
      />
    </main>
  );
}
