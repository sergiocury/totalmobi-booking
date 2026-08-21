import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createServiceClient } from '@totalmobi/database/server';
import { formatInZone } from '@totalmobi/shared';
import { Badge, Button, Card, PageHeader } from '@totalmobi/ui';

import { getFeatureStates } from '@/lib/features';

import { FeatureList } from './features';
import { StatusControls } from './status';
import { enterTenant } from '../viewing-actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }> = {
  trial: { label: 'Período de teste', tone: 'brand' },
  active: { label: 'Ativa', tone: 'success' },
  past_due: { label: 'Pagamento em atraso', tone: 'warning' },
  suspended: { label: 'Suspensa', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const client = createServiceClient();

  const { data: tenant } = await client
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant) notFound();

  const [{ data: locations }, features, { data: members }] = await Promise.all([
    client
      .from('locations')
      .select('id, name, city, timezone, is_active')
      .eq('tenant_id', tenantId)
      .order('sort_order'),
    getFeatureStates(tenantId),
    client.from('memberships').select('id, role, accepted_at').eq('tenant_id', tenantId),
  ]);

  const estado = STATUS[tenant.status] ?? { label: tenant.status, tone: 'neutral' as const };
  const aceites = (members ?? []).filter((m) => m.accepted_at).length;
  const pendentes = (members ?? []).length - aceites;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <Link href="/console" className="text-(length:--text-sm) text-(--ink-muted) hover:underline">
        ← Empresas
      </Link>

      <div className="mt-6">
        <PageHeader
          eyebrow={tenant.code}
          title={tenant.display_name}
          description={`booking.totalmobi.pt/${tenant.slug}`}
          actions={
            <>
              <Badge tone={estado.tone}>{estado.label}</Badge>
              {tenant.status !== 'suspended' && tenant.status !== 'cancelled' ? (
                <form action={enterTenant.bind(null, tenant.id)}>
                  <Button type="submit" variant="secondary" size="sm">
                    Ver esta conta
                  </Button>
                </form>
              ) : null}
            </>
          }
        />
      </div>

      <section className="mb-10">
        <Card className="divide-y divide-(--line)">
          {[
            ['Plano', tenant.plan_code],
            ['Segmento', tenant.segment],
            ['Email', tenant.email ?? '—'],
            ['Fuso por omissão', tenant.default_timezone],
            ['Idioma', tenant.default_locale],
            ['Domínio próprio', tenant.custom_domain ?? '—'],
            [
              'Criada em',
              formatInZone(new Date(tenant.created_at), tenant.default_timezone, 'pt-PT', 'date'),
            ],
            [
              'Equipa',
              pendentes > 0
                ? `${aceites} ${aceites === 1 ? 'membro' : 'membros'}, ${pendentes} por aceitar`
                : `${aceites} ${aceites === 1 ? 'membro' : 'membros'}`,
            ],
            [
              'Unidades',
              (locations ?? []).length === 0
                ? 'nenhuma'
                : (locations ?? []).map((l) => l.name).join(' · '),
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap gap-x-4 gap-y-1 px-6 py-3.5">
              <dt className="w-40 shrink-0 text-(length:--text-sm) text-(--ink-muted)">{label}</dt>
              <dd className="min-w-0 text-(length:--text-sm)">{value}</dd>
            </div>
          ))}
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Funcionalidades
        </h2>
        <p className="mb-5 max-w-prose text-pretty text-(--ink-muted)">
          O plano <strong>{tenant.plan_code}</strong> define o ponto de partida. Cada
          funcionalidade pode ser ligada ou desligada para esta empresa em particular — e a
          consola mostra sempre de onde vem o valor.
        </p>
        <FeatureList tenantId={tenant.id} states={features} />
      </section>

      <section>
        <h2 className="mb-2 text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">
          Estado da conta
        </h2>
        <p className="mb-5 max-w-prose text-pretty text-(--ink-muted)">
          Suspender fecha o painel <strong>e</strong> a página pública de marcação. Os dados ficam
          intactos e voltam assim que a conta for reativada.
        </p>
        <StatusControls
          tenantId={tenant.id}
          current={tenant.status}
          hasCustomDomain={Boolean(tenant.custom_domain)}
        />
      </section>
    </main>
  );
}
