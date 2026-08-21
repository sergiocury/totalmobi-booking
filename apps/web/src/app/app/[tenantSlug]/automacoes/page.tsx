import { notFound } from 'next/navigation';

import { Card, PageHeader } from '@totalmobi/ui';

import { canManage, loadTenantPage } from '@/lib/tenant-context';

import { AutomacoesManager } from './manager';

export const metadata = { title: 'Automações' };
export const dynamic = 'force-dynamic';

/**
 * O que o sistema envia, e a quem.
 *
 * Duas coisas neste ecrã, e a segunda é a que ganha confiança: as **regras**
 * (o que sai, por onde, com que antecedência) e o **log** (o que saiu mesmo).
 *
 * Um sistema de notificações sem log é uma caixa preta — quando o cliente diz
 * "não recebi nada", não há forma de saber se o email saiu, falhou, ou nunca
 * chegou a ser planeado. Com log, a resposta demora dez segundos.
 */
export default async function AutomacoesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await loadTenantPage(tenantSlug);

  if (!context) notFound();

  const [{ data: regras }, { data: envios }] = await Promise.all([
    context.client
      .from('notification_rules')
      .select('id, type, channel, offset_minutes, is_active')
      .eq('tenant_id', context.tenantId)
      .order('type'),
    context.client
      .from('notification_jobs')
      .select('id, type, channel, status, scheduled_for, sent_at, attempts, error')
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <PageHeader
        title="Automações"
        description="O que o sistema envia aos seus clientes, e o registo do que saiu."
      />

      {!canManage(context) ? (
        <Card className="px-5 py-4">
          <p className="text-(length:--text-sm) text-(--ink-muted)">
            Só quem gere a empresa pode alterar automações.
          </p>
        </Card>
      ) : null}

      <AutomacoesManager
        tenantId={context.tenantId}
        tenantSlug={tenantSlug}
        regras={regras ?? []}
        envios={envios ?? []}
        podeGerir={canManage(context)}
      />
    </main>
  );
}
