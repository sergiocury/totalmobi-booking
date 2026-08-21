import { notFound } from 'next/navigation';

import { EmptyState, PageHeader } from '@totalmobi/ui';

import { loadTenantPage } from '@/lib/tenant-context';

import { Conversa } from './conversa';

export const metadata = { title: 'Simulador' };
export const dynamic = 'force-dynamic';

/**
 * Testar o assistente sem gastar mensagens reais.
 *
 * Uma mensagem de WhatsApp custa dinheiro à Meta e chega a um telemóvel de
 * alguém. Afinar um bot a mandar mensagens a sério é caro e arriscado — basta
 * um engano para um cliente receber "a sua marcação foi cancelada".
 */
export default async function SimuladorPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const { data: unidades } = await context.client
    .from('locations')
    .select('id, name')
    .eq('tenant_id', context.tenantId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('sort_order');

  const unidade = (unidades ?? [])[0];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Simulador"
        description="A mesma conversa que o WhatsApp vai ter, sem enviar nada a ninguém."
      />

      {!unidade ? (
        <EmptyState
          title="Falta uma unidade"
          description="O simulador procura horas reais, e as horas pertencem a uma unidade."
        />
      ) : (
        <Conversa
          tenantId={context.tenantId}
          locationId={unidade.id}
          nomeDaEmpresa={context.displayName}
        />
      )}
    </main>
  );
}
