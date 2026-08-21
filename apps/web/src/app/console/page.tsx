import Link from 'next/link';

import { createServiceClient } from '@totalmobi/database/server';
import { Badge, Button, EmptyState, InteractiveCard, PageHeader } from '@totalmobi/ui';

export const metadata = { title: 'Empresas' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }> = {
  trial: { label: 'Período de teste', tone: 'brand' },
  active: { label: 'Ativa', tone: 'success' },
  past_due: { label: 'Pagamento em atraso', tone: 'warning' },
  suspended: { label: 'Suspensa', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

/**
 * Lista de empresas da plataforma.
 *
 * Lê com `service_role` porque é exatamente isso que a consola é: a vista de
 * quem está acima dos tenants. A autorização já foi feita no `layout.tsx`, que
 * devolve 404 a quem não seja administrador da plataforma.
 */
export default async function ConsolePage() {
  const client = createServiceClient();

  const [{ data: tenants }, { data: counts }] = await Promise.all([
    client
      .from('tenants')
      .select('id, slug, code, display_name, status, plan_code, created_at, suspension_reason')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    client.from('locations').select('tenant_id'),
  ]);

  const unidadesPorTenant = new Map<string, number>();
  for (const row of counts ?? []) {
    unidadesPorTenant.set(row.tenant_id, (unidadesPorTenant.get(row.tenant_id) ?? 0) + 1);
  }

  const lista = tenants ?? [];
  const ativas = lista.filter((t) => t.status === 'active' || t.status === 'trial').length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <PageHeader
        title="Empresas"
        description={
          lista.length === 0
            ? undefined
            : `${lista.length} ${lista.length === 1 ? 'empresa' : 'empresas'}, ${ativas} a operar.`
        }
        actions={
          <Button asChild>
            <Link href="/console/nova">Nova empresa</Link>
          </Button>
        }
      />

      {lista.length === 0 ? (
        <EmptyState
          title="Ainda não há empresas"
          description="Crie a primeira e ela fica disponível em booking.totalmobi.pt com o identificador que escolher."
          action={
            <Button asChild>
              <Link href="/console/nova">Criar empresa</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {lista.map((tenant) => {
            const estado = STATUS[tenant.status] ?? { label: tenant.status, tone: 'neutral' as const };
            const unidades = unidadesPorTenant.get(tenant.id) ?? 0;

            return (
              <li key={tenant.id}>
                <InteractiveCard>
                  <Link href={`/console/${tenant.id}`} className="block px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.display_name}</p>
                        <p className="mt-1 text-(length:--text-sm) text-(--ink-muted)">
                          <code>{tenant.code}</code> · /{tenant.slug} · plano {tenant.plan_code} ·{' '}
                          {unidades} {unidades === 1 ? 'unidade' : 'unidades'}
                        </p>
                        {tenant.suspension_reason ? (
                          <p className="mt-1.5 text-(length:--text-sm) text-(--danger)">
                            {tenant.suspension_reason}
                          </p>
                        ) : null}
                      </div>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                    </div>
                  </Link>
                </InteractiveCard>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
